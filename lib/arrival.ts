// Numéro d'arrivée d'un donateur dans un vitrail : « 123e morceau », dans l'ordre de son premier don.
// Le rang par montant n'est jamais montré (il dévoile ce que chacun a donné) ; l'ordre d'arrivée est neutre.

export interface ArrivalRow {
  donation_id: string
  donor_id: string
  created_at: string
}

export interface Arrival {
  /** 1 = premier donateur du vitrail. */
  arrival: number
  /** Date du premier don (ISO). */
  since: string
}

/**
 * Numérote les donateurs selon leur premier don, sur TOUS les dons du vitrail (remboursés, fiches effacées ou masquées
 * comprises) : un retrait de contenu ou un effacement ne décale jamais les numéros des autres. Seule une fusion de
 * doublons (la fiche absorbée disparaît) les décale d'un cran.
 */
export function arrivalOrder(rows: ArrivalRow[]): Map<string, Arrival> {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.donation_id < b.donation_id ? -1 : a.donation_id > b.donation_id ? 1 : 0))
  const out = new Map<string, Arrival>()
  for (const r of sorted) if (!out.has(r.donor_id)) out.set(r.donor_id, { arrival: out.size + 1, since: r.created_at })
  return out
}

/** Paliers mis en valeur : 1, 10, 50, 100, 250, 500, puis chaque millier. */
export const MILESTONES = [1, 10, 50, 100, 250, 500] as const

export function isMilestone(n: number): boolean {
  return (MILESTONES as readonly number[]).includes(n) || (n >= 1000 && n % 1000 === 0)
}
