import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/payments'
import { recordDonation, createToken } from '@/lib/donations'
import { sendReceipt } from '@/lib/email'
import { cleanChannel, defaultColorFor, validateColor } from '@/lib/validate'
import { ANON_LABEL } from '@/lib/config'
import { pathFromPublicUrl } from '@/lib/photos'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) return NextResponse.json({ error: 'Webhook non configuré' }, { status: 400 })

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
        email,
        profile: {
          showName: m.showName === '1',
          name: m.name || ANON_LABEL,
          message: m.message || null,
          photoUrl: m.showName === '1' && pathFromPublicUrl(m.photo) ? m.photo : null,
        },
        color: color.ok ? color.value : defaultColorFor(email),
        amountCents: session.amount_total - feeCents,
        feeCents,
        source: 'stripe',
        providerRef: session.id,
        eventId: m.eventId ? m.eventId : null,
        channel: cleanChannel(m.channel),
      })
      if (!result.duplicate) {
        // Le courriel est un confort : un échec ne doit pas faire rejouer le webhook (le don est déjà enregistré).
        try {
          await sendReceipt(email, session.amount_total, await createToken(result.donorId))
        } catch (e) {
          console.error('Courriel de reçu non envoyé :', e)
        }
      }
    } catch (e) {
      console.error('Enregistrement du don échoué :', e)
      return NextResponse.json({ error: 'Enregistrement échoué' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
