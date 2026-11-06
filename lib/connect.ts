import type Stripe from 'stripe'
import { getDb } from './db'
import { getStripe } from './payments'
import { forgetTenantCache, type OrgRow } from './tenant'

// Compte Stripe connecté d'un organisme, créé avec les « propriétés de contrôle » (pas un type hérité) :
//   - paiements directs : l'argent va chez l'organisme ;
//   - fees.payer = account : l'organisme paie lui-même les frais de Stripe (nous ne prélevons que notre commission) ;
//   - losses.payments = stripe : Stripe, pas la plateforme, absorbe un solde négatif (obligatoire avec fees.payer = account) ;
//   - requirement_collection = stripe : Stripe recueille l'identité (inscription hébergée) ;
//   - tableau de bord : « express » (allégé, ouvert depuis notre console par un lien à usage unique ; remboursements et litiges
//     y sont possibles) ou « full » (tableau de bord complet de Stripe). Il ne change JAMAIS après la création du compte.
// Choix par STRIPE_ACCOUNT_DASHBOARD (défaut : express). Express + frais payés par le compte demande une version récente de l'API
// de Stripe : STRIPE_CONNECT_API_VERSION la fixe pour cet appel seulement (les paiements gardent la version du client).

/** Le compte est prêt à encaisser : identité vérifiée et paiements activés. */
export const isAccountReady = (a: Pick<Stripe.Account, 'charges_enabled' | 'details_submitted'>): boolean => !!a.charges_enabled && !!a.details_submitted

/** Crée le compte connecté de l'organisme s'il n'existe pas, puis renvoie l'adresse d'inscription hébergée par Stripe. */
export async function startOnboarding(org: OrgRow, baseUrl: string): Promise<{ url: string; accountId: string }> {
  const stripe = getStripe()
  let accountId = org.stripeAccountId
  if (!accountId) {
    const dashboard = process.env.STRIPE_ACCOUNT_DASHBOARD === 'full' ? 'full' : 'express'
    const version = process.env.STRIPE_CONNECT_API_VERSION?.trim()
    const account = await stripe.accounts.create(
      {
        country: 'CA',
        controller: {
          stripe_dashboard: { type: dashboard },
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          requirement_collection: 'stripe',
        },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_profile: { name: org.name },
        metadata: { orgId: org.id },
      },
      version ? { apiVersion: version } : undefined,
    )
    accountId = account.id
    const { error } = await getDb().from('organizations').update({ stripe_account_id: accountId }).eq('id', org.id)
    if (error) throw error
    forgetTenantCache()
  }
  const base = baseUrl.replace(/\/$/, '')
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${base}/admin?stripe=reprendre`,
    return_url: `${base}/admin?stripe=retour`,
  })
  return { url: link.url, accountId }
}

export async function setAccountReady(orgId: string, accountId: string, ready: boolean): Promise<void> {
  const { error } = await getDb().from('organizations').update({ stripe_ready: ready }).eq('id', orgId).eq('stripe_account_id', accountId)
  if (error) throw error
  forgetTenantCache()
}

/** Relit l'état du compte chez Stripe et met `stripe_ready` à jour. */
export async function refreshAccount(orgId: string, accountId: string): Promise<boolean> {
  const ready = isAccountReady(await getStripe().accounts.retrieve(accountId))
  await setAccountReady(orgId, accountId, ready)
  return ready
}

/** L'organisme d'un compte connecté (pour les événements Connect : le compte, jamais les métadonnées, dit de qui il s'agit). */
export async function orgByAccount(accountId: string): Promise<{ id: string; slug: string } | null> {
  const db = getDb()
  const { data, error } = await db.from('organizations').select('id').eq('stripe_account_id', accountId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const { data: s } = await db.from('organization_slugs').select('slug').eq('organization_id', data.id).eq('is_current', true).maybeSingle()
  return { id: data.id as string, slug: (s?.slug as string) ?? '' }
}

/**
 * Lien à usage unique vers le tableau de bord Express de l'organisme (remboursements, litiges, versements, coordonnées bancaires).
 * Un compte à tableau de bord complet n'a pas de lien de ce genre : il se connecte lui-même sur stripe.com.
 */
export async function dashboardLink(accountId: string): Promise<string | null> {
  const account = await getStripe().accounts.retrieve(accountId)
  if (account.controller?.stripe_dashboard?.type !== 'express') return null
  return (await getStripe().accounts.createLoginLink(accountId)).url
}
