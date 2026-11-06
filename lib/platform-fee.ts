import { getDb } from './db'

// Commission de la plateforme (Studio Existence) sur chaque don : un pourcentage du don, dégressif.
// Le palier se mesure en commissions cumulées NETTES de l'organisme (à vie) : une commission rendue lors d'un
// remboursement est retranchée. Un don qui franchit le seuil garde l'ancien taux ; le suivant prend le nouveau.

export interface FeeSchedule {
  /** Taux de base (0.028 = 2,8 %). */
  rate: number
  /** Commissions cumulées (en cents) à partir desquelles le taux réduit s'applique. */
  tierAfterCents: number
  /** Taux réduit (0.005 = 0,5 %). */
  tierRate: number
}

export const DEFAULT_FEE_SCHEDULE: FeeSchedule = { rate: 0.028, tierAfterCents: 500_000, tierRate: 0.005 }

/** Lit une grille venue de la base ; toute valeur invalide retombe sur la grille par défaut (jamais de NaN dans un paiement). */
export function parseFeeSchedule(raw: unknown): FeeSchedule {
  const r = (raw ?? {}) as Partial<Record<keyof FeeSchedule, unknown>>
  const ok = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
  return {
    rate: ok(r.rate, 0.2) ? r.rate : DEFAULT_FEE_SCHEDULE.rate,
    tierAfterCents: ok(r.tierAfterCents, 1e12) ? Math.round(r.tierAfterCents) : DEFAULT_FEE_SCHEDULE.tierAfterCents,
    tierRate: ok(r.tierRate, 0.2) ? r.tierRate : DEFAULT_FEE_SCHEDULE.tierRate,
  }
}

/** Commission (en cents) sur un don, selon la grille et les commissions déjà cumulées par l'organisme. */
export function platformFeeCents(amountCents: number, schedule: FeeSchedule, cumulativeFeesCents: number): number {
  const rate = cumulativeFeesCents >= schedule.tierAfterCents ? schedule.tierRate : schedule.rate
  return Math.max(0, Math.round(amountCents * rate))
}

export async function cumulativePlatformFees(orgId: string): Promise<number> {
  const { data, error } = await getDb().from('organization_fee_totals').select('fees_cents').eq('organization_id', orgId).maybeSingle()
  if (error) throw error
  return Number(data?.fees_cents ?? 0)
}
