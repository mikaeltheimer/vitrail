// Contribution facultative du donateur à Donivers (spécification du 16 novembre 2026,
// claude/donivers-2026-11-16-contribution-donateur.md, sections 1, 2.1 et 5.1).
//
// Tout est en cents entiers. Les taux sont convertis en millionièmes avant de multiplier : un produit d'entiers est exact,
// et l'arrondi (au cent, moitié vers le haut) ne dépend pas des approximations des nombres à virgule.
//
// La configuration vit dans la base (platform_settings, clé « contribution_brackets »), jamais dans le code : changer les
// tranches ne demande ni déploiement ni réécriture des textes. DEFAULT_CONTRIBUTION_SETTINGS ne sert que de filet si la
// ligne est absente ou invalide (jamais de paiement bloqué par une configuration cassée).

export interface ContributionBracket {
  /** Borne haute de la tranche, en cents du don ; absente pour la dernière tranche (ouverte). */
  upToCents?: number
  /** Taux appliqué à la partie du don qui tombe dans la tranche (0.15 = 15 %). */
  rate: number
}

export interface StripeFeeEstimate {
  rate: number
  fixedCents: number
}

export interface ContributionSettings {
  /** Version gardée sur chaque don (contribution_brackets_version) : pour mesurer l'effet d'un changement. */
  version: string
  brackets: ContributionBracket[]
  /** Pourcentages proposés dans le menu, en plus du montant suggéré. */
  menuRates: number[]
  /** Tarif standard de Stripe, utilisé pour estimer les frais même quand l'organisme a un tarif réduit. */
  stripeFeeEstimate: StripeFeeEstimate
}

export const DEFAULT_CONTRIBUTION_SETTINGS: ContributionSettings = {
  version: '2026-11-16',
  brackets: [{ upToCents: 25_000, rate: 0.15 }, { upToCents: 100_000, rate: 0.08 }, { rate: 0.07 }],
  menuRates: [0.05, 0.1, 0.15],
  stripeFeeEstimate: { rate: 0.029, fixedCents: 30 },
}

/** Taux maximal d'une tranche ou du menu (validation à l'enregistrement, section 5.1). */
export const MAX_CONTRIBUTION_RATE = 0.3

const micro = (rate: number): number => Math.round(rate * 1_000_000)
const roundMicroCents = (microCents: number): number => Math.round(microCents / 1_000_000)

/**
 * Contribution suggérée pour un don, par tranches (comme l'impôt) : chaque taux ne s'applique qu'à la partie du don
 * comprise dans sa tranche. Un seul arrondi, à la fin : la suggestion ne baisse jamais quand le don monte.
 */
export function suggestedContribution(donCents: number, brackets: ContributionBracket[]): number {
  if (!Number.isFinite(donCents) || donCents <= 0) return 0
  let lower = 0
  let total = 0 // millionièmes de cent
  for (const b of brackets) {
    const upper = b.upToCents ?? Infinity
    const portion = Math.min(donCents, upper) - lower
    if (portion > 0) total += portion * micro(b.rate)
    if (donCents <= upper) break
    lower = upper
  }
  return roundMicroCents(total)
}

/** Frais Stripe estimés sur le montant payé (don + contribution), au cent, moitié vers le haut. */
export function estimateStripeFee(totalCents: number, estimate: StripeFeeEstimate): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0
  return roundMicroCents(totalCents * micro(estimate.rate)) + Math.round(estimate.fixedCents)
}

/** Montant proposé pour un pourcentage du menu. */
export function menuContribution(donCents: number, rate: number): number {
  if (!Number.isFinite(donCents) || donCents <= 0) return 0
  return roundMicroCents(donCents * micro(rate))
}

/**
 * Pourcentages du menu à afficher : ceux qui donneraient le même montant que la suggestion sont retirés
 * (jusqu'à 250 $, 15 % et la suggestion sont identiques).
 */
export function menuRatesFor(donCents: number, settings: ContributionSettings): number[] {
  const suggested = suggestedContribution(donCents, settings.brackets)
  return settings.menuRates.filter(r => menuContribution(donCents, r) !== suggested)
}

export type SettingsCheck = { ok: true; value: ContributionSettings } | { ok: false; errors: string[] }

const isRate = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

/**
 * Valide une configuration (section 5.1) : bornes entières et croissantes, dernière tranche ouverte, taux entre 0 et 30 %.
 * Toute configuration valide garde une suggestion qui monte avec le don (taux ≥ 0, un seul arrondi).
 */
export function validateContributionSettings(raw: unknown): SettingsCheck {
  const errors: string[] = []
  const r = (raw ?? {}) as Record<string, unknown>
  const version = typeof r.version === 'string' && r.version.trim() ? r.version.trim() : ''
  if (!version) errors.push('version manquante') // i18n-ok : pour l'exploitant (journal, Studio)

  const brackets: ContributionBracket[] = []
  if (!Array.isArray(r.brackets) || r.brackets.length === 0) {
    errors.push('tranches manquantes') // i18n-ok : pour l'exploitant (journal, Studio)
  } else {
    let previous = 0
    r.brackets.forEach((b: unknown, i: number) => {
      const x = (b ?? {}) as Record<string, unknown>
      const last = i === (r.brackets as unknown[]).length - 1
      if (!isRate(x.rate, MAX_CONTRIBUTION_RATE)) errors.push(`tranche ${i + 1} : taux invalide`) // i18n-ok : pour l'exploitant (journal, Studio)
      if (last) {
        if (x.upToCents !== undefined) errors.push('la dernière tranche doit être ouverte') // i18n-ok : pour l'exploitant (journal, Studio)
        brackets.push({ rate: Number(x.rate) })
      } else if (!isCents(x.upToCents) || (x.upToCents as number) <= previous) {
        errors.push(`tranche ${i + 1} : borne invalide ou non croissante`) // i18n-ok : pour l'exploitant (journal, Studio)
      } else {
        previous = x.upToCents as number
        brackets.push({ upToCents: previous, rate: Number(x.rate) })
      }
    })
  }

  const menuRates = Array.isArray(r.menuRates) ? r.menuRates : []
  if (menuRates.length > 5 || !menuRates.every(m => isRate(m, MAX_CONTRIBUTION_RATE))) errors.push('taux du menu invalides') // i18n-ok : pour l'exploitant (journal, Studio)

  const fee = (r.stripeFeeEstimate ?? {}) as Record<string, unknown>
  if (!isRate(fee.rate, 0.1) || typeof fee.fixedCents !== 'number' || !Number.isInteger(fee.fixedCents) || fee.fixedCents < 0 || fee.fixedCents > 200) {
    errors.push('estimation des frais Stripe invalide') // i18n-ok : pour l'exploitant (journal, Studio)
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: { version, brackets, menuRates: menuRates as number[], stripeFeeEstimate: { rate: fee.rate as number, fixedCents: fee.fixedCents as number } },
  }
}

/** Lit une configuration venue de la base ; invalide ou absente : celle par défaut (journalisé par l'appelant). */
export function parseContributionSettings(raw: unknown): ContributionSettings {
  const checked = validateContributionSettings(raw)
  return checked.ok ? checked.value : DEFAULT_CONTRIBUTION_SETTINGS
}

/**
 * Configuration qui s'applique à un organisme : ses propres tranches (fee_schedule.contributionBrackets, partenaire ou
 * essai) si elles sont valides, sinon celles de la plateforme.
 */
export function contributionSettingsFor(platform: ContributionSettings, orgOverride: unknown): ContributionSettings {
  if (orgOverride === undefined || orgOverride === null) return platform
  const checked = validateContributionSettings(orgOverride)
  return checked.ok ? checked.value : platform
}

/**
 * Estimation des frais Stripe pour un organisme : la sienne (fee_schedule.stripeFeeEstimate) s'il a un tarif connu et plus
 * bas que le tarif standard (tarif réduit des organismes de bienfaisance), sinon celle de la plateforme.
 * But (Mika, 16 nov.) : tout ce qui dépasse les frais réels revient à Donivers, l'organisme reçoit le don, pas plus.
 * Les frais réels plus ÉLEVÉS que l'estimation (carte étrangère) sont rendus à l'organisme au règlement (settle_platform_fee).
 */
export function stripeFeeEstimateFor(platform: StripeFeeEstimate, orgOverride: unknown): StripeFeeEstimate {
  const r = (orgOverride ?? null) as Record<string, unknown> | null
  if (!r || !isRate(r.rate, 0.1) || typeof r.fixedCents !== 'number' || !Number.isInteger(r.fixedCents) || r.fixedCents < 0 || r.fixedCents > 200) return platform
  return { rate: r.rate as number, fixedCents: r.fixedCents }
}

/**
 * Contribution reçue du navigateur : un entier de cents, ≥ 0, jamais plus que le don (faute de frappe, requête trafiquée).
 * Validé par Mika le 16 nov.
 */
export function validateContributionCents(raw: unknown, donCents: number): { ok: true; value: number } | { ok: false; reason: 'invalid' | 'too_high' } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 0 }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return { ok: false, reason: 'invalid' }
  if (raw > donCents) return { ok: false, reason: 'too_high' }
  return { ok: true, value: raw }
}
