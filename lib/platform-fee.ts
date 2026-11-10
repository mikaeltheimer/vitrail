import { getDb } from './db'

// Commission de la plateforme (Studio Existence) sur chaque don : un pourcentage du don, dégressif.
// Le palier se mesure en commissions cumulées NETTES de l'organisme (à vie) : une commission rendue lors d'un
// remboursement est retranchée. Un don qui franchit le seuil garde l'ancien taux ; le suivant prend le nouveau.

/**
 * Le modèle d'affaires affiché (vitrine, inscription, conditions) depuis le 10 novembre 2026 : gratuit jusqu'à 100 donateurs,
 * puis 2,8 % par don jusqu'à 495 $ de commissions cumulées, puis 0 % pour toujours ; campagnes 2,8 % jusqu'à 195 $ chacune ;
 * Pro à l'année. Source unique des chiffres affichés. Le calcul des paiements (plus bas) suit encore l'ancienne grille :
 * il passe à ce modèle à l'étape K1 (claude/donivers-plan-etape-k.md), avant le premier paiement réel.
 */
export const PRICING = {
  /** Donateurs (adresses distinctes) avant la première commission. */
  freeDonors: 100,
  rate: 0.028,
  /** Plafond des commissions cumulées du vitrail principal (cents). */
  capCents: 49_500,
  /** Plafond par vitrail de campagne (cents) : bientôt. */
  campaignCapCents: 19_500,
  /** Donivers Pro, par année (cents) : bientôt. */
  proYearCents: 24_900,
} as const

/** Commission totale (cents) du vitrail principal pour `donors` donateurs qui donnent chacun `avgCents` une fois. */
export function pricingExampleCents(donors: number, avgCents: number): number {
  return Math.min(PRICING.capCents, Math.max(0, donors - PRICING.freeDonors) * Math.round(avgCents * PRICING.rate))
}

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
