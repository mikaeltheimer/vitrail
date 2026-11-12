import type { Piece } from '@/lib/types'

/** Un morceau du vitrail en ligne, avec sa place dans l'ordre d'arrivée (1 = le premier arrivé). */
export interface RankedPiece extends Piece {
  /** Position dans la navigation (Préc. / Suiv.). */
  rank: number
  /** Numéro d'arrivée affiché (« 123e morceau ») : celui du serveur, sinon la position. */
  arrival: number
}
