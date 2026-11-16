import { getDb } from './db'
import { estimateStripeFee, type StripeFeeEstimate } from './contribution'

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

// ─── Nouveau modèle (K1 + contribution du donateur, 16 novembre 2026) ───────────────────────────────────────────────
// Spécification : claude/donivers-2026-11-16-contribution-donateur.md, section 1 (fait foi), avec le plan K (seuil, verrous).
// Pas encore branché sur les paiements : startCheckout utilise toujours l'ancienne grille ci-dessus jusqu'à la PR A2.

/** Grille d'un organisme (organizations.fee_schedule). Une grille de l'ancienne forme, sans « model », vaut le modèle par défaut. */
export type BillingSchedule =
  | {
      model: 'capped'
      /** Donateurs comptés avant la première commission. */
      freeDonors: number
      rate: number
      /** Plafond de ce que l'organisme et ses donateurs paient au total, taxes incluses (cents). */
      capCents: number
      /** Le surplus des contributions fait avancer le cumul (décision 4 de Mika). */
      contributionCountsTowardCap: boolean
      /** Tranches de contribution propres à l'organisme (lues par contributionSettingsFor). */
      contributionBrackets?: unknown
      /** Tarif Stripe propre à l'organisme, s'il est connu (lu par stripeFeeEstimateFor). */
      stripeFeeEstimate?: unknown
    }
  | {
      /** Partenaire fondateur (École d'art, 10 nov.) : aucune commission sur le vitrail principal, contribution proposée quand même. */
      model: 'exempt'
      scope: 'principal'
      contributionBrackets?: unknown
      stripeFeeEstimate?: unknown
    }

export const DEFAULT_BILLING_SCHEDULE: BillingSchedule = {
  model: 'capped',
  freeDonors: PRICING.freeDonors,
  rate: PRICING.rate,
  capCents: PRICING.capCents,
  contributionCountsTowardCap: true,
}

export function parseBillingSchedule(raw: unknown): BillingSchedule {
  const r = (raw ?? {}) as Record<string, unknown>
  const brackets = {
    ...(r.contributionBrackets === undefined ? {} : { contributionBrackets: r.contributionBrackets }),
    ...(r.stripeFeeEstimate === undefined ? {} : { stripeFeeEstimate: r.stripeFeeEstimate }),
  }
  if (r.model === 'exempt') return { model: 'exempt', scope: 'principal', ...brackets }
  if (r.model !== 'capped') return { ...DEFAULT_BILLING_SCHEDULE, ...brackets } // ancienne forme ou inconnue
  const d = DEFAULT_BILLING_SCHEDULE as Extract<BillingSchedule, { model: 'capped' }>
  const int = (v: unknown, max: number, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : fallback)
  return {
    model: 'capped',
    freeDonors: int(r.freeDonors, 1_000_000, d.freeDonors),
    rate: typeof r.rate === 'number' && Number.isFinite(r.rate) && r.rate >= 0 && r.rate <= 0.2 ? r.rate : d.rate,
    capCents: int(r.capCents, 100_000_000, d.capCents),
    contributionCountsTowardCap: typeof r.contributionCountsTowardCap === 'boolean' ? r.contributionCountsTowardCap : d.contributionCountsTowardCap,
    ...brackets,
  }
}

/** Ce qu'on sait de l'organisme au début du paiement (vue organization_billing + verrous de organizations). */
export interface BillingState {
  donorsCounted: number
  /** Verrou fee_threshold_reached_at posé : le seuil a déjà été franchi une fois. */
  thresholdReached: boolean
  /** Verrou fee_settled_at posé : acquitté pour toujours. */
  settled: boolean
  /** Ce qui compte pour le plafond, net des remboursements et de l'excédent rendu, taxes incluses (cents). */
  cumulCents: number
}

export interface FeeBreakdown {
  /** F : frais Stripe estimés sur don + contribution. */
  stripeFeeEstimatedCents: number
  /** S : surplus de la contribution, une fois les frais couverts. Jamais plafonné. */
  surplusCents: number
  /** N : commission qu'aurait payée le don (2,8 %), 0 avant le seuil, après l'acquittement ou pour un organisme exempté. */
  commissionCents: number
  /** P : part payée par l'organisme, bornée par la commission et par le reste avant le plafond. */
  orgShareCents: number
  /** S + P : application_fee_amount demandé à Stripe. */
  applicationFeeCents: number
  /** R : reste avant l'acquittement, avant ce don. */
  remainingCents: number
  /** Ce don fait atteindre le plafond (à confirmer au règlement, sous verrou). */
  settlesNow: boolean
}

/**
 * La règle de la section 1, pour un don Stripe au vitrail principal. Fonction pure : le serveur l'appelle à la création
 * de la session (« au début du paiement »), le règlement du webhook corrige ensuite sous verrou les paiements simultanés.
 */
export function computeDonationFees(i: {
  donCents: number
  contributionCents: number
  schedule: BillingSchedule
  state: BillingState
  stripeFee: StripeFeeEstimate
}): FeeBreakdown {
  const don = Math.max(0, Math.round(i.donCents))
  const contribution = Math.max(0, Math.round(i.contributionCents))
  const F = estimateStripeFee(don + contribution, i.stripeFee) // Stripe prend son pourcentage sur tout le paiement
  const S = Math.max(0, contribution - F)

  if (i.schedule.model === 'exempt') {
    return { stripeFeeEstimatedCents: F, surplusCents: S, commissionCents: 0, orgShareCents: 0, applicationFeeCents: S, remainingCents: 0, settlesNow: false }
  }

  const s = i.schedule
  const R = Math.max(0, s.capCents - Math.max(0, i.state.cumulCents))
  let N = 0
  if (!i.state.settled && (i.state.thresholdReached || i.state.donorsCounted >= s.freeDonors)) N = Math.round(don * s.rate)

  // Le surplus passe en premier ; il ne compte pour le plafond que si la grille le dit (par défaut : oui)
  const counted = s.contributionCountsTowardCap ? S : 0
  const P = i.state.settled ? 0 : Math.min(Math.max(0, N - S), Math.max(0, R - counted))
  const settlesNow = !i.state.settled && counted + P >= R
  return { stripeFeeEstimatedCents: F, surplusCents: S, commissionCents: N, orgShareCents: P, applicationFeeCents: S + P, remainingCents: R, settlesNow }
}

export async function cumulativePlatformFees(orgId: string): Promise<number> {
  const { data, error } = await getDb().from('organization_fee_totals').select('fees_cents').eq('organization_id', orgId).maybeSingle()
  if (error) throw error
  return Number(data?.fees_cents ?? 0)
}
