import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { CONFIG } from './config'
import { paymentMode, requireEnv, siteUrl } from './env'
import { recordDonation } from './donations'
import type { DonorProfileInput } from './validate'

// Couche de paiement : tout ce qui touche un fournisseur est ici. Pour passer à Square, il suffit d'ajouter
// un fournisseur qui renvoie une URL de paiement et appelle recordDonation() à la confirmation.

let stripeClient: Stripe | null = null
export function getStripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(requireEnv('STRIPE_SECRET_KEY'), { apiVersion: '2026-02-25.clover' })
  return stripeClient
}

export interface CheckoutRequest {
  /** null : le courriel sera saisi chez Stripe. */
  email: string | null
  amountCents: number
  profile: DonorProfileInput
  color: string
  eventId: string | null
  channel: string | null
}

/** Renvoie l'adresse où envoyer le donateur (paiement Stripe, ou page de remerciement en mode démo). */
export async function startCheckout(req: CheckoutRequest): Promise<{ url: string }> {
  const mode = paymentMode()
  if (mode === 'off') throw new Error('Les paiements ne sont pas activés.')

  if (mode === 'demo') {
    const ref = `demo_${randomUUID()}`
    await recordDonation({
      // Démo sans courriel : un morceau à part (comme un vrai donateur nouveau)
      email: req.email ?? `demo+${randomUUID()}@donateur.invalid`,
      profile: req.profile,
      color: req.color,
      amountCents: req.amountCents,
      source: 'demo',
      providerRef: ref,
      eventId: req.eventId,
      channel: req.channel,
    })
    return { url: `${siteUrl()}/merci?ref=${ref}` }
  }

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    submit_type: 'donate',
    locale: 'fr-CA',
    ...(req.email ? { customer_email: req.email } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CONFIG.currency,
          unit_amount: req.amountCents,
          product_data: { name: `Don à l'${CONFIG.orgName}` },
        },
      },
    ],
    payment_intent_data: { description: `Don — ${CONFIG.orgName}` },
    metadata: {
      email: req.email ?? '',
      eventId: req.eventId ?? '',
      showName: req.profile.showName ? '1' : '0',
      name: req.profile.name,
      message: req.profile.message ?? '',
      photo: req.profile.photoUrl ?? '',
      color: req.color,
      channel: req.channel ?? '',
    },
    success_url: `${siteUrl()}/merci?ref={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/?annule=1`,
  })
  if (!session.url) throw new Error('Stripe n\'a pas renvoyé d\'adresse de paiement.')
  return { url: session.url }
}
