/** Un morceau de vitrail tel que l'écran et les pages publiques le voient. Jamais de courriel ici. */
export interface Piece {
  /** Identifiant du donateur (opaque). */
  id: string
  /** Null si le donateur n'a pas consenti à l'affichage de son nom. */
  name: string | null
  message: string | null
  /** La question à laquelle répond le témoignage ; null s'il n'y en a pas (ou témoignage écrit avant qu'on la garde). */
  question?: string | null
  /** Adresse de la photo, ou null (jamais sans consentement d'affichage). */
  photoUrl: string | null
  color: string
  amountCents: number
  /** Numéro d'arrivée dans ce vitrail (1 = premier donateur), selon le premier don ; ne change pas quand d'autres se retirent. */
  arrival?: number
  /** Date du premier don dans ce vitrail (ISO). */
  since?: string
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
  /** Vitrail de démonstration : donateurs et dons fictifs, rien ne s'y enregistre (affiché comme tel). */
  showcase?: boolean
  event: EventInfo | null
  totalCents: number
  donationsCount: number
  pieces: Piece[]
  recent: RecentDonation[]
  /** Montant « habituel » (médiane des morceaux, arrondie au montant suggéré le plus proche) ; null tant qu'il y a trop peu de dons. */
  typicalCents: number | null
}
