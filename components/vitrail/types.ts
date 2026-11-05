import type { Piece } from '@/lib/types'

/** Un morceau du vitrail en ligne, avec sa place (1 = le plus grand). */
export interface RankedPiece extends Piece {
  rank: number
}
