import { createHash, randomBytes } from 'node:crypto'
import { getDb } from './db'
import { grantMailingConsent } from './consent'
import { paymentModeFor } from './env'
import { ANON_LABEL, CONFIG } from './config'
import { removePhotoFile } from './photos'
import { newPhotoStatus } from './settings'
import type { Tenant } from './tenant'
import { hasLocaleColumn, hasTestimonialColumns } from './schema'
import type { Locale } from '@/i18n/config'
import type { DonorProfileInput } from './validate'
import type { EventInfo, Piece, RecentDonation, Snapshot } from './types'

export type DonationSource = 'stripe' | 'cash' | 'seed' | 'demo'

// ── Lecture paginée (PostgREST plafonne à 1000 lignes par requête) ─────────────
export async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const db = getDb()
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Comme fetchAll, filtré par une colonne (organisme ou vitrail). */
export async function fetchWhere<T>(table: string, columns: string, column: string, value: string, orderBy: string): Promise<T[]> {
  const db = getDb()
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).eq(column, value).order(orderBy).range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// ── Donateurs ──────────────────────────────────────────────────────────────────
interface DonorRow {
  id: string
  email: string
}

/** Un donateur est propre à son organisme : le même courriel chez deux organismes, ce sont deux donateurs. */
async function findDonorByEmail(orgId: string, email: string): Promise<DonorRow | null> {
  const { data, error } = await getDb().from('donors').select('id,email').eq('organization_id', orgId).eq('email', email).maybeSingle()
  if (error) throw error
  return data
}

export interface RecordInput {
  organizationId: string
  /** Le vitrail où le don est fait (il doit appartenir à l'organisme : la base le vérifie aussi). */
  vitrailId: string
  email: string
  /** Utilisé seulement si le courriel est nouveau : on ne modifie jamais le profil d'un donateur existant ici. */
  profile: DonorProfileInput
  color: string
  /** Le don, sans les frais couverts. */
  amountCents: number
  /** Frais de transaction ajoutés par le donateur (payés en plus, hors du total affiché). */
  feeCents?: number
  source: DonationSource
  providerRef: string | null
  /** Provenance (écran, affiche…), pour savoir quels emplacements font donner. */
  channel?: string | null
  /** Commission de la plateforme sur ce don (cents), telle que prélevée par Stripe. */
  platformFeeCents?: number
  /** Langue du donateur à ce don (pour ses courriels) ; absente = on ne la change pas (français pour un nouveau donateur). */
  locale?: Locale
  /** Case « recevoir les nouvelles de l'organisme » cochée à ce don. Non cochée ne retire rien (le retrait passe par le lien personnel). */
  mailingConsent?: boolean
}

export interface RecordResult {
  donationId: string
  donorId: string
  duplicate: boolean
}

/**
 * Enregistre un don. Même courriel = même morceau, qui grossit. Un rappel du fournisseur de paiement
 * (même providerRef) ne double rien.
 */
export async function recordDonation(i: RecordInput): Promise<RecordResult> {
  const db = getDb()

  if (i.providerRef) {
    const { data: existing, error } = await db.from('donations').select('id,donor_id').eq('provider_ref', i.providerRef).maybeSingle()
    if (error) throw error
    if (existing) return { donationId: existing.id, donorId: existing.donor_id, duplicate: true }
  }

  let donor = await findDonorByEmail(i.organizationId, i.email)
  if (!donor) {
    const insert: Record<string, unknown> = {
      organization_id: i.organizationId,
      email: i.email,
      display_name: i.profile.name,
      show_name: i.profile.showName,
      message: i.profile.message,
      photo_url: i.profile.photoUrl,
      photo_status: i.profile.photoUrl ? await newPhotoStatus(i.organizationId) : 'approved',
      color: i.color,
    }
    // Témoignage : publié tout de suite ou mis en attente, comme les photos
    if (await hasTestimonialColumns()) {
      insert.message_status = i.profile.message ? await newPhotoStatus(i.organizationId) : 'approved'
      insert.quote_consent = i.profile.quoteConsent
    }
    if (i.locale && (await hasLocaleColumn())) insert.locale = i.locale
    const { data, error } = await db
      .from('donors')
      .insert(insert)
      .select('id,email')
      .single()
    if (error) {
      donor = await findDonorByEmail(i.organizationId, i.email) // deux dons simultanés du même courriel : le second retrouve le morceau
      if (!donor) throw error
    } else {
      donor = data
    }
  }

  // Donateur existant : sa langue est celle de son dernier don (jamais bloquant)
  if (i.locale && (await hasLocaleColumn())) {
    const { error: localeError } = await db.from('donors').update({ locale: i.locale }).eq('id', donor.id)
    if (localeError) console.error('Langue du donateur non enregistrée :', localeError.message)
  }

  if (i.mailingConsent) await grantMailingConsent(donor.id, i.locale ?? 'fr')

  const row: Record<string, unknown> = { organization_id: i.organizationId, vitrail_id: i.vitrailId, donor_id: donor.id, amount_cents: i.amountCents, source: i.source, provider_ref: i.providerRef, channel: i.channel ?? null }
  if (i.feeCents) row.fee_cents = i.feeCents
  if (i.platformFeeCents) row.platform_fee_cents = i.platformFeeCents
  let { data: donation, error: insertError } = await db.from('donations').insert(row).select('id').single()
  // Migration des frais pas encore passée : on enregistre le don quand même, sans les frais (jamais perdre un don)
  if (insertError && 'fee_cents' in row && /fee_cents/.test(insertError.message ?? '')) {
    console.error('Colonne fee_cents absente : lancez supabase/migrations/2026-11-03-frais.sql')
    delete row.fee_cents
    ;({ data: donation, error: insertError } = await db.from('donations').insert(row).select('id').single())
  }

  if (insertError) {
    if (insertError.code === '23505' && i.providerRef) {
      const { data: existing } = await db.from('donations').select('id,donor_id').eq('provider_ref', i.providerRef).single()
      if (existing) return { donationId: existing.id, donorId: existing.donor_id, duplicate: true }
    }
    throw insertError
  }
  return { donationId: donation!.id, donorId: donor.id, duplicate: false }
}

export async function updateDonorProfile(
  orgId: string,
  donorId: string,
  profile: DonorProfileInput,
  color?: string,
  previousPhotoUrl?: string | null,
  previousMessage?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    display_name: profile.name,
    show_name: profile.showName,
    message: profile.message,
    photo_url: profile.photoUrl,
    updated_at: new Date().toISOString(),
  }
  if (color) patch.color = color
  // Nouvelle photo : publiée tout de suite ou mise en attente, selon le mode de la console
  if (profile.photoUrl && profile.photoUrl !== previousPhotoUrl) patch.photo_status = await newPhotoStatus(orgId)
  if (await hasTestimonialColumns()) {
    if (profile.message !== previousMessage) patch.message_status = profile.message ? await newPhotoStatus(orgId) : 'approved'
    patch.quote_consent = profile.quoteConsent
  }
  const { error } = await getDb().from('donors').update(patch).eq('id', donorId).eq('organization_id', orgId)
  if (error) throw error
  // L'ancienne photo, remplacée ou retirée, quitte le stockage (après la mise à jour, jamais avant)
  if (previousPhotoUrl && previousPhotoUrl !== profile.photoUrl) await removePhotoFile(previousPhotoUrl, orgId)
}

// ── Liens magiques ─────────────────────────────────────────────────────────────
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createToken(donorId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const { error } = await getDb()
    .from('edit_tokens')
    .insert({ token_hash: hashToken(token), donor_id: donorId, expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() })
  if (error) throw error
  return token
}

export async function createTokenForEmail(orgId: string, email: string): Promise<{ token: string; donorId: string } | null> {
  const donor = await findDonorByEmail(orgId, email)
  return donor ? { token: await createToken(donor.id), donorId: donor.id } : null
}

export interface DonorView {
  id: string
  organizationId: string
  email: string
  showName: boolean
  name: string
  message: string | null
  photoUrl: string | null
  /** La photo attend l'approbation de l'équipe (mode modération). */
  photoPending: boolean
  /** Le témoignage attend l'approbation de l'équipe. */
  messagePending: boolean
  quoteConsent: boolean
  color: string
  totalCents: number
}

/** Le lien n'ouvre que le morceau d'un donateur de CET organisme : un lien de l'un ne marche jamais chez l'autre. */
export async function resolveToken(token: string, orgId: string): Promise<DonorView | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null
  const db = getDb()
  const { data: row } = await db.from('edit_tokens').select('donor_id,expires_at').eq('token_hash', hashToken(token)).maybeSingle()
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null
  return getDonorView(row.donor_id, orgId)
}

export async function getDonorView(donorId: string, orgId: string): Promise<DonorView | null> {
  const db = getDb()
  const extra = (await hasTestimonialColumns()) ? ',message_status,quote_consent' : ''
  const { data } = await db.from('donors').select(`id,email,display_name,show_name,message,photo_url,photo_status,color${extra}`).eq('id', donorId).eq('organization_id', orgId).maybeSingle()
  const d = data as unknown as (DonorPublicRow & { email: string; quote_consent?: boolean }) | null
  if (!d) return null
  const { data: t } = await db.from('donor_totals').select('total_cents').eq('donor_id', donorId).maybeSingle()
  return {
    id: d.id,
    organizationId: orgId,
    email: d.email,
    showName: d.show_name,
    name: d.display_name,
    message: d.message,
    photoUrl: d.photo_url,
    photoPending: d.photo_status === 'pending',
    messagePending: d.message_status === 'pending',
    quoteConsent: !!d.quote_consent,
    color: d.color,
    totalCents: Number(t?.total_cents ?? 0),
  }
}

/** Ajoute ou remplace le témoignage d'un morceau, sans toucher au reste (bandeau de remerciement, lien reçu par courriel). */
export async function updateTestimonial(donor: DonorView, message: string | null, quoteConsent: boolean): Promise<{ pending: boolean }> {
  const patch: Record<string, unknown> = { message, updated_at: new Date().toISOString() }
  let pending = false
  if (await hasTestimonialColumns()) {
    if (message !== donor.message) {
      patch.message_status = message ? await newPhotoStatus(donor.organizationId) : 'approved'
      pending = patch.message_status === 'pending'
    } else pending = donor.messagePending
    patch.quote_consent = quoteConsent && !!message
  }
  const { error } = await getDb().from('donors').update(patch).eq('id', donor.id).eq('organization_id', donor.organizationId)
  if (error) throw error
  return { pending }
}

/** Retrouve le morceau d'un paiement à partir de la référence du fournisseur (session Stripe, démo…). */
export async function findByProviderRef(ref: string, orgId: string): Promise<{ donorId: string; amountCents: number } | null> {
  if (typeof ref !== 'string' || ref.length < 8 || ref.length > 200) return null
  const { data } = await getDb().from('donations').select('donor_id,amount_cents').eq('provider_ref', ref).eq('organization_id', orgId).maybeSingle()
  return data ? { donorId: data.donor_id, amountCents: data.amount_cents } : null
}

// ── Instantané public ─────────────────────────────────────────────────────────
function fnv(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

interface DonorPublicRow {
  id: string
  display_name: string
  show_name: boolean
  message: string | null
  photo_url: string | null
  photo_status: string
  /** Absent tant que la migration des témoignages n'est pas passée. */
  message_status?: string
  color: string
  hidden: boolean
}

/**
 * L'instantané public d'un vitrail. Les règles d'affichage (campagne = ses dons ; permanent = tous sauf les campagnes
 * privées ; remboursements déduits) vivent dans les vues vitrail_* de la base : ici on ne filtre que par vitrail.
 */
export async function getSnapshot(tenant: Tenant): Promise<Snapshot> {
  const db = getDb()
  const { org, vitrail } = tenant
  const ms = (await hasTestimonialColumns()) ? ',message_status' : ''

  const [totals, donors, vtRes, recentRes] = await Promise.all([
    fetchWhere<{ donor_id: string; total_cents: number | string }>('vitrail_donor_totals', 'donor_id,total_cents', 'vitrail_id', vitrail.id, 'donor_id'),
    fetchWhere<DonorPublicRow>('donors', `id,display_name,show_name,message,photo_url,photo_status,color,hidden${ms}`, 'organization_id', org.id, 'id'),
    db.from('vitrail_totals').select('total_cents,donations_count').eq('vitrail_id', vitrail.id).maybeSingle(),
    // Les 30 derniers dons du vitrail (les donateurs masqués en retirent quelques-uns) ; une vue ne se joint pas aux donateurs :
    // on les relie ensuite avec la liste des donateurs de l'organisme, déjà lue.
    db
      .from('vitrail_donations')
      .select('donation_id,donor_id,net_cents,created_at')
      .eq('vitrail_id', vitrail.id)
      .gt('net_cents', 0)
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  if (vtRes.error) throw vtRes.error
  if (recentRes.error) throw recentRes.error

  const totalByDonor = new Map(totals.map(t => [t.donor_id, Number(t.total_cents)]))
  const pieces: Piece[] = donors
    .filter(d => !d.hidden && (totalByDonor.get(d.id) ?? 0) > 0)
    .map(d => ({
      id: d.id,
      name: d.show_name ? d.display_name : null,
      message: d.message_status === 'pending' ? null : d.message,
      photoUrl: d.photo_status === 'approved' ? d.photo_url : null,
      color: d.color,
      amountCents: totalByDonor.get(d.id) ?? 0,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))

  const totalCents = Number(vtRes.data?.total_cents ?? 0)
  // Toujours présent : « goalCents 0 » veut dire « pas d'objectif » (les pages le savent déjà)
  const event: EventInfo = { id: vitrail.id, name: vitrail.name, goalCents: vitrail.goalCents, totalCents }

  const donorById = new Map(donors.map(d => [d.id, d]))
  const recent: RecentDonation[] = ((recentRes.data ?? []) as { donation_id: string; donor_id: string; net_cents: number; created_at: string }[])
    .map(r => ({ r, d: donorById.get(r.donor_id) }))
    .filter((x): x is { r: (typeof x)['r']; d: DonorPublicRow } => !!x.d && !x.d.hidden)
    .slice(0, 15)
    .map(({ r, d }) => ({
      id: r.donation_id,
      donorId: r.donor_id,
      name: d.show_name ? d.display_name : null,
      message: d.message_status === 'pending' ? null : d.message,
      photoUrl: d.photo_status === 'approved' ? d.photo_url : null,
      amountCents: r.net_cents,
      at: r.created_at,
    }))

  // « La plupart donnent X $ » : médiane des morceaux, ramenée au montant suggéré le plus proche
  let typicalCents: number | null = null
  if (pieces.length >= CONFIG.typicalMinDonors) {
    const sorted = pieces.map(p => p.amountCents).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    typicalCents = CONFIG.suggestedCents.reduce((best, c) => (Math.abs(c - median) < Math.abs(best - median) ? c : best), CONFIG.suggestedCents[0])
  }
  const version = fnv(JSON.stringify([vitrail.id, pieces, event, totalCents]))

  return {
    version,
    at: new Date().toISOString(),
    mode: paymentModeFor(org),
    event,
    totalCents,
    donationsCount: Number(vtRes.data?.donations_count ?? 0),
    pieces,
    recent,
    typicalCents,
  }
}

export { ANON_LABEL }
