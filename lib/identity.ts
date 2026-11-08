import { headers } from 'next/headers'
import { getDb } from './db'
import { CONFIG } from './config'
import { translatorFor } from './i18n'
import { publicPhotoUrl } from './photos'
import { LOCALES, type Locale } from '@/i18n/config'
import { parseLocales, resolveTexts, type Defaults, type Identity, type LegalInfo, type OrgTexts, type StoredTexts } from './identity-shared'
import { SURFACE_HEADER, getOrg, resolveTenant, type OrgRow, type Surface } from './tenant'
export * from './identity-shared'

// Identité d'un organisme (nom, textes, logo, coordonnées juridiques), lue en base. L'entraînement prend celle de son
// organisme réel. Rien ici ne vient d'un autre organisme : un champ vide prend un texte neutre de la plateforme.

export interface IdentityRow {
  id: string
  name_fr: string
  website_url: string | null
  texts: StoredTexts | null
  legal: Partial<LegalInfo> | null
  theme: { logoSize?: [number, number]; iconSize?: [number, number] } | null
  logo_path: string | null
  icon_path: string | null
  locales: string[] | null
  sender_name: string | null
  reply_to: string | null
  /** Brouillon de l'atelier (voir lib/atelier.ts) : null s'il n'y a rien en cours. */
  draft?: { locales?: string[]; texts?: StoredTexts; logo_path?: string | null; icon_path?: string | null; logoSize?: [number, number] | null; iconSize?: [number, number] | null } | null
  published_at?: string | null
}

export const IDENTITY_COLUMNS = 'id,name_fr,website_url,texts,legal,theme,logo_path,icon_path,locales,sender_name,reply_to,draft,published_at'

/** Adresse d'un fichier de l'organisme : chemin du bucket, ou fichier statique du site (« /… »). */
export const assetUrl = (path: string | null | undefined): string | null => (!path ? null : path.startsWith('/') ? path : publicPhotoUrl(path))

export const neutralDefaults: Defaults = (locale, org) => {
  const t = translatorFor(locale)
  return {
    about: '',
    why: t('identite.why', { org }),
    vitrailTitle: t('identite.vitrailTitle'),
    testimonial: {
      question: t('identite.question', { org }),
      cta: t('identite.cta'),
      placeholder: t('identite.placeholder', { org }),
      lead: t('identite.lead'),
      consent: t('identite.consent', { org }),
    },
  }
}

/** L'identité telle que la montre l'atelier : le brouillon par-dessus la version publiée. */
export function withDraft(r: IdentityRow): IdentityRow {
  const d = r.draft
  if (!d) return r
  return {
    ...r,
    locales: d.locales ?? r.locales,
    texts: d.texts ?? r.texts,
    logo_path: d.logo_path !== undefined ? d.logo_path : r.logo_path,
    icon_path: d.icon_path !== undefined ? d.icon_path : r.icon_path,
    theme: { ...(r.theme ?? {}), logoSize: d.logoSize ?? undefined, iconSize: d.iconSize ?? undefined },
  }
}

export function identityFromRow(r: IdentityRow): Identity {
  const locales = parseLocales(r.locales)
  const stored = r.texts ?? {}
  const texts = Object.fromEntries(LOCALES.map(l => [l, resolveTexts(stored, locales, r.name_fr, r.website_url, neutralDefaults, l)])) as Record<Locale, OrgTexts>
  const legal = r.legal ?? {}
  return {
    orgId: r.id,
    locales,
    texts,
    logoUrl: assetUrl(r.logo_path),
    logoSize: r.theme?.logoSize ?? null,
    iconUrl: assetUrl(r.icon_path),
    legal: {
      entity: legal.entity ?? '',
      neq: legal.neq ?? '',
      address: legal.address ?? '',
      officerName: legal.officerName ?? '',
      officerEmail: legal.officerEmail ?? '',
      officerPhone: legal.officerPhone ?? '',
      retention: legal.retention ?? '',
      updated: legal.updated ?? '',
    },
    senderName: (r.sender_name || texts[locales[0]].name).trim(),
    replyTo: r.reply_to || legal.officerEmail || null,
  }
}

// Cache de quelques secondes, comme l'organisme (lib/tenant.ts) : chaque page publique en a besoin.
const TTL_MS = 10_000
const cache = new Map<string, { at: number; value: Identity | null }>()
export const forgetIdentity = () => cache.clear()

/**
 * Identité affichée par un organisme. L'atelier (organisme d'entraînement) montre celle de son organisme réel AVEC le
 * brouillon en cours ; le vrai vitrail, la version publiée. Null si l'organisme n'existe plus.
 */
export async function getIdentity(org: Pick<OrgRow, 'id' | 'practiceOf'>): Promise<Identity | null> {
  const id = org.practiceOf ?? org.id
  const key = `${id}:${org.practiceOf ? 'atelier' : 'public'}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const { data, error } = await getDb().from('organizations').select(IDENTITY_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  const r = data as unknown as IdentityRow | null
  const value = r ? identityFromRow(org.practiceOf ? withDraft(r) : r) : null
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Identité de l'organisme d'un courriel ; à défaut (organisme inconnu), une identité neutre au nom de la plateforme. */
export async function identityOrNeutral(organizationId: string | null | undefined): Promise<Identity> {
  const org = organizationId ? await getOrg(organizationId).catch(() => null) : null
  const found = org ? await getIdentity(org).catch(() => null) : null
  return found ?? NEUTRAL()
}

const NEUTRAL = (): Identity =>
  identityFromRow({ id: '', name_fr: CONFIG.brand.name, website_url: null, texts: {}, legal: {}, theme: {}, logo_path: null, icon_path: null, locales: ['fr', 'en'], sender_name: null, reply_to: null })

/**
 * Pour le rendu d'une page : l'identité de l'organisme de l'adresse, et la sorte de page (en-tête posé par proxy.ts).
 * Aucune identité sur les pages de la plateforme (vitrine, inscription, Studio).
 */
export async function requestIdentity(): Promise<{ identity: Identity | null; surface: Surface; atelier: boolean }> {
  const h = await headers()
  const raw = h.get(SURFACE_HEADER)
  const surface: Surface = raw === 'platform' || raw === 'console' ? raw : 'org'
  if (surface === 'platform') return { identity: null, surface, atelier: false }
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost'
  const r = await resolveTenant(new Request(`https://${host}/`, { headers: h })).catch(() => null)
  if (!r || !('tenant' in r)) return { identity: null, surface, atelier: false }
  return { identity: await getIdentity(r.tenant.org).catch(() => null), surface, atelier: !!r.tenant.org.practiceOf }
}
