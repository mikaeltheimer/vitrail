import { getDb } from './db'
import { siteUrl } from './env'
import { parseFeeSchedule, type FeeSchedule } from './platform-fee'

// Résolution de l'organisme (et de son vitrail) à partir de l'adresse de la requête.
//
//   <slug>.PLATFORM_DOMAIN            → l'organisme <slug>, vitrail permanent
//   <slug>.PLATFORM_DOMAIN/<campagne> → son vitrail de campagne (la route le passe en `vitrailSlug`)
//
// Toute adresse inconnue (vitrail.studioexistence.com, *.vercel.app, localhost…) retombe sur DEFAULT_ORG_SLUG : c'est
// aussi le sélecteur des déploiements de prévisualisation. Aucun paramètre ni cookie ne choisit l'organisme : les
// réponses publiques sont mises en cache (s-maxage), un choix par cookie pourrait fuir d'un visiteur à l'autre.

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
export const CAMPAIGN_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/

/**
 * Premiers segments d'adresse qui ne peuvent jamais être une campagne : les routes de l'application.
 * Un test vérifie que chaque dossier de `app/` y figure (tests/reserved.test.ts) ; la même liste est dans la base.
 */
export const RESERVED_CAMPAIGN_SLUGS = [
  'admin', 'affiche', 'api', 'conditions', 'confidentialite', 'don', 'ecran', 'm', 'merci', 'screen', 'vitrail', 'privacy', 'en', 'fr',
  'login', 'auth', 'console', 'static', 'assets', '_next', 'favicon', 'robots', 'sitemap',
] as const

export interface OrgRow {
  id: string
  slug: string
  status: 'draft' | 'live' | 'suspended'
  name: string
  nameEn: string | null
  photoModeration: 'live' | 'moderation'
  senderName: string | null
  replyTo: string | null
  stripeAccountId: string | null
  stripeReady: boolean
  feeSchedule: FeeSchedule
}

export interface VitrailRow {
  id: string
  organizationId: string
  kind: 'permanent' | 'campaign'
  slug: string | null
  name: string
  state: 'active' | 'closed'
  inMain: boolean
  goalCents: number
}

export interface Tenant {
  org: OrgRow
  vitrail: VitrailRow
}

export type TenantResult = { tenant: Tenant } | { redirect: string } | { notFound: true }

const defaultSlug = () => (process.env.DEFAULT_ORG_SLUG || 'ecoleartsutton').trim().toLowerCase()
const platformDomain = () => (process.env.PLATFORM_DOMAIN || '').trim().toLowerCase().replace(/^\.+/, '')

/** L'identifiant d'organisme lu dans l'adresse, ou null (domaine inconnu, domaine nu, sous-sous-domaine). */
export function orgSlugFromHost(hostHeader: string | null | undefined): string | null {
  const domain = platformDomain()
  if (!domain || !hostHeader) return null
  const host = hostHeader.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
  if (!host.endsWith(`.${domain}`)) return null
  const label = host.slice(0, -(domain.length + 1))
  return SLUG_RE.test(label) ? label : null // « a.b » ne passe pas : un seul niveau
}

/** Adresse de base d'un organisme (pour les courriels et les retours de paiement hors requête). */
export function orgBaseUrl(slug: string | null | undefined): string {
  const domain = platformDomain()
  if (!domain || !slug) return siteUrl()
  const local = domain === 'localhost'
  return local ? `http://${slug}.${domain}:3000` : `https://${slug}.${domain}`
}

/** Adresse de base d'après la requête elle-même (le visiteur revient là où il a commencé). */
export function baseUrlOf(request: Request): string {
  const slug = orgSlugFromHost(request.headers.get('x-forwarded-host') || request.headers.get('host'))
  if (slug) {
    const proto = request.headers.get('x-forwarded-proto') || (platformDomain() === 'localhost' ? 'http' : 'https')
    const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim()
    return `${proto}://${host}`
  }
  return siteUrl()
}

/** Chemin public d'un vitrail : /vitrail pour le permanent, /<campagne> sinon. */
export const vitrailPath = (v: Pick<VitrailRow, 'kind' | 'slug'>): string => (v.kind === 'campaign' && v.slug ? `/${v.slug}` : '/vitrail')

interface OrgDbRow {
  id: string
  status: OrgRow['status']
  name_fr: string
  texts: { en?: { name?: string } } | null
  photo_moderation: OrgRow['photoModeration']
  sender_name: string | null
  reply_to: string | null
  stripe_account_id: string | null
  stripe_ready: boolean
  fee_schedule: unknown
}

const toOrg = (r: OrgDbRow, slug: string): OrgRow => ({
  id: r.id,
  slug,
  status: r.status,
  name: r.name_fr,
  nameEn: r.texts?.en?.name ?? null,
  photoModeration: r.photo_moderation,
  senderName: r.sender_name,
  replyTo: r.reply_to,
  stripeAccountId: r.stripe_account_id,
  stripeReady: r.stripe_ready,
  feeSchedule: parseFeeSchedule(r.fee_schedule),
})

/** Nom de l'organisme dans la langue demandée (repli sur le français). */
export const orgName = (org: Pick<OrgRow, 'name' | 'nameEn'>, locale: string): string => (locale === 'en' && org.nameEn ? org.nameEn : org.name)

// Cache de quelques secondes : l'organisme change rarement, la route publique est appelée sans arrêt.
const TTL_MS = 10_000
const cache = new Map<string, { at: number; value: unknown }>()
const remember = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k)
  return value
}
/** Après une modification faite par la console : la lecture suivante est fraîche. */
export const forgetTenantCache = () => cache.clear()

type SlugLookup = { orgId: string; slug: string; current: string }

async function lookupSlug(slug: string): Promise<SlugLookup | null> {
  return remember(`slug:${slug}`, async () => {
    const db = getDb()
    const { data, error } = await db.from('organization_slugs').select('organization_id,is_current').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (!data) return null
    if (data.is_current) return { orgId: data.organization_id as string, slug, current: slug }
    const { data: cur, error: curError } = await db
      .from('organization_slugs')
      .select('slug')
      .eq('organization_id', data.organization_id)
      .eq('is_current', true)
      .maybeSingle()
    if (curError) throw curError
    return { orgId: data.organization_id as string, slug, current: (cur?.slug as string) ?? slug }
  })
}

export async function getOrg(orgId: string): Promise<OrgRow | null> {
  return remember(`org:${orgId}`, async () => {
    const db = getDb()
    const [orgRes, slugRes] = await Promise.all([
      db.from('organizations').select('id,status,name_fr,texts,photo_moderation,sender_name,reply_to,stripe_account_id,stripe_ready,fee_schedule').eq('id', orgId).maybeSingle(),
      db.from('organization_slugs').select('slug').eq('organization_id', orgId).eq('is_current', true).maybeSingle(),
    ])
    if (orgRes.error) throw orgRes.error
    if (slugRes.error) throw slugRes.error
    return orgRes.data ? toOrg(orgRes.data as OrgDbRow, (slugRes.data?.slug as string) ?? '') : null
  })
}

const VITRAIL_COLS = 'id,organization_id,kind,slug,name,state,in_main,goal_cents'
const toVitrail = (r: Record<string, unknown>): VitrailRow => ({
  id: r.id as string,
  organizationId: r.organization_id as string,
  kind: r.kind as VitrailRow['kind'],
  slug: (r.slug as string | null) ?? null,
  name: r.name as string,
  state: r.state as VitrailRow['state'],
  inMain: !!r.in_main,
  goalCents: Number(r.goal_cents ?? 0),
})

/** Un vitrail, à condition qu'il appartienne à CET organisme (jamais un identifiant pris tel quel dans une requête). */
export async function getVitrail(orgId: string, vitrailId: string): Promise<VitrailRow | null> {
  return remember(`vitrail:${orgId}:${vitrailId}`, async () => {
    const { data, error } = await getDb().from('vitraux').select(VITRAIL_COLS).eq('id', vitrailId).eq('organization_id', orgId).maybeSingle()
    if (error) throw error
    return data ? toVitrail(data) : null
  })
}

export async function getPermanentVitrail(orgId: string): Promise<VitrailRow | null> {
  return remember(`perm:${orgId}`, async () => {
    const { data, error } = await getDb().from('vitraux').select(VITRAIL_COLS).eq('organization_id', orgId).eq('kind', 'permanent').maybeSingle()
    if (error) throw error
    return data ? toVitrail(data) : null
  })
}

export async function getCampaignBySlug(orgId: string, slug: string): Promise<VitrailRow | null> {
  if (!CAMPAIGN_SLUG_RE.test(slug) || (RESERVED_CAMPAIGN_SLUGS as readonly string[]).includes(slug)) return null // pas de requête pour une adresse qui ne peut pas exister
  return remember(`camp:${orgId}:${slug}`, async () => {
    const { data, error } = await getDb().from('vitraux').select(VITRAIL_COLS).eq('organization_id', orgId).eq('kind', 'campaign').eq('slug', slug).maybeSingle()
    if (error) throw error
    return data ? toVitrail(data) : null
  })
}

/**
 * L'organisme (et le vitrail) de la requête. `vitrailSlug` absent = vitrail permanent.
 * Un ancien identifiant d'organisme répond par une redirection permanente (308) vers l'actuel.
 */
export async function resolveTenant(request: Request, opts: { vitrailSlug?: string | null } = {}): Promise<TenantResult> {
  const hostSlug = orgSlugFromHost(request.headers.get('x-forwarded-host') || request.headers.get('host'))
  const slug = hostSlug ?? defaultSlug()

  const found = await lookupSlug(slug)
  if (!found) return { notFound: true }
  if (found.current !== found.slug && hostSlug) {
    const url = new URL(request.url)
    const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
    const port = platformDomain() === 'localhost' ? ':3000' : ''
    return { redirect: `${proto}://${found.current}.${platformDomain()}${port}${url.pathname}${url.search}` }
  }

  const org = await getOrg(found.orgId)
  if (!org || org.status === 'suspended') return { notFound: true }

  const vitrail = opts.vitrailSlug ? await getCampaignBySlug(org.id, opts.vitrailSlug) : await getPermanentVitrail(org.id)
  if (!vitrail) return { notFound: true }
  return { tenant: { org, vitrail } }
}

/** Pour les routes : l'organisme ou une réponse prête (redirection, introuvable). */
export function tenantResponse(r: TenantResult): Response | null {
  if ('tenant' in r) return null
  if ('redirect' in r) return Response.redirect(r.redirect, 308)
  return Response.json({ error: 'Introuvable', code: 'introuvable' }, { status: 404 })
}

/** L'organisme par défaut (DEFAULT_ORG_SLUG) et son vitrail permanent : paiements en vol sans métadonnées, tâches planifiées. */
export async function defaultTenant(): Promise<Tenant | null> {
  const found = await lookupSlug(defaultSlug())
  if (!found) return null
  const org = await getOrg(found.orgId)
  const vitrail = org ? await getPermanentVitrail(org.id) : null
  return org && vitrail ? { org, vitrail } : null
}

/** Slug de campagne demandé (?v=… ou champ `campaign`) : seulement s'il a la forme d'un identifiant. */
export function campaignParam(v: unknown): string | null {
  return typeof v === 'string' && CAMPAIGN_SLUG_RE.test(v) ? v : null
}

/** Pour les routes : `{ tenant }` ou `{ response }` à renvoyer tel quel (redirection, introuvable). */
export async function requireTenant(request: Request, vitrailSlug?: string | null): Promise<{ tenant: Tenant } | { response: Response }> {
  const r = await resolveTenant(request, { vitrailSlug })
  const response = tenantResponse(r)
  return response ? { response } : { tenant: (r as { tenant: Tenant }).tenant }
}
