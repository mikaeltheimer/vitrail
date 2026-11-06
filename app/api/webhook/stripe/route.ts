import { after, NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/payments'
import { recordDonation, createToken } from '@/lib/donations'
import { sendReceipt } from '@/lib/email'
import { cleanChannel, defaultColorFor, validateColor } from '@/lib/validate'
import { ANON_LABEL } from '@/lib/config'
import { pathFromPublicUrl } from '@/lib/photos'
import { isLocale } from '@/i18n/config'
import { getOrg, getVitrail, orgBaseUrl } from '@/lib/tenant'
import { applyRefund, refundPlatformFee } from '@/lib/refunds'
import { isAccountReady, orgByAccount, setAccountReady } from '@/lib/connect'

export const runtime = 'nodejs'

// Webhook Stripe Connect : tous les événements arrivent des COMPTES CONNECTÉS des organismes (event.account).
// Deux points d'entrée possibles chez Stripe (même adresse), chacun avec son secret de signature :
// STRIPE_CONNECT_WEBHOOK_SECRET (événements des comptes connectés) et STRIPE_WEBHOOK_SECRET (compte de la plateforme).
//
// Règle d'isolation : l'organisme d'un événement est celui dont le compte Stripe l'a émis, jamais celui que dit une
// métadonnée. Une métadonnée qui contredit le compte est ignorée (journalisée).
//
// Un compte Standard sert aussi à autre chose que nos dons : tout événement qui n'est pas de nous (sans métadonnée
// orgId, sans don correspondant) est accepté et ignoré.

const ok = () => NextResponse.json({ received: true })

function verify(body: string, signature: string): Stripe.Event | null {
  const secrets = [process.env.STRIPE_CONNECT_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET].filter((s): s is string => !!s)
  for (const secret of secrets) {
    try {
      return getStripe().webhooks.constructEvent(body, signature, secret)
    } catch {
      // essayer l'autre secret
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature || !(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Webhook non configuré' }, { status: 400 }) // i18n-ok : réponse à Stripe, pas au visiteur
  }
  const event = verify(body, signature)
  if (!event) {
    console.error('Signature du webhook invalide')
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 }) // i18n-ok : réponse à Stripe
  }

  // Aucun événement de la plateforme elle-même n'est traité : l'argent des dons passe par les comptes connectés
  if (!event.account) return ok()
  const account = await orgByAccount(event.account)
  if (!account) {
    console.error('Événement d\'un compte Stripe inconnu :', event.account, event.type)
    return ok()
  }
  const orgId = account.id

  // ── Le compte de l'organisme a changé (identité vérifiée, paiements activés…) ──
  if (event.type === 'account.updated') {
    const acct = event.data.object as Stripe.Account
    await setAccountReady(orgId, acct.id, isAccountReady(acct))
    return ok()
  }

  // ── Un don payé ──
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') return ok()

    const m = session.metadata ?? {}
    if (!m.orgId) return ok() // pas une session de Donivers
    if (m.orgId !== orgId) {
      console.error('Métadonnée orgId contredit le compte Stripe :', session.id, m.orgId, orgId)
      return ok()
    }
    const org = await getOrg(orgId)
    // Un vitrail qui n'appartient pas à l'organisme est une anomalie : on refuse (Stripe réessaiera et le tableau de
    // bord le montrera) plutôt que de ranger un don au mauvais endroit. Un vitrail clos reçoit quand même le don : il est payé.
    const vitrail = org && m.vitrailId ? await getVitrail(org.id, m.vitrailId) : null
    if (!org || !vitrail) {
      console.error('Paiement avec un vitrail qui n\'appartient pas à l\'organisme :', session.id, orgId, m.vitrailId)
      return NextResponse.json({ error: 'Vitrail inconnu' }, { status: 500 }) // i18n-ok : réponse à Stripe
    }

    const email = (m.email || session.customer_details?.email || '').trim().toLowerCase()
    if (!email || !session.amount_total) {
      console.error('Session sans courriel ou sans montant :', session.id)
      return ok()
    }
    const color = validateColor(m.color)
    // Frais couverts par le donateur : payés, mais hors du don (morceau et total gardent des chiffres ronds)
    const fee = parseInt(m.feeCents ?? '', 10)
    const feeCents = Number.isFinite(fee) && fee > 0 && fee < session.amount_total ? fee : 0
    // Notre commission, fixée à la création du paiement
    const pf = parseInt(m.platformFee ?? '', 10)
    const platformFeeCents = Number.isFinite(pf) && pf > 0 && pf < session.amount_total ? pf : 0
    const baseUrl = orgBaseUrl(org.slug)

    try {
      const result = await recordDonation({
        organizationId: org.id,
        vitrailId: vitrail.id,
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
        platformFeeCents,
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
            await sendReceipt({ to: email, amountCents, token: await createToken(donorId), locale, donorId, organizationId: org.id, baseUrl })
          } catch (e) {
            console.error('Courriel de reçu non envoyé :', e)
          }
        })
      }
    } catch (e) {
      console.error('Enregistrement du don échoué :', e)
      return NextResponse.json({ error: 'Enregistrement échoué' }, { status: 500 }) // i18n-ok : réponse à Stripe, pas au visiteur
    }
    return ok()
  }

  // ── Un remboursement : le morceau rétrécit, et la commission est rendue à l'organisme ──
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    if (!intent) return ok()
    try {
      // Le don est rangé sous la session Checkout : on la retrouve par le paiement, sur le compte de l'organisme
      const sessions = await getStripe().checkout.sessions.list({ payment_intent: intent, limit: 1 }, { stripeAccount: event.account })
      const session = sessions.data[0]
      if (!session) return ok()
      const refund = await applyRefund(orgId, session.id, charge.amount, charge.amount_refunded)
      if (refund.outcome === 'unknown') {
        // Un paiement de Donivers dont le don n'est pas encore enregistré : on réessaiera ; sinon ce n'est pas le nôtre
        return session.metadata?.orgId === orgId ? NextResponse.json({ error: 'Don pas encore enregistré' }, { status: 500 }) : ok() // i18n-ok : réponse à Stripe
      }
      await refundPlatformFee(getStripe(), charge, refund.donationId)
    } catch (e) {
      console.error('Remboursement non enregistré :', e)
      return NextResponse.json({ error: 'Remboursement échoué' }, { status: 500 }) // i18n-ok : réponse à Stripe, pas au visiteur
    }
  }

  return ok()
}
