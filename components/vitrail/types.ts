import type { Piece } from '@/lib/types'

/** Un morceau du vitrail en ligne, avec sa place (1 = le plus grand). */
export interface RankedPiece extends Piece {
  rank: number
}

/** « 1er », « 2e », « 12e » */
export const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`)
