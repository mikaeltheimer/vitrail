import type Stripe from 'stripe'
import { getDb } from './db'
import { getStripe } from './payments'
import { forgetTenantCache, type OrgRow } from './tenant'

// Compte Stripe connecté d'un organisme : type « Standard » (l'organisme a son tableau de bord Stripe, paie lui-même
// les frais de Stripe, et répond des litiges). Le payeur de frais se fixe à la création du compte : à ne pas changer ici
// sans y penser (voir la documentation de Stripe sur le comportement des frais en paiements directs).

/** Le compte est prêt à encaisser : identité vérifiée et paiements activés. */
export const isAccountReady = (a: Pick<Stripe.Account, 'charges_enabled' | 'details_submitted'>): boolean => !!a.charges_enabled && !!a.details_submitted

/** Crée le compte connecté de l'organisme s'il n'existe pas, puis renvoie l'adresse d'inscription hébergée par Stripe. */
export async function startOnboarding(org: OrgRow, baseUrl: string): Promise<{ url: string; accountId: string }> {
  const stripe = getStripe()
  let accountId = org.stripeAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'standard',
      country: 'CA',
      business_profile: { name: org.name },
      metadata: { orgId: org.id },
    })
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
