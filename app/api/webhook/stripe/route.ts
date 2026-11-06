import { after, NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/payments'
import { recordDonation, createToken } from '@/lib/donations'
import { sendReceipt } from '@/lib/email'
import { cleanChannel, defaultColorFor, validateColor } from '@/lib/validate'
import { ANON_LABEL } from '@/lib/config'
import { pathFromPublicUrl } from '@/lib/photos'
import { isLocale } from '@/i18n/config'
import { defaultTenant, getOrg, getVitrail, orgBaseUrl } from '@/lib/tenant'
import { applyRefund } from '@/lib/refunds'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) return NextResponse.json({ error: 'Webhook non configuré' }, { status: 400 }) // i18n-ok : réponse à Stripe, pas au visiteur

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (e) {
    console.error('Signature du webhook invalide :', (e as Error).message)
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') return NextResponse.json({ received: true })

    const m = session.metadata ?? {}

    // Où ranger le don : l'organisme et le vitrail inscrits dans le paiement. Sans métadonnées (paiement commencé avant
    // la bascule), c'est l'organisme par défaut. Un vitrail qui n'appartient pas à l'organisme est une anomalie : on
    // refuse (500, Stripe réessaiera et le tableau de bord le montrera) plutôt que de ranger un don au mauvais endroit.
    // Un vitrail clos reçoit quand même le don : il a été payé, il doit être consigné.
    let orgId: string | undefined
    let vitrailId: string | undefined
    let baseUrl = orgBaseUrl(null)
    if (m.orgId && m.vitrailId) {
      const org = await getOrg(m.orgId)
      const vitrail = org ? await getVitrail(org.id, m.vitrailId) : null
      if (!org || !vitrail) {
        console.error('Paiement avec un vitrail qui n\'appartient pas à l\'organisme :', session.id, m.orgId, m.vitrailId)
        return NextResponse.json({ error: 'Vitrail inconnu' }, { status: 500 }) // i18n-ok : réponse à Stripe
      }
      orgId = org.id
      vitrailId = vitrail.id
      baseUrl = orgBaseUrl(org.slug)
    } else {
      const fallback = await defaultTenant()
      if (!fallback) return NextResponse.json({ error: 'Organisme par défaut introuvable' }, { status: 500 }) // i18n-ok : réponse à Stripe
      orgId = fallback.org.id
      vitrailId = fallback.vitrail.id
      baseUrl = orgBaseUrl(fallback.org.slug)
    }
    const email = (m.email || session.customer_details?.email || '').trim().toLowerCase()
    if (!email || !session.amount_total) {
      console.error('Session sans courriel ou sans montant :', session.id)
      return NextResponse.json({ received: true })
    }
    const color = validateColor(m.color)
    // Frais couverts par le donateur : payés, mais hors du don (morceau et total gardent des chiffres ronds)
    const fee = parseInt(m.feeCents ?? '', 10)
    const feeCents = Number.isFinite(fee) && fee > 0 && fee < session.amount_total ? fee : 0

    try {
      const result = await recordDonation({
        organizationId: orgId,
        vitrailId,
        email,
        profile: {
          showName: m.showName === '1',
          name: m.name || ANON_LABEL,
          message: m.message || null,
          quoteConsent: m.quote === '1' && !!m.message,
          photoUrl: pathFromPublicUrl(m.photo) ? m.photo : null,
        },
        color: color.ok ? color.value : defaultColorFor(email),
        amountCents: session.amount_total - feeCents,
        feeCents,
        source: 'stripe',
        providerRef: session.id,
        channel: cleanChannel(m.channel),
        locale: isLocale(m.lang) ? m.lang : undefined,
      })
      if (!result.duplicate) {
        // Le courriel est un confort : un échec ne doit pas faire rejouer le webhook (le don est déjà enregistré),
        // ni retarder la réponse à Stripe : il part après.
        const locale = isLocale(m.lang) ? m.lang : 'fr'
        const { donorId } = result
        const amountCents = session.amount_total
        after(async () => {
          try {
            await sendReceipt({ to: email, amountCents, token: await createToken(donorId), locale, donorId, organizationId: orgId, baseUrl })
          } catch (e) {
            console.error('Courriel de reçu non envoyé :', e)
          }
        })
      }
    } catch (e) {
      console.error('Enregistrement du don échoué :', e)
      return NextResponse.json({ error: 'Enregistrement échoué' }, { status: 500 }) // i18n-ok : réponse à Stripe, pas au visiteur
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    if (!intent) return NextResponse.json({ received: true })
    try {
      // Le don est rangé sous la session Checkout : on la retrouve par le paiement
      const sessions = await getStripe().checkout.sessions.list({ payment_intent: intent, limit: 1 })
      const sessionId = sessions.data[0]?.id
      if (!sessionId) return NextResponse.json({ received: true })
      const outcome = await applyRefund(sessionId, charge.amount, charge.amount_refunded)
      if (outcome === 'unknown') console.error('Remboursement d\'un paiement sans don enregistré :', sessionId)
    } catch (e) {
      console.error('Remboursement non enregistré :', e)
      return NextResponse.json({ error: 'Remboursement échoué' }, { status: 500 }) // i18n-ok : réponse à Stripe
    }
  }

  return NextResponse.json({ received: true })
}
