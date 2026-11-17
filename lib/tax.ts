// Taxes de vente comprises dans ce que reçoit Donivers (spécification du 16 novembre 2026, décision 8 et section 1).
//
// Les prix sont TAXES INCLUSES : rien ne s'ajoute à la facture, Donivers remet la TPS et la TVQ (ou la TVH) en les prenant
// sur ce qu'il reçoit (S + P). Le plafond de 495 $ s'entend taxes incluses.
//
// Deux questions restent au comptable, et chacune ne touche qu'UNE fonction ici :
// - la province retenue (celle de l'organisme ou celle du donateur) : taxProvinceFor ;
// - l'assiette (S + P, ou toute la contribution) : c'est l'appelant qui passe le montant, aujourd'hui S + P.
// Les taux vivent dans la base (platform_settings, clé « tax_rates ») ; DEFAULT_TAX_RATES n'est qu'un filet.

export const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const
export type Province = (typeof PROVINCES)[number]

export const isProvince = (v: unknown): v is Province => typeof v === 'string' && (PROVINCES as readonly string[]).includes(v)

/**
 * Taux combinés perçus par Studio Existence inc. (fournisseur québécois) selon la province du client.
 * [Guessing : à confirmer avec le comptable] TPS + TVQ au Québec, TVH dans les provinces harmonisées (Nouvelle-Écosse à
 * 14 % depuis avril 2025), TPS seule ailleurs (pas d'inscription aux taxes provinciales de C.-B., Sask. et Manitoba).
 */
export const DEFAULT_TAX_RATES: Record<Province, number> = {
  AB: 0.05,
  BC: 0.05,
  MB: 0.05,
  NB: 0.15,
  NL: 0.15,
  NS: 0.14,
  NT: 0.05,
  NU: 0.05,
  ON: 0.13,
  PE: 0.15,
  QC: 0.14975,
  SK: 0.05,
  YT: 0.05,
}

/** Lit les taux venus de la base ; une province absente ou invalide garde le taux par défaut. */
export function parseTaxRates(raw: unknown): Record<Province, number> {
  const r = (raw ?? {}) as Record<string, unknown>
  const rates = { ...DEFAULT_TAX_RATES }
  for (const p of PROVINCES) {
    const v = r[p]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 0.2) rates[p] = v
  }
  return rates
}

/**
 * La province dont le taux s'applique à un don. Aujourd'hui : celle de l'organisme (lue sur son compte Stripe).
 * Si le comptable retient celle du donateur pour la contribution, c'est ici, et seulement ici, que ça change.
 */
export function taxProvinceFor(i: { orgProvince: string | null; donorProvince?: string | null }): Province | null {
  return isProvince(i.orgProvince) ? i.orgProvince : null
}

/**
 * Taxes comprises dans un montant taxes incluses : montant − montant ÷ (1 + taux), au cent.
 * Province inconnue : 0 (le montant reste juste ; la remise se corrige à part).
 */
export function taxIncludedCents(amountCents: number, province: Province | null, rates: Record<Province, number> = DEFAULT_TAX_RATES): number {
  if (!province || !Number.isFinite(amountCents) || amountCents <= 0) return 0
  const rate = rates[province] ?? 0
  return amountCents - Math.round(amountCents / (1 + rate))
}
