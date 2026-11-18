import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import { PRACTICE_SUFFIX, orgSlugProblem } from './hosts'
import { PHOTO_BUCKET, pathFromPublicUrl } from './photos'
import { assetUrl, forgetIdentity, getIdentity } from './identity'
import type { StoredTexts } from './identity-shared'
import { forgetTenantCache } from './tenant'
import { validateLocales, validateTexts } from './atelier'
import { demoStateOf, fillDemo, type DemoContent, type DemoState } from './demo'
import { NEUTRAL_TESTIMONIALS_EN, NEUTRAL_TESTIMONIALS_FR } from './demo-data'
import type { Locale } from '@/i18n/config'

// DÉMONSTRATIONS PAR PROJET : pour une rencontre de vente ou d'accueil, Studio prépare un vitrail de démonstration au nom
// d'un organisme précis (son nom, son logo, ses textes, sa propre adresse), rempli de donateurs FICTIFS.
//
// Aucune migration : c'est un organisme `showcase` comme la démo de la vitrine, donc en lecture seule partout où le code
// regarde `showcase` (aucun don, aucun signalement, aucune photo publique, aucune visite comptée, exclu des chiffres de
// Studio). Ce qui le distingue de la démo de la vitrine est la marque `theme.demoProjet`, écrite ici seulement.
//
// Sécurité : chaque fonction qui modifie ou efface vérifie d'abord `showcase` ET `theme.demoProjet` (projectRow). Un vrai
// organisme, un atelier ou la démo de la vitrine ne passent jamais.

/** Nombre maximal de démonstrations par projet (on les supprime après usage). */
export const PROJECT_DEMO_MAX = 30
const IMAGE_MAX_BYTES = 600_000

export type ProjectDemoError = 'nom' | 'langues' | 'textes' | 'forme' | 'reserve' | 'pris' | 'limite' | 'introuvable' | 'image'

interface Row {
  id: string
  name_fr: string
  texts: StoredTexts | null
  locales: string[] | null
  logo_path: string | null
  icon_path: string | null
  theme: Record<string, unknown> | null
  showcase: boolean | null
  practice_of: string | null
  created_at: string
}
const COLUMNS = 'id,name_fr,texts,locales,logo_path,icon_path,theme,showcase,practice_of,created_at'

const isProject = (o: Row | null | undefined): o is Row => !!o && o.showcase === true && !o.practice_of && o.theme?.demoProjet === true

/** La démonstration par projet de cet identifiant, ou null : jamais un vrai organisme, un atelier ni la démo de la vitrine. */
async function projectRow(id: unknown): Promise<Row | null> {
  if (typeof id !== 'string' || !id || id.length > 64) return null
  const { data, error } = await getDb().from('organizations').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  const row = data as unknown as Row | null
  return isProject(row) ? row : null
}

async function allProjectRows(): Promise<Row[]> {
  const { data, error } = await getDb().from('organizations').select(COLUMNS).eq('showcase', true).order('created_at').limit(500)
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).filter(isProject)
}

async function permanentVitrailId(orgId: string): Promise<string | null> {
  const { data, error } = await getDb().from('vitraux').select('id').eq('organization_id', orgId).eq('kind', 'permanent').maybeSingle()
  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

/** Graine propre à l'adresse : deux démonstrations n'ont pas les mêmes donateurs, et une régénération redonne les siens. */
export function seedOf(slug: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193) >>> 0
  return h
}

/** Part de donateurs anglophones selon les langues offertes (la première est la principale). */
const englishShare = (locales: Locale[]): number => (!locales.includes('en') ? 0 : !locales.includes('fr') ? 1 : locales[0] === 'en' ? 0.7 : 0.22)

/** Témoignages neutres ; la question est celle que l'organisme pose réellement (la sienne, sinon la question neutre). */
async function contentFor(orgId: string, locales: Locale[]): Promise<DemoContent> {
  forgetIdentity()
  const identity = await getIdentity({ id: orgId, practiceOf: null })
  const question = (locale: 'fr' | 'en', q: 1 | 2 | 3): string | null => {
    const list = identity?.texts[locale]?.testimonial.questions ?? []
    const text = list[q - 1] ?? list[0] ?? null
    // donors.message_question : 120 caractères au plus (contrainte de la base)
    return text && text.length <= 120 ? text : null
  }
  return { testimonialsFr: NEUTRAL_TESTIMONIALS_FR, testimonialsEn: NEUTRAL_TESTIMONIALS_EN, question, englishShare: englishShare(locales) }
}

interface Identity {
  locales: Locale[]
  texts: StoredTexts
  name: string
}

/** Langues (une ou deux, la première est la principale) et textes ; le nom est exigé dans la langue principale. */
function validateIdentity(input: { locales: unknown; texts: unknown }): { ok: true; value: Identity } | { ok: false; error: ProjectDemoError } {
  const locales = validateLocales(input.locales)
  if (!locales) return { ok: false, error: 'langues' }
  const t = validateTexts(input.texts)
  if (!t.ok) return { ok: false, error: 'textes' }
  // Seulement les langues offertes
  const texts: StoredTexts = {}
  for (const l of locales) if (t.texts[l] && Object.keys(t.texts[l]!).length) texts[l] = t.texts[l]
  const name = (texts[locales[0]]?.name ?? '').trim()
  if (name.length < 2) return { ok: false, error: 'nom' }
  return { ok: true, value: { locales, texts, name } }
}

export interface ProjectDemo extends DemoState {
  id: string
  slug: string
  name: string
  locales: Locale[]
  texts: StoredTexts
  logoUrl: string | null
  iconUrl: string | null
  createdAt: string
}

async function describe(row: Row, slug: string): Promise<ProjectDemo> {
  const state = await demoStateOf(row.id)
  return {
    ...state,
    id: row.id,
    slug,
    name: row.name_fr,
    locales: (row.locales ?? ['fr']) as Locale[],
    texts: row.texts ?? {},
    logoUrl: assetUrl(row.logo_path),
    iconUrl: assetUrl(row.icon_path),
    createdAt: row.created_at,
  }
}

/** Toutes les démonstrations par projet, de la plus récente à la plus ancienne. */
export async function listProjectDemos(): Promise<ProjectDemo[]> {
  const rows = await allProjectRows()
  if (!rows.length) return []
  const { data, error } = await getDb().from('organization_slugs').select('slug,organization_id,is_current').in('organization_id', rows.map(r => r.id))
  if (error) throw error
  const slugOf = new Map(((data ?? []) as { slug: string; organization_id: string; is_current: boolean }[]).filter(s => s.is_current).map(s => [s.organization_id, s.slug]))
  const out = await Promise.all(rows.filter(r => slugOf.has(r.id)).map(r => describe(r, slugOf.get(r.id)!)))
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Crée une démonstration par projet à cette adresse et la remplit de donateurs fictifs. */
export async function createProjectDemo(
  input: { slug: unknown; locales: unknown; texts: unknown },
  now = Date.now(),
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: ProjectDemoError }> {
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  const problem = orgSlugProblem(slug)
  if (problem) return { ok: false, error: problem }
  const identity = validateIdentity(input)
  if (!identity.ok) return identity
  const { locales, texts, name } = identity.value

  const db = getDb()
  if ((await allProjectRows()).length >= PROJECT_DEMO_MAX) return { ok: false, error: 'limite' }
  // L'adresse, et celle que prendrait l'atelier d'un futur vrai organisme du même nom, doivent être libres
  const taken = await db.from('organization_slugs').select('slug').in('slug', [slug, `${slug}${PRACTICE_SUFFIX}`])
  if (taken.error) throw taken.error
  if ((taken.data ?? []).length) return { ok: false, error: 'pris' }

  const at = new Date(now).toISOString()
  const { data: org, error } = await db
    .from('organizations')
    .insert({ name_fr: name, status: 'live', showcase: true, locales, texts, theme: { demoProjet: true }, photo_moderation: 'live', created_at: at, went_live_at: at, published_at: at })
    .select('id')
    .single()
  if (error) throw error
  const orgId = org.id as string
  const undo = async () => {
    await db.from('vitraux').delete().eq('organization_id', orgId)
    await db.from('organization_slugs').delete().eq('organization_id', orgId)
    await db.from('organizations').delete().eq('id', orgId)
  }
  try {
    const s = await db.from('organization_slugs').insert({ slug, organization_id: orgId, is_current: true, created_at: at })
    if (s.error) {
      await undo()
      const code = (s.error as { code?: string }).code
      if (code === '23505') return { ok: false, error: 'pris' } // prise entre-temps
      if (code === '23514') return { ok: false, error: 'reserve' } // contraintes de la table
      throw s.error
    }
    const { data: v, error: vErr } = await db.from('vitraux').insert({ organization_id: orgId, kind: 'permanent', name: texts[locales[0]]?.vitrailTitle || name }).select('id').single()
    if (vErr) throw vErr
    forgetTenantCache()
    await fillDemo(orgId, v.id as string, now, { seed: seedOf(slug), content: await contentFor(orgId, locales) })
  } catch (e) {
    await db.from('donations').delete().eq('organization_id', orgId)
    await db.from('donors').delete().eq('organization_id', orgId)
    await undo()
    forgetTenantCache()
    forgetIdentity()
    throw e
  }
  return { ok: true, id: orgId, slug }
}

async function currentSlug(orgId: string): Promise<string | null> {
  const { data, error } = await getDb().from('organization_slugs').select('slug').eq('organization_id', orgId).eq('is_current', true).maybeSingle()
  if (error) throw error
  return (data?.slug as string | undefined) ?? null
}

/** Régénère les donateurs (dates replacées à aujourd'hui ; photos gardées et redistribuées). */
export async function regenerateProjectDemo(id: unknown, now = Date.now()): Promise<{ ok: true } | { ok: false; error: ProjectDemoError }> {
  const row = await projectRow(id)
  if (!row) return { ok: false, error: 'introuvable' }
  const [slug, vitrailId] = await Promise.all([currentSlug(row.id), permanentVitrailId(row.id)])
  if (!slug || !vitrailId) return { ok: false, error: 'introuvable' }
  await fillDemo(row.id, vitrailId, now, { seed: seedOf(slug), content: await contentFor(row.id, (row.locales ?? ['fr']) as Locale[]) })
  return { ok: true }
}

/** Change les langues et les textes, puis régénère : la question posée aux donateurs fictifs suit le nouveau nom. */
export async function updateProjectDemo(id: unknown, input: { locales: unknown; texts: unknown }, now = Date.now()): Promise<{ ok: true } | { ok: false; error: ProjectDemoError }> {
  const row = await projectRow(id)
  if (!row) return { ok: false, error: 'introuvable' }
  const identity = validateIdentity(input)
  if (!identity.ok) return identity
  const { locales, texts, name } = identity.value
  const db = getDb()
  const { error } = await db.from('organizations').update({ name_fr: name, texts, locales }).eq('id', row.id)
  if (error) throw error
  const v = await db.from('vitraux').update({ name: texts[locales[0]]?.vitrailTitle || name }).eq('organization_id', row.id).eq('kind', 'permanent')
  if (v.error) throw v.error
  forgetTenantCache()
  forgetIdentity()
  return regenerateProjectDemo(row.id, now)
}

const isPng = (b: Uint8Array) => b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47

const removeFiles = async (orgId: string, paths: (string | null | undefined)[]) => {
  const mine = [...new Set(paths.filter((p): p is string => !!p && p.startsWith(`org/${orgId}/`)))]
  for (let i = 0; i < mine.length; i += 100) {
    const { error } = await getDb().storage.from(PHOTO_BUCKET).remove(mine.slice(i, i + 100))
    if (error) console.error('Fichiers non supprimés (sans gravité) :', error.message)
  }
}

/**
 * Le logo ou l'icône de l'organisme pour qui la démonstration est préparée : un PNG déjà réduit par le navigateur (jamais
 * de SVG, comme dans l'atelier). `bytes` null : retirer l'image. L'ancienne image est effacée.
 */
export async function setProjectDemoImage(id: unknown, type: 'logo' | 'icon', bytes: Buffer | null): Promise<{ ok: true } | { ok: false; error: ProjectDemoError }> {
  const row = await projectRow(id)
  if (!row) return { ok: false, error: 'introuvable' }
  const db = getDb()
  const key = type === 'logo' ? 'logo_path' : 'icon_path'
  const sizeKey = type === 'logo' ? 'logoSize' : 'iconSize'
  // Valeurs figées avant d'écrire (la fausse base des tests partage les lignes par référence)
  const old = row[key]
  const theme = { ...(row.theme ?? {}) }
  let path: string | null = null
  let size: [number, number] | null = null
  if (bytes) {
    if (!bytes.length || bytes.length > IMAGE_MAX_BYTES || !isPng(bytes)) return { ok: false, error: 'image' }
    size = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
    if (!size[0] || !size[1] || size[0] > 2000 || size[1] > 2000) return { ok: false, error: 'image' }
    path = `org/${row.id}/${type}-${randomUUID()}.png`
    const up = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/png', cacheControl: '31536000', upsert: false })
    if (up.error) throw up.error
  }
  const { error } = await db.from('organizations').update({ [key]: path, theme: { ...theme, [sizeKey]: size } }).eq('id', row.id)
  if (error) {
    await removeFiles(row.id, [path])
    throw error
  }
  await removeFiles(row.id, [old])
  forgetTenantCache()
  forgetIdentity()
  return { ok: true }
}

/** Une démonstration par projet, vérifiée : pour les routes qui passent ensuite par lib/demo.ts (photos des donateurs). */
export async function projectDemoId(id: unknown): Promise<string | null> {
  return (await projectRow(id))?.id ?? null
}

/** Supprime la démonstration : ses donateurs fictifs, son adresse (libérée), son logo et ses photos. */
export async function deleteProjectDemo(id: unknown): Promise<{ ok: true } | { ok: false; error: ProjectDemoError }> {
  const row = await projectRow(id)
  if (!row) return { ok: false, error: 'introuvable' }
  const db = getDb()
  const orgId = row.id
  const { data: donors, error: dErr } = await db.from('donors').select('photo_url').eq('organization_id', orgId)
  if (dErr) throw dErr
  const photos = ((donors ?? []) as { photo_url: string | null }[]).map(d => pathFromPublicUrl(d.photo_url, orgId))
  // Dans l'ordre des clés étrangères (l'une après l'autre) : ce qui pointe vers les donateurs et le vitrail d'abord
  for (const table of ['demo_screen_pieces', 'email_log', 'reports', 'visits', 'donations', 'donors', 'vitraux', 'organization_slugs']) {
    const { error } = await db.from(table).delete().eq('organization_id', orgId)
    if (error) throw error
  }
  const { error } = await db.from('organizations').delete().eq('id', orgId)
  if (error) throw error
  await removeFiles(orgId, [row.logo_path, row.icon_path, ...photos])
  forgetTenantCache()
  forgetIdentity()
  return { ok: true }
}
