import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import { ANON_LABEL, VALID_COLORS } from './config'
import { PHOTO_BUCKET, donorPhotoDir, orgOfPhotoPath, pathFromPublicUrl, publicPhotoUrl } from './photos'
import { forgetTenantCache, getOrg, getPermanentVitrail, orgUrl } from './tenant'
import { getSnapshot } from './donations'
import type { Snapshot } from './types'
import { forgetIdentity } from './identity'
import {
  DEMO_NAME, DEMO_SLUG, DEMO_TEXTS, FIRST_NAMES_EN, FIRST_NAMES_FR, LAST_NAMES_EN, LAST_NAMES_FR, TESTIMONIALS_EN, TESTIMONIALS_FR,
} from './demo-data'

// Vitrail de démonstration (étape C) : un organisme FICTIF (`showcase`), en lecture seule, montré par la vitrine.
// Ses ~200 donateurs sont générés ici de façon déterministe (même graine = mêmes donateurs) ; leurs dates sont placées
// avant le moment de la génération, pour que « Derniers dons » paraisse vivant. Studio relance la génération quand il veut.
// Les photos sont téléversées par Studio (jamais de banque d'images de visages) et attribuées au hasard aux morceaux nommés.

export const DEMO_DONORS = 200
const SEED = 20261204
const DAY = 86_400_000

/** Générateur pseudo-aléatoire à graine (mulberry32) : la démo est reproductible. */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  }
}

// Montants (en dollars) et leur poids : beaucoup de petits dons, quelques gros, comme une vraie collecte de village
const AMOUNTS: [number, number][] = [
  [10, 14], [20, 18], [25, 13], [30, 4], [40, 4], [50, 18], [75, 5], [100, 12], [150, 3], [200, 4], [250, 2], [500, 2], [1000, 1],
]
const totalWeight = AMOUNTS.reduce((n, [, w]) => n + w, 0)

export interface DemoDonor {
  index: number
  email: string
  displayName: string
  showName: boolean
  message: string | null
  locale: 'fr' | 'en'
  color: string
  /** Dons, du plus ancien au plus récent : montant (cents) et date. */
  donations: { amountCents: number; at: string }[]
}

/** Les donateurs de la démo, toujours les mêmes pour une graine donnée ; dates placées avant `now`. */
export function generateDemoDonors(now: number, count = DEMO_DONORS, seed = SEED): DemoDonor[] {
  const r = rng(seed)
  const testimonialsFr = [...TESTIMONIALS_FR]
  const testimonialsEn = [...TESTIMONIALS_EN]
  const usedNames = new Set<string>()
  const amount = () => {
    let x = r.next() * totalWeight
    for (const [dollars, w] of AMOUNTS) if ((x -= w) < 0) return dollars * 100
    return 2000
  }
  // Une collecte de six semaines, plus animée à la fin (les dons récents font vivre « Derniers dons »)
  const when = () => now - Math.floor(Math.pow(r.next(), 2.2) * 42 * DAY) - r.int(60_000, 3_600_000)

  const out: DemoDonor[] = []
  for (let i = 0; i < count; i++) {
    const english = r.chance(0.22)
    const named = r.chance(0.72)
    let displayName = ANON_LABEL
    if (named) {
      for (let tries = 0; tries < 20; tries++) {
        const first = english ? r.pick(FIRST_NAMES_EN) : r.pick(FIRST_NAMES_FR)
        const last = english ? r.pick(LAST_NAMES_EN) : r.pick(LAST_NAMES_FR)
        const style = r.next()
        const candidate = style < 0.62 ? `${first} ${last}` : style < 0.9 ? `${first} ${last[0]}.` : english ? `The ${last} family` : `Famille ${last}`
        if (!usedNames.has(candidate)) {
          displayName = candidate
          usedNames.add(candidate)
          break
        }
      }
    }
    // Un témoignage pour plus de la moitié des donateurs nommés (rarement chez les anonymes), dans sa langue, sans répétition
    const pool = english ? testimonialsEn : testimonialsFr
    const message = pool.length && r.chance(named ? 0.55 : 0.12) ? pool.splice(Math.floor(r.next() * pool.length), 1)[0] : null
    const times = r.chance(0.12) ? r.int(2, 3) : 1
    const donations = Array.from({ length: times }, () => ({ amountCents: amount(), at: new Date(when()).toISOString() })).sort((a, b) => a.at.localeCompare(b.at))
    out.push({
      index: i,
      email: `demo-${i}@demo.invalid`,
      displayName,
      showName: displayName !== ANON_LABEL,
      message,
      locale: english ? 'en' : 'fr',
      color: r.pick(VALID_COLORS),
      donations,
    })
  }
  return out
}

// ── En base ─────────────────────────────────────────────────────────────────────

export interface DemoState {
  exists: boolean
  orgId: string | null
  donors: number
  totalCents: number
  photos: number
  /** Morceaux nommés encore sans photo (ceux qui en recevront une). */
  namedWithoutPhoto: number
}

async function demoOrgId(): Promise<string | null> {
  const db = getDb()
  const { data } = await db.from('organization_slugs').select('organization_id').eq('slug', DEMO_SLUG).maybeSingle()
  if (!data) return null
  const { data: org } = await db.from('organizations').select('id,showcase').eq('id', data.organization_id).maybeSingle()
  // L'identifiant « demo » n'appartient qu'à un organisme de démonstration : jamais on ne touche à un autre
  if (!org?.showcase) throw new Error('L’identifiant « demo » est pris par un organisme qui n’est pas une démonstration.') // i18n-ok : Studio (FR)
  return org.id as string
}

export async function demoState(): Promise<DemoState> {
  const orgId = await demoOrgId()
  if (!orgId) return { exists: false, orgId: null, donors: 0, totalCents: 0, photos: 0, namedWithoutPhoto: 0 }
  const db = getDb()
  const [{ data: donors }, { data: totals }] = await Promise.all([
    db.from('donors').select('id,show_name,photo_url').eq('organization_id', orgId),
    db.from('vitrail_totals').select('total_cents').eq('organization_id', orgId),
  ])
  const rows = (donors ?? []) as { show_name: boolean; photo_url: string | null }[]
  return {
    exists: true,
    orgId,
    donors: rows.length,
    totalCents: (totals ?? []).reduce((n, t) => n + Number(t.total_cents ?? 0), 0),
    photos: rows.filter(d => d.photo_url).length,
    namedWithoutPhoto: rows.filter(d => d.show_name && !d.photo_url).length,
  }
}

/** Crée l'organisme de démonstration s'il n'existe pas (identité FR/EN, adresse « demo », vitrail permanent). */
async function ensureDemoOrg(): Promise<{ orgId: string; vitrailId: string }> {
  const db = getDb()
  let orgId = await demoOrgId()
  if (!orgId) {
    const now = new Date().toISOString()
    const { data: org, error } = await db
      .from('organizations')
      .insert({ name_fr: DEMO_NAME, status: 'live', showcase: true, locales: ['fr', 'en'], texts: DEMO_TEXTS, photo_moderation: 'live', created_at: now, went_live_at: now, published_at: now })
      .select('id')
      .single()
    if (error) throw error
    orgId = org.id as string
    const slug = await db.from('organization_slugs').insert({ slug: DEMO_SLUG, organization_id: orgId, is_current: true, created_at: now })
    if (slug.error) {
      await db.from('organizations').delete().eq('id', orgId)
      throw slug.error
    }
  } else {
    // Les textes suivent lib/demo-data.ts à chaque génération
    const { error } = await db.from('organizations').update({ name_fr: DEMO_NAME, texts: DEMO_TEXTS, locales: ['fr', 'en'] }).eq('id', orgId)
    if (error) throw error
  }
  const { data: perm } = await db.from('vitraux').select('id').eq('organization_id', orgId).eq('kind', 'permanent').maybeSingle()
  let vitrailId = perm?.id as string | undefined
  if (!vitrailId) {
    const { data: v, error } = await db.from('vitraux').insert({ organization_id: orgId, kind: 'permanent', name: DEMO_TEXTS.fr!.vitrailTitle! }).select('id').single()
    if (error) throw error
    vitrailId = v.id as string
  }
  forgetTenantCache()
  forgetIdentity()
  return { orgId, vitrailId }
}

/**
 * (Re)génère les donateurs de la démo : efface ceux d'avant et leurs dons, en recrée DEMO_DONORS aux dates d'aujourd'hui.
 * Les photos déjà téléversées sont gardées et redistribuées au hasard entre les nouveaux morceaux nommés.
 */
export async function generateDemo(now = Date.now()): Promise<DemoState> {
  const db = getDb()
  const { orgId, vitrailId } = await ensureDemoOrg()

  const { data: old } = await db.from('donors').select('photo_url').eq('organization_id', orgId)
  const photos = ((old ?? []) as { photo_url: string | null }[]).map(d => d.photo_url).filter((u): u is string => !!u && pathFromPublicUrl(u, orgId) !== null)
  const delDonations = await db.from('donations').delete().eq('organization_id', orgId)
  if (delDonations.error) throw delDonations.error
  const delDonors = await db.from('donors').delete().eq('organization_id', orgId)
  if (delDonors.error) throw delDonors.error

  const donors = generateDemoDonors(now)
  const r = rng(SEED + 1)
  const shuffled = [...photos].sort(() => r.next() - 0.5)
  const named = donors.filter(d => d.showName)
  const withPhoto = new Map(named.slice(0, shuffled.length).map((d, i) => [d.index, shuffled[i]]))
  const rows = donors.map(d => ({
    organization_id: orgId,
    email: d.email,
    display_name: d.displayName,
    show_name: d.showName,
    message: d.message,
    message_status: 'approved',
    quote_consent: !!d.message,
    photo_url: withPhoto.get(d.index) ?? null,
    photo_status: 'approved',
    color: d.color,
    locale: d.locale,
    created_at: d.donations[0].at,
    updated_at: d.donations[0].at,
  }))
  const { data: inserted, error } = await db.from('donors').insert(rows).select('id,email')
  if (error) throw error
  const idByEmail = new Map(((inserted ?? []) as { id: string; email: string }[]).map(x => [x.email, x.id]))
  const donationRows = donors.flatMap(d =>
    d.donations.map(n => ({ organization_id: orgId, vitrail_id: vitrailId, donor_id: idByEmail.get(d.email), amount_cents: n.amountCents, source: 'seed', provider_ref: null, created_at: n.at })),
  )
  for (let i = 0; i < donationRows.length; i += 200) {
    const { error: dErr } = await db.from('donations').insert(donationRows.slice(i, i + 200))
    if (dErr) throw dErr
  }
  return demoState()
}

/** Une photo téléversée par Studio : rangée chez la démo, donnée à un morceau nommé qui n'en a pas (au hasard). */
export async function addDemoPhoto(bytes: Buffer): Promise<{ ok: true } | { ok: false; reason: 'noDemo' | 'full' }> {
  const orgId = await demoOrgId()
  if (!orgId) return { ok: false, reason: 'noDemo' }
  const db = getDb()
  const { data } = await db.from('donors').select('id').eq('organization_id', orgId).eq('show_name', true).is('photo_url', null)
  const free = (data ?? []) as { id: string }[]
  if (!free.length) return { ok: false, reason: 'full' }
  const target = free[Math.floor(Math.random() * free.length)]
  const path = `${donorPhotoDir(orgId)}${randomUUID()}.jpg`
  const up = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (up.error) throw up.error
  const { error } = await db.from('donors').update({ photo_url: publicPhotoUrl(path), photo_status: 'approved' }).eq('id', target.id).eq('organization_id', orgId)
  if (error) {
    await db.storage.from(PHOTO_BUCKET).remove([path])
    throw error
  }
  return { ok: true }
}

/** Retire toutes les photos de la démo (fiches et fichiers). */
export async function removeDemoPhotos(): Promise<number> {
  const orgId = await demoOrgId()
  if (!orgId) return 0
  const db = getDb()
  const { data } = await db.from('donors').select('photo_url').eq('organization_id', orgId).not('photo_url', 'is', null)
  const paths = ((data ?? []) as { photo_url: string }[]).map(d => pathFromPublicUrl(d.photo_url, orgId)).filter((p): p is string => !!p && orgOfPhotoPath(p) === orgId)
  const { error } = await db.from('donors').update({ photo_url: null }).eq('organization_id', orgId)
  if (error) throw error
  for (let i = 0; i < paths.length; i += 100) await db.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100))
  return paths.length
}

/**
 * La démo telle que la vitrine la montre : son instantané (le même que /api/vitrail) et ses adresses. null si la démo
 * n'existe pas encore sur cette base, ou en cas d'erreur : la vitrine garde alors son vitrail fictif. Jamais d'exception.
 */
export async function demoForVitrine(request?: Request): Promise<{ snapshot: Snapshot; links: { vitrail: string; ecran: string; screen: string } } | null> {
  try {
    const orgId = await demoOrgId()
    if (!orgId) return null
    const [org, vitrail] = await Promise.all([getOrg(orgId), getPermanentVitrail(orgId)])
    if (!org || !vitrail) return null
    const snapshot = await getSnapshot({ org, vitrail })
    if (!snapshot.pieces.length) return null
    return {
      snapshot,
      links: { vitrail: orgUrl(DEMO_SLUG, '/vitrail', request), ecran: orgUrl(DEMO_SLUG, '/ecran', request), screen: orgUrl(DEMO_SLUG, '/screen', request) },
    }
  } catch (e) {
    console.error('Démo pour la vitrine :', e)
    return null
  }
}
