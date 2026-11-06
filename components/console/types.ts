// Données renvoyées par GET /api/admin (console v2)

export type Role = 'owner' | 'volunteer'

export interface DonorRow {
  id: string
  email: string
  display_name: string
  show_name: boolean
  message: string | null
  message_status?: 'approved' | 'pending'
  quote_consent?: boolean
  photo_url: string | null
  photo_status: 'approved' | 'pending'
  color: string
  hidden: boolean
  created_at: string
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
  refunded_cents: number
  dispute_status: 'open' | 'won' | 'lost' | null
  dispute_due_by: string | null
  source: string
  channel: string | null
  created_at: string
  donors: DonationDonor | DonationDonor[] | null
}

export interface ConsoleData {
  org: { name: string; slug: string; status: 'draft' | 'live' | 'suspended' }
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
  disputes: { id: string; amount_cents: number; fee_cents: number | null; dispute_due_by: string | null; created_at: string }[]
  bounces: { donorId: string; email: string; status: string; at: string }[]
  mailingCount: number
  channels: { channel: string; visits: number; donations: number; totalCents: number }[]
  donors: DonorRow[]
  donations: DonationRow[]
}

export type Act = (payload: Record<string, unknown>, okText?: string) => Promise<boolean>

export const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
