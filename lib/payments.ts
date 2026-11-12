import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { CONFIG } from './config'
import { translatorFor } from './i18n'
import type { Locale } from '@/i18n/config'
import { paymentModeFor, requireEnv } from './env'
import { cumulativePlatformFees, platformFeeCents } from './platform-fee'
import { orgName, vitrailPath, type Tenant } from './tenant'
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
  /** Le don lui-même : la taille du morceau et ce qui compte dans le total. */
  amountCents: number
  /** Frais de transaction que le donateur ajoute de lui-même (0 s'il ne les couvre pas). Payés, mais hors du total affiché. */
  feeCents: number
  /** Où revenir après le paiement : le vitrail (panneau « Ajouter mon morceau ») ou la page de don classique. */
  returnTo: 'vitrail' | 'don'
  profile: DonorProfileInput
  color: string
  /** L'organisme et le vitrail où se fait le don (jamais pris tel quel dans la requête : résolus par l'adresse). */
  tenant: Tenant
  /** Adresse de l'organisme (sous-domaine) : le donateur revient là où il a commencé. */
  baseUrl: string
  channel: string | null
  /** Langue du donateur : page de paiement Stripe, retour, et courriels. */
  locale: Locale
  /** Case « recevoir les nouvelles de l'organisme » cochée. */
  mailingConsent?: boolean
}

/** Adresses de retour : depuis le vitrail, on y revient ; sinon, la page de remerciement. */
function returnUrls(returnTo: CheckoutRequest['returnTo'], ref: string, locale: Locale, baseUrl: string, vitrailRoute: string) {
  const base = baseUrl.replace(/\/$/, '')
  // ?lang= : on revient dans la langue du don, même si le cookie a disparu entre-temps
  return returnTo === 'vitrail'
    ? { success: `${base}${vitrailRoute}?merci=${ref}&lang=${locale}`, cancel: `${base}${vitrailRoute}?don&annule=1&lang=${locale}` }
    : { success: `${base}/merci?ref=${ref}&lang=${locale}`, cancel: `${base}/don?annule=1&lang=${locale}` }
}

/** Renvoie l'adresse où envoyer le donateur (paiement Stripe, ou retour direct en mode démo). */
export async function startCheckout(req: CheckoutRequest): Promise<{ url: string }> {
  const mode = paymentModeFor(req.tenant.org)
  if (mode === 'off') throw new Error('Les paiements ne sont pas activés.')

  if (mode === 'demo') {
    const ref = `demo_${randomUUID()}`
    await recordDonation({
      organizationId: req.tenant.org.id,
      vitrailId: req.tenant.vitrail.id,
      // Démo sans courriel : un morceau à part (comme un vrai donateur nouveau)
      email: req.email ?? `demo+${randomUUID()}@donateur.invalid`,
      profile: req.profile,
      color: req.color,
      amountCents: req.amountCents,
      feeCents: req.feeCents,
      source: 'demo',
      providerRef: ref,
      channel: req.channel,
      locale: req.locale,
      mailingConsent: req.mailingConsent,
    })
    return { url: returnUrls(req.returnTo, ref, req.locale, req.baseUrl, vitrailPath(req.tenant.vitrail)).success }
  }

  // Paiement direct sur le compte de l'organisme : l'argent va chez lui, nous ne prélevons que notre commission
  const accountId = req.tenant.org.stripeAccountId
  if (!accountId) throw new Error("L'organisme n'a pas de compte Stripe connecté.")
  const platformFee = platformFeeCents(req.amountCents, req.tenant.org.feeSchedule, await cumulativePlatformFees(req.tenant.org.id))

  const urls = returnUrls(req.returnTo, '{CHECKOUT_SESSION_ID}', req.locale, req.baseUrl, vitrailPath(req.tenant.vitrail))
  const t = translatorFor(req.locale)
  const org = orgName(req.tenant.org, req.locale)
  const session = await getStripe().checkout.sessions.create(
    {
    mode: 'payment',
    submit_type: 'donate',
    locale: req.locale === 'en' ? 'en' : 'fr-CA',
    ...(req.email ? { customer_email: req.email } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CONFIG.currency,
          unit_amount: req.amountCents,
          product_data: { name: t('stripe.don', { org }) },
        },
      },
      // Les frais couverts, sur leur propre ligne : le donateur voit ce qui va à l'école et ce qui va aux frais
      ...(req.feeCents > 0
        ? [{ quantity: 1, price_data: { currency: CONFIG.currency, unit_amount: req.feeCents, product_data: { name: t('stripe.frais') } } }]
        : []),
    ],
    payment_intent_data: {
      description: t('stripe.description', { org }),
      // Notre commission, prélevée par Stripe sur le paiement ; les frais de Stripe restent à la charge de l'organisme
      ...(platformFee > 0 ? { application_fee_amount: platformFee } : {}),
    },
    metadata: {
      email: req.email ?? '',
      // L'organisme et le vitrail voyagent avec le paiement : le webhook sait où ranger le don, même s'il arrive tard
      orgId: req.tenant.org.id,
      vitrailId: req.tenant.vitrail.id,
      showName: req.profile.showName ? '1' : '0',
      name: req.profile.name,
      message: req.profile.message ?? '', // ≤ 500 caractères (limite Stripe par valeur)
      quote: req.profile.quoteConsent ? '1' : '0',
      question: req.profile.message ? (req.profile.question ?? '') : '', // ≤ 120 caractères, déjà vérifiée (lib/validate.ts)
      photo: req.profile.photoUrl ?? '',
      color: req.color,
      channel: req.channel ?? '',
      feeCents: String(req.feeCents),
      platformFee: String(platformFee),
      lang: req.locale,
      mailing: req.mailingConsent ? '1' : '0',
    },
    success_url: urls.success,
    cancel_url: urls.cancel,
    },
    { stripeAccount: accountId },
  )
  if (!session.url) throw new Error('Stripe n\'a pas renvoyé d\'adresse de paiement.')
  return { url: session.url }
}
