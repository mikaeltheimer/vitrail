// Données renvoyées par GET /api/admin (console v2)

import type { BillingSummary } from '@/lib/platform-fee'

export type Role = 'owner' | 'volunteer'

export interface DonorRow {
  id: string
  email: string
  display_name: string
  show_name: boolean
  message: string | null
  message_status?: 'approved' | 'pending'
  quote_consent?: boolean
  /** Date du dernier consentement à la citation (null : donné avant le 18 nov. 2026, ou jamais). */
  quote_consent_at?: string | null
  message_question?: string | null
  updated_at?: string
  photo_url: string | null
  photo_status: 'approved' | 'pending'
  color: string
  hidden: boolean
  created_at: string
  /** Renseignements supprimés à la demande du donateur (Loi 25) */
  erased_at?: string | null
  totalCents: number
  lastDonationAt: string | null
}

export interface DonationDonor {
  display_name: string
  email: string
  hidden: boolean
  photo_url: string | null
  photo_status: 'approved' | 'pending'
}

export interface DonationRow {
  id: string
  donor_id: string
  amount_cents: number
  fee_cents: number | null
  donor_contribution_cents?: number | null
  refunded_cents: number
  dispute_status: 'open' | 'won' | 'lost' | null
  dispute_due_by: string | null
  source: string
  channel: string | null
  created_at: string
  donors: DonationDonor | DonationDonor[] | null
}

export interface ConsoleData {
  /** Adresse du vitrail (Plus) : propriétaire de l'organisme réel seulement, sinon null. */
  address?: { current: string; draft: boolean; changesLeft: number | null; max: number; previous: string[]; domain: string } | null
  org: { name: string; slug: string; status: 'draft' | 'live' | 'suspended'; practice: boolean }
  /** Console de l'autre côté : l'entraînement depuis l'organisme réel, et inversement. */
  switchUrl: string | null
  /** Adresse publique du vitrail principal de cet organisme. */
  vitrailUrl: string
  /** Coordonnées juridiques qui manquent avant la mise en ligne. */
  identityMissing: string[]
  /** Le vitrail de l'atelier (mode Modifier). */
  atelierUrl: string | null
  /** Une version personnalisée a déjà été publiée depuis l'atelier. */
  published: boolean
  /** Carte « Votre forfait » (C) : propriétaire de l'organisme réel seulement, sinon null. */
  billing: BillingSummary | null
  /** Conditions de la plateforme (D8) : version en vigueur acceptée ? null pour l'atelier et la démo. */
  terms: { version: string; effectiveDate: string; accepted: boolean; acceptedAt: string | null; acceptedBy: string | null; exempt: boolean } | null
  summary: { totalCents: number; donations: number; donors: number; goalCents: number | null }
  me: { name: string; email: string; role: Role; accountId: string }
  orgs: { id: string; name: string; url: string }[]
  team: {
    members: { accountId: string; email: string; name: string; role: Role }[]
    invitations: { id: string; email: string; role: Role; expiresAt: string }[]
  } | null
  mode: 'stripe' | 'demo' | 'off'
  stripe: { accountId: string | null; ready: boolean }
  photoModeration: 'live' | 'moderation'
  reports: { id: number; donor_id: string; reason: string | null; created_at: string }[]
  disputes: { id: string; amount_cents: number; fee_cents: number | null; donor_contribution_cents?: number | null; dispute_due_by: string | null; created_at: string }[]
  bounces: { donorId: string; email: string; status: string; at: string }[]
  /** Dons de démonstration encore présents. */
  demoDonations?: number
  mailingCount: number
  channels: { channel: string; visits: number; donations: number; totalCents: number }[]
  donors: DonorRow[]
  donations: DonationRow[]
}

export type Act = (payload: Record<string, unknown>, okText?: string) => Promise<boolean>

export const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
