import { getDb } from './db'
import { fetchWhere } from './donations'
import { donationFees, type BillingSchedule, type BillingSummary, type FeeRow } from './platform-fee'

// Carte « Votre forfait » de la console (C, maquette validée par Mika le 16 nov. 2026) : le compteur et le plafond viennent
// de la vue organization_billing (même source que les paiements) ; les frais Stripe payés par les contributions, des dons
// de l'organisme (les siens, lus par sa console).

/** Colonnes des dons pour donationFees (fiche du don, carte, export). */
export const FEE_COLUMNS = 'source,amount_cents,refunded_cents,donor_contribution_cents,stripe_fee_actual_cents,stripe_fee_estimated_cents,platform_fee_cents,platform_fee_waived_cents,platform_fee_refunded_cents,contribution_surplus_cents'

const n = (v: unknown) => Number(v ?? 0) || 0

export async function billingSummary(orgId: string, schedule: BillingSchedule): Promise<BillingSummary> {
  const [{ data, error }, rows] = await Promise.all([
    getDb()
      .from('organization_billing')
      .select('donors_counted,cumul_cents,donor_covered_cents,fees_net_cents,fee_threshold_reached_at,fee_settled_at')
      .eq('organization_id', orgId)
      .maybeSingle(),
    fetchWhere<FeeRow & { id: string }>('donations', `id,${FEE_COLUMNS}`, 'organization_id', orgId, 'id'),
  ])
  if (error) throw error
  const exempt = schedule.model === 'exempt'
  const cap = schedule.model === 'capped' ? schedule.capCents : 0
  const free = schedule.model === 'capped' ? schedule.freeDonors : 0
  const settled = !!data?.fee_settled_at
  const paid = exempt ? 0 : settled ? cap : Math.min(n(data?.cumul_cents), cap)
  // Ce qui revient aux donateurs dans le réglé : le reste après la part de l'organisme, jamais plus que leur surplus
  const donorsPaid = exempt ? 0 : Math.min(n(data?.donor_covered_cents), Math.max(0, paid - Math.min(n(data?.fees_net_cents), paid)))
  return {
    model: exempt ? 'exempt' : 'capped',
    freeDonors: free,
    capCents: cap,
    donorsCounted: n(data?.donors_counted),
    paidCents: paid,
    donorsPaidCents: donorsPaid,
    thresholdReached: !!data?.fee_threshold_reached_at,
    settled,
    stripeCoveredCents: rows.reduce((sum, r) => sum + (donationFees(r)?.stripeCoveredCents ?? 0), 0),
  }
}
