import { getDb } from './db'
import { PRACTICE_SUFFIX, orgSlugProblem } from './hosts'
import { forgetTenantCache } from './tenant'

// Changer l'adresse (sous-domaine) d'un organisme depuis sa console (Réglages › Adresse et site web, propriétaire seulement).
// Décisions du 12 novembre 2026 :
// - en brouillon : changements libres, l'ancienne adresse est libérée (rien n'a été imprimé) ;
// - en ligne : l'ancienne adresse reste à l'organisme pour toujours et redirige vers l'actuelle (QR imprimés) ;
//   au plus ADDRESS_CHANGES_AFTER_LAUNCH nouvelles adresses ; revenir à une ancienne adresse ne compte pas.
// Les règles sont appliquées dans la base, en une transaction (fonction change_org_slug, migration 2026-11-24) :
// l'organisme n'est jamais sans adresse et son atelier (<adresse>--essai) suit.

export const ADDRESS_CHANGES_AFTER_LAUNCH = 2

export interface AddressInfo {
  current: string
  /** Pas encore mis en ligne : changements libres, ancienne adresse libérée. */
  draft: boolean
  /** Nouvelles adresses encore permises (en ligne) ; null en brouillon. */
  changesLeft: number | null
  max: number
  /** Anciennes adresses de l'organisme, de la plus récente à la plus ancienne : elles redirigent vers l'actuelle. */
  previous: string[]
}

type SlugRow = { slug: string; is_current: boolean; created_at: string }

export async function addressInfo(orgId: string): Promise<AddressInfo | null> {
  const db = getDb()
  const [orgRes, slugsRes] = await Promise.all([
    db.from('organizations').select('went_live_at').eq('id', orgId).maybeSingle(),
    db.from('organization_slugs').select('slug,is_current,created_at').eq('organization_id', orgId),
  ])
  if (orgRes.error) throw orgRes.error
  if (slugsRes.error) throw slugsRes.error
  if (!orgRes.data) return null
  const rows = (slugsRes.data ?? []) as SlugRow[]
  const current = rows.find(r => r.is_current)?.slug ?? ''
  const wentLive = orgRes.data.went_live_at as string | null
  const max = ADDRESS_CHANGES_AFTER_LAUNCH
  const used = wentLive ? rows.filter(r => Date.parse(r.created_at) > Date.parse(wentLive)).length : 0
  return {
    current,
    draft: !wentLive,
    changesLeft: wentLive ? Math.max(0, max - used) : null,
    max,
    previous: rows
      .filter(r => !r.is_current)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(r => r.slug),
  }
}

export type AddressCheck = 'disponible' | 'retour' | 'meme' | 'pris' | 'forme' | 'reserve'

const normalize = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/** Ce que donnerait cette adresse pour cet organisme (vérification pendant la saisie ; la base tranche au moment du changement). */
export async function checkAddress(orgId: string, slugIn: unknown): Promise<AddressCheck> {
  const slug = normalize(slugIn)
  const problem = orgSlugProblem(slug)
  if (problem) return problem
  const db = getDb()
  const [{ data, error }, practice] = await Promise.all([
    db.from('organization_slugs').select('slug,organization_id,is_current').in('slug', [slug, `${slug}${PRACTICE_SUFFIX}`]),
    db.from('organizations').select('id').eq('practice_of', orgId).maybeSingle(),
  ])
  if (error) throw error
  const practiceId = (practice.data?.id as string | undefined) ?? null
  const own = (data ?? []).find(r => r.slug === slug)
  const ownPractice = (data ?? []).find(r => r.slug === `${slug}${PRACTICE_SUFFIX}`)
  if (own && own.organization_id !== orgId) return 'pris'
  if (ownPractice && ownPractice.organization_id !== practiceId) return 'pris'
  if (own?.is_current) return 'meme'
  return own ? 'retour' : 'disponible'
}

export type AddressChange = { ok: true; slug: string } | { ok: false; error: 'forme' | 'reserve' | 'pris' | 'meme' | 'limite' | 'impossible' }

export async function changeAddress(orgId: string, slugIn: unknown): Promise<AddressChange> {
  const slug = normalize(slugIn)
  const problem = orgSlugProblem(slug)
  if (problem) return { ok: false, error: problem }
  const { data, error } = await getDb().rpc('change_org_slug', { p_org: orgId, p_slug: slug, p_max: ADDRESS_CHANGES_AFTER_LAUNCH })
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505') return { ok: false, error: 'pris' } // prise entre-temps par un autre organisme
    if (code === '23514') return { ok: false, error: 'reserve' } // contraintes de la table (réservés, « demo »)
    throw error
  }
  forgetTenantCache()
  if (data === 'ok') return { ok: true, slug }
  if (data === 'meme' || data === 'pris' || data === 'limite') return { ok: false, error: data }
  return { ok: false, error: 'impossible' }
}
