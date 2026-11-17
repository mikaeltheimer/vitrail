// Journal des dons, côté serveur : lit les dons d'un organisme dans une période et applique les filtres.
// Utilisé par GET /api/admin/dons (console) et GET /api/admin/export?type=dons (CSV de la sélection).

import { getDb } from './db'
import { fetchWhere } from './donations'
import { FEE_COLUMNS } from './billing'
import { orgFees, type FeeRow } from './platform-fee'
import { PAYMENTS, localToUtc, summarize, type JournalFilter, type JournalResponse, type JournalRow, type Payment } from './journal'

export interface RawDonation extends FeeRow {
  id: string
  donor_id: string
  created_at: string
  channel: string | null
  dispute_status: 'open' | 'won' | 'lost' | null
  /** Frais couverts par l'ancienne case (dons d'avant la contribution). */
  fee_cents: number | null
}

export interface RawDonor {
  id: string
  email: string
  display_name: string | null
  color: string | null
  hidden: boolean | null
  erased_at: string | null
}

const COLUMNS = `id,donor_id,created_at,channel,dispute_status,fee_cents,${FEE_COLUMNS}`

/** Dons de l'organisme dans la période (« au » exclu), du plus récent au plus ancien, avec leurs donateurs. */
export async function donationsInRange(orgId: string, f: Pick<JournalFilter, 'du' | 'au'>): Promise<{ donations: RawDonation[]; donors: Map<string, RawDonor> }> {
  const from = f.du ? localToUtc(f.du) : null
  const to = f.au ? localToUtc(f.au) : null
  const db = getDb()
  const donations: RawDonation[] = []
  for (let start = 0; ; start += 1000) {
    let q = db.from('donations').select(COLUMNS).eq('organization_id', orgId)
    if (from) q = q.gte('created_at', from.toISOString())
    // « au » exclu : la dernière milliseconde avant la borne
    if (to) q = q.lte('created_at', new Date(to.getTime() - 1).toISOString())
    const { data, error } = await q.order('id').range(start, start + 999)
    if (error) throw error
    donations.push(...((data ?? []) as unknown as RawDonation[]))
    if (!data || data.length < 1000) break
  }
  donations.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const donorRows = await fetchWhere<RawDonor>('donors', 'id,email,display_name,color,hidden,erased_at', 'organization_id', orgId, 'id')
  return { donations, donors: new Map(donorRows.map(d => [d.id, d])) }
}

/** Le don passe-t-il les filtres autres que la période (mode de paiement, provenance, donateur) ? */
export function matchesFilter(n: RawDonation, donor: RawDonor | undefined, f: JournalFilter): boolean {
  if (f.paiement && n.source !== f.paiement) return false
  if (f.provenance) {
    // Les dons comptants et d'amorçage n'ont pas de provenance
    if (n.source === 'cash' || n.source === 'seed') return false
    if ((n.channel || 'direct') !== f.provenance) return false
  }
  if (f.q) {
    const q = f.q.toLowerCase()
    const email = String(donor?.email ?? '')
    const hay = `${donor?.display_name ?? ''} ${email.endsWith('.invalid') ? '' : email}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

export async function donationJournal(orgId: string, f: JournalFilter, owner: boolean): Promise<JournalResponse> {
  const { donations, donors } = await donationsInRange(orgId, f)
  const kept = donations.filter(n => matchesFilter(n, donors.get(n.donor_id), f))
  const rows: JournalRow[] = kept.map(n => {
    const d = donors.get(n.donor_id)
    return {
      id: n.id,
      donorId: n.donor_id,
      createdAt: n.created_at,
      amountCents: Number(n.amount_cents) || 0,
      refundedCents: Number(n.refunded_cents) || 0,
      disputeStatus: n.dispute_status ?? null,
      source: ((PAYMENTS as readonly string[]).includes(n.source) ? n.source : 'stripe') as Payment,
      channel: n.source === 'cash' || n.source === 'seed' ? null : n.channel || 'direct',
      donor: d ? { name: d.display_name ?? '', color: d.color ?? '#F0B24A', hidden: !!d.hidden, erased: !!d.erased_at } : null,
    }
  })
  // Frais : seulement la part qui concerne l'organisme (propriétaire), jamais le montant des contributions
  const t = { stripeOrg: 0, stripeDonor: 0, comOrg: 0, comDonor: 0 }
  let estimated = false
  if (owner)
    for (const n of kept) {
      const x = orgFees(n)
      if (!x) continue
      t.stripeOrg += x.stripeOrgCents
      t.stripeDonor += x.stripeDonorCents
      t.comOrg += x.commissionOrgCents
      t.comDonor += x.commissionDonorCents
      if (x.stripeFeeEstimated && x.stripeFeeCents) estimated = true
    }
  return {
    rows,
    summary: {
      ...summarize(rows),
      stripeFeesCents: owner ? t.stripeOrg : null,
      stripeFeesEstimated: owner && estimated,
      fees: owner ? { stripeDonorCents: t.stripeDonor, commissionOrgCents: t.comOrg, commissionDonorCents: t.comDonor } : null,
    },
  }
}
