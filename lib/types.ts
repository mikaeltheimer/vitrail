/** Un morceau de vitrail tel que l'écran et les pages publiques le voient. Jamais de courriel ici. */
export interface Piece {
  /** Identifiant du donateur (opaque). */
  id: string
  /** Null si le donateur n'a pas consenti à l'affichage de son nom. */
  name: string | null
  message: string | null
  /** Adresse de la photo, ou null (jamais sans consentement d'affichage). */
  photoUrl: string | null
  color: string
  amountCents: number
}

export interface RecentDonation {
  id: string
  donorId: string
  name: string | null
  message: string | null
  photoUrl: string | null
  amountCents: number
  at: string
}

export interface EventInfo {
  id: string
  name: string
  goalCents: number
  totalCents: number
}

export interface Snapshot {
  /** Change quand le vitrail change : l'écran ne recalcule le pavage que si elle diffère. */
  version: string
  at: string
  mode: 'stripe' | 'demo' | 'off'
  event: EventInfo | null
  totalCents: number
  donationsCount: number
  pieces: Piece[]
  recent: RecentDonation[]
  /** Montant « habituel » (médiane des morceaux, arrondie au montant suggéré le plus proche) ; null tant qu'il y a trop peu de dons. */
  typicalCents: number | null
}
