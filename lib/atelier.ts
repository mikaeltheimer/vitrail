import { getDb } from './db'
import { PHOTO_BUCKET } from './photos'
import { forgetIdentity } from './identity'
import { forgetTenantCache } from './tenant'
import { TEXT_FIELDS, TEXT_MAX, parseLocales, type StoredTexts, type TextField } from './identity-shared'
import { isLocale, type Locale } from '@/i18n/config'

// L'ATELIER : le vitrail d'entraînement sert aussi à personnaliser le vitrail. On y modifie un BROUILLON de l'identité
// (langues, textes, logo, icône), visible seulement dans l'atelier ; « Publier » le fait passer sur le vrai vitrail.
// Les coordonnées juridiques, le site web et les courriels se règlent dans la console (Mon vitrail), sans brouillon.
//
// organizations.draft (organisme réel) = null (aucun changement en cours) ou
//   { locales, texts, logo_path, icon_path, logoSize, iconSize } : copie complète, partie de la version publiée.

export interface Draft {
  locales: Locale[]
  texts: StoredTexts
  logo_path: string | null
  icon_path: string | null
  logoSize: [number, number] | null
  iconSize: [number, number] | null
}

interface PublishedRow {
  locales: string[] | null
  texts: StoredTexts | null
  logo_path: string | null
  icon_path: string | null
  theme: Record<string, unknown> | null
  draft: Draft | null
  name_fr: string
}

const COLUMNS = 'locales,texts,logo_path,icon_path,theme,draft,name_fr'

async function row(orgId: string): Promise<PublishedRow> {
  const { data, error } = await getDb().from('organizations').select(COLUMNS).eq('id', orgId).single()
  if (error) throw error
  return data as unknown as PublishedRow
}

function publishedAsDraft(r: PublishedRow): Draft {
  return {
    locales: parseLocales(r.locales),
    texts: r.texts ?? {},
    logo_path: r.logo_path,
    icon_path: r.icon_path,
    logoSize: (r.theme?.logoSize as [number, number] | undefined) ?? null,
    iconSize: (r.theme?.iconSize as [number, number] | undefined) ?? null,
  }
}

/** Le brouillon en cours, ou la version publiée s'il n'y en a pas ; `pending` : des changements attendent d'être publiés. */
export async function loadDraft(orgId: string): Promise<{ draft: Draft; pending: boolean; fallbackName: string }> {
  const r = await row(orgId)
  return { draft: r.draft ?? publishedAsDraft(r), pending: !!r.draft, fallbackName: r.name_fr }
}

async function writeDraft(orgId: string, draft: Draft | null) {
  const { error } = await getDb().from('organizations').update({ draft, draft_updated_at: draft ? new Date().toISOString() : null }).eq('id', orgId)
  if (error) throw error
  forgetIdentity()
}

/** Langues : une ou deux, sans doublon, la première est la principale. */
export function validateLocales(v: unknown): Locale[] | null {
  if (!Array.isArray(v)) return null
  const out = [...new Set(v.filter(isLocale))] as Locale[]
  return out.length && out.length === v.length && out.length <= 2 ? out : null
}

/** Textes envoyés par l'atelier : champs connus, nettoyés, bornés. Erreur en français (console). */
export function validateTexts(v: unknown): { ok: true; texts: StoredTexts } | { ok: false; error: string } {
  if (!v || typeof v !== 'object') return { ok: false, error: 'Textes invalides.' }
  const texts: StoredTexts = {}
  for (const [l, fields] of Object.entries(v as Record<string, unknown>)) {
    if (!isLocale(l) || !fields || typeof fields !== 'object') return { ok: false, error: 'Langue inconnue.' }
    const out: Partial<Record<TextField, string>> = {}
    for (const f of TEXT_FIELDS) {
      const raw = (fields as Record<string, unknown>)[f]
      if (raw == null || raw === '') continue
      if (typeof raw !== 'string') return { ok: false, error: 'Texte invalide.' }
      const s = raw.replace(/\r\n/g, '\n').trim()
      if (s.length > TEXT_MAX[f]) return { ok: false, error: `Texte trop long : ${TEXT_MAX[f]} caractères au plus.` }
      if (s) out[f] = s
    }
    texts[l] = out
  }
  return { ok: true, texts }
}

/** Enregistre langues et textes du brouillon (le reste du brouillon est gardé). */
export async function saveDraft(orgId: string, patch: { locales?: Locale[]; texts?: StoredTexts }): Promise<Draft> {
  const { draft } = await loadDraft(orgId)
  const next: Draft = { ...draft, ...(patch.locales ? { locales: patch.locales } : {}), ...(patch.texts ? { texts: { ...draft.texts, ...patch.texts } } : {}) }
  await writeDraft(orgId, next)
  return next
}

const removeFiles = async (orgId: string, paths: (string | null | undefined)[]) => {
  const mine = [...new Set(paths.filter((p): p is string => !!p && p.startsWith(`org/${orgId}/`)))]
  if (!mine.length) return
  const { error } = await getDb().storage.from(PHOTO_BUCKET).remove(mine)
  if (error) console.error('Fichiers non supprimés (sans gravité) :', error.message)
}

/** Remplace (ou retire, path = null) le logo ou l'icône du brouillon. L'image remplacée est effacée si elle n'est pas publiée. */
export async function setDraftImage(orgId: string, type: 'logo' | 'icon', path: string | null, size: [number, number] | null): Promise<void> {
  const r = await row(orgId)
  const draft = r.draft ?? publishedAsDraft(r)
  const key = type === 'logo' ? 'logo_path' : 'icon_path'
  const old = draft[key]
  const published = r[key]
  const next: Draft = { ...draft, [key]: path, [type === 'logo' ? 'logoSize' : 'iconSize']: size }
  await writeDraft(orgId, next)
  if (old !== published) await removeFiles(orgId, [old])
}

/** Publier : le brouillon devient la version du vrai vitrail. Les anciennes images qui ne servent plus sont effacées. */
export async function publishDraft(orgId: string): Promise<{ ok: boolean }> {
  const r = await row(orgId)
  if (!r.draft) return { ok: false }
  const d = r.draft
  const old = { logo: r.logo_path, icon: r.icon_path }
  const primary = d.locales[0]
  const name = d.texts[primary]?.name || r.name_fr
  const theme = { ...(r.theme ?? {}), logoSize: d.logoSize, iconSize: d.iconSize }
  const db = getDb()
  const { error } = await db
    .from('organizations')
    .update({ locales: d.locales, texts: d.texts, logo_path: d.logo_path, icon_path: d.icon_path, theme, name_fr: name, draft: null, draft_updated_at: null, published_at: new Date().toISOString() })
    .eq('id', orgId)
  if (error) throw error
  // L'atelier porte le même nom (en-tête de sa console)
  await db.from('organizations').update({ name_fr: name }).eq('practice_of', orgId)
  await removeFiles(orgId, [old.logo !== d.logo_path ? old.logo : null, old.icon !== d.icon_path ? old.icon : null])
  forgetTenantCache()
  forgetIdentity()
  return { ok: true }
}

/** Abandonner le brouillon : l'atelier revient à la version publiée ; ses images non publiées sont effacées. */
export async function discardDraft(orgId: string): Promise<void> {
  const r = await row(orgId)
  const d = r.draft
  if (!d) return
  const unused = [d.logo_path !== r.logo_path ? d.logo_path : null, d.icon_path !== r.icon_path ? d.icon_path : null]
  await writeDraft(orgId, null)
  await removeFiles(orgId, unused)
}
