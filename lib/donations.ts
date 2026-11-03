import { createHash, randomBytes } from 'node:crypto'
import { getDb } from './db'
import { paymentMode } from './env'
import { ANON_LABEL, CONFIG } from './config'
import { removePhotoFile } from './photos'
import { newPhotoStatus } from './settings'
import { hasTestimonialColumns } from './schema'
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

// ── Événements ─────────────────────────────────────────────────────────────────
export async function getCurrentEventRow(): Promise<{ id: string; name: string; goal_cents: number } | null> {
  const { data, error } = await getDb().from('events').select('id,name,goal_cents').eq('is_current', true).maybeSingle()
  if (error) throw error
  return data
}

// ── Donateurs ──────────────────────────────────────────────────────────────────
interface DonorRow {
  id: string
  email: string
}

async function findDonorByEmail(email: string): Promise<DonorRow | null> {
  const { data, error } = await getDb().from('donors').select('id,email').eq('email', email).maybeSingle()
  if (error) throw error
  return data
}

export interface RecordInput {
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
  /** undefined = événement en cours ; null = aucun. */
  eventId?: string | null
  /** Provenance (écran, affiche…), pour savoir quels emplacements font donner. */
  channel?: string | null
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

  let donor = await findDonorByEmail(i.email)
  if (!donor) {
    const insert: Record<string, unknown> = {
      email: i.email,
      display_name: i.profile.name,
      show_name: i.profile.showName,
      message: i.profile.message,
      photo_url: i.profile.photoUrl,
      photo_status: i.profile.photoUrl ? await newPhotoStatus() : 'approved',
      color: i.color,
    }
    // Témoignage : publié tout de suite ou mis en attente, comme les photos
    if (await hasTestimonialColumns()) {
      insert.message_status = i.profile.message ? await newPhotoStatus() : 'approved'
      insert.quote_consent = i.profile.quoteConsent
    }
    const { data, error } = await db
      .from('donors')
      .insert(insert)
      .select('id,email')
      .single()
    if (error) {
      donor = await findDonorByEmail(i.email) // deux dons simultanés du même courriel : le second retrouve le morceau
      if (!donor) throw error
    } else {
      donor = data
    }
  }

  const eventId = i.eventId !== undefined ? i.eventId : (await getCurrentEventRow())?.id ?? null
  const row: Record<string, unknown> = { donor_id: donor.id, event_id: eventId, amount_cents: i.amountCents, source: i.source, provider_ref: i.providerRef, channel: i.channel ?? null }
  if (i.feeCents) row.fee_cents = i.feeCents
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
  if (profile.photoUrl && profile.photoUrl !== previousPhotoUrl) patch.photo_status = await newPhotoStatus()
  if (await hasTestimonialColumns()) {
    if (profile.message !== previousMessage) patch.message_status = profile.message ? await newPhotoStatus() : 'approved'
    patch.quote_consent = profile.quoteConsent
  }
  const { error } = await getDb().from('donors').update(patch).eq('id', donorId)
  if (error) throw error
  // L'ancienne photo, remplacée ou retirée, quitte le stockage (après la mise à jour, jamais avant)
  if (previousPhotoUrl && previousPhotoUrl !== profile.photoUrl) await removePhotoFile(previousPhotoUrl)
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

export async function createTokenForEmail(email: string): Promise<string | null> {
  const donor = await findDonorByEmail(email)
  return donor ? createToken(donor.id) : null
}

export interface DonorView {
  id: string
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

export async function resolveToken(token: string): Promise<DonorView | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null
  const db = getDb()
  const { data: row } = await db.from('edit_tokens').select('donor_id,expires_at').eq('token_hash', hashToken(token)).maybeSingle()
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null
  return getDonorView(row.donor_id)
}

export async function getDonorView(donorId: string): Promise<DonorView | null> {
  const db = getDb()
  const extra = (await hasTestimonialColumns()) ? ',message_status,quote_consent' : ''
  const { data } = await db.from('donors').select(`id,email,display_name,show_name,message,photo_url,photo_status,color${extra}`).eq('id', donorId).maybeSingle()
  const d = data as unknown as (DonorPublicRow & { email: string; quote_consent?: boolean }) | null
  if (!d) return null
  const { data: t } = await db.from('donor_totals').select('total_cents').eq('donor_id', donorId).maybeSingle()
  return {
    id: d.id,
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
      patch.message_status = message ? await newPhotoStatus() : 'approved'
      pending = patch.message_status === 'pending'
    } else pending = donor.messagePending
    patch.quote_consent = quoteConsent && !!message
  }
  const { error } = await getDb().from('donors').update(patch).eq('id', donor.id)
  if (error) throw error
  return { pending }
}

/** Retrouve le morceau d'un paiement à partir de la référence du fournisseur (session Stripe, démo…). */
export async function findByProviderRef(ref: string): Promise<{ donorId: string; amountCents: number } | null> {
  if (typeof ref !== 'string' || ref.length < 8 || ref.length > 200) return null
  const { data } = await getDb().from('donations').select('donor_id,amount_cents').eq('provider_ref', ref).maybeSingle()
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

export async function getSnapshot(): Promise<Snapshot> {
  const db = getDb()
  const ms = (await hasTestimonialColumns()) ? ',message_status' : ''
  const [donors, totals, currentRes, grandRes, recentRes] = await Promise.all([
    fetchAll<DonorPublicRow>('donors', `id,display_name,show_name,message,photo_url,photo_status,color,hidden${ms}`),
    fetchAll<{ donor_id: string; total_cents: number | string }>('donor_totals', 'donor_id,total_cents'),
    db.from('events').select('id,name,goal_cents').eq('is_current', true).maybeSingle(),
    db.from('grand_total').select('total_cents,donations_count').maybeSingle(),
    db
      .from('donations')
      .select(`id,donor_id,amount_cents,created_at,donors!inner(display_name,show_name,message,photo_url,photo_status,hidden${ms})`)
      .order('created_at', { ascending: false })
      .limit(15),
  ])
  if (currentRes.error) throw currentRes.error
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

  let event: EventInfo | null = null
  if (currentRes.data) {
    const { data: et } = await db.from('event_totals').select('total_cents').eq('event_id', currentRes.data.id).maybeSingle()
    event = {
      id: currentRes.data.id,
      name: currentRes.data.name,
      goalCents: currentRes.data.goal_cents,
      totalCents: Number(et?.total_cents ?? 0),
    }
  }

  type RecentDonor = { display_name: string; show_name: boolean; message: string | null; photo_url: string | null; photo_status: string; message_status?: string; hidden: boolean }
  type RecentRow = {
    id: string
    donor_id: string
    amount_cents: number
    created_at: string
    donors: RecentDonor | RecentDonor[]
  }
  const recent: RecentDonation[] = ((recentRes.data ?? []) as unknown as RecentRow[])
    .map(r => ({ r, d: Array.isArray(r.donors) ? r.donors[0] : r.donors }))
    .filter(({ d }) => d && !d.hidden)
    .map(({ r, d }) => ({
      id: r.id,
      donorId: r.donor_id,
      name: d.show_name ? d.display_name : null,
      message: d.message_status === 'pending' ? null : d.message,
      photoUrl: d.photo_status === 'approved' ? d.photo_url : null,
      amountCents: r.amount_cents,
      at: r.created_at,
    }))

  const totalCents = Number(grandRes.data?.total_cents ?? 0)

  // « La plupart donnent X $ » : médiane des morceaux, ramenée au montant suggéré le plus proche
  let typicalCents: number | null = null
  if (pieces.length >= CONFIG.typicalMinDonors) {
    const sorted = pieces.map(p => p.amountCents).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    typicalCents = CONFIG.suggestedCents.reduce((best, c) => (Math.abs(c - median) < Math.abs(best - median) ? c : best), CONFIG.suggestedCents[0])
  }
  const version = fnv(JSON.stringify([pieces, event, totalCents]))

  return {
    version,
    at: new Date().toISOString(),
    mode: paymentMode(),
    event,
    totalCents,
    donationsCount: Number(grandRes.data?.donations_count ?? 0),
    pieces,
    recent,
    typicalCents,
  }
}

export { ANON_LABEL }
