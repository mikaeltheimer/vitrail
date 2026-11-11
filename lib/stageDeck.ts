// Visite de l'écran de projection : quels morceaux mettre en scène, et dans quel ordre.
// Un morceau sans nom, sans photo et sans message n'a rien à montrer : il n'entre jamais dans la visite (il passe une seule
// fois, en priorité, au moment de son don ; voir app/ecran). Les autres sont rangés en trois rangs, mélangés à part puis
// entrelacés régulièrement sur tout le tour : chaque tranche du tour a le même mélange, jamais une fin de tour faite
// seulement de noms seuls.

import type { Piece } from './types'

/** 0 : photo et message ; 1 : photo ou message ; 2 : nom seul ; null : rien à montrer. */
export type StageTier = 0 | 1 | 2

export function stageTier(p: Pick<Piece, 'name' | 'photoUrl' | 'message'>, showMessages = true): StageTier | null {
  const photo = !!p.photoUrl
  const message = showMessages && !!p.message?.trim()
  if (photo && message) return 0
  if (photo || message) return 1
  if (p.name?.trim()) return 2
  return null
}

/**
 * Un tour de visite, dans l'ordre d'affichage. Chaque rang de n morceaux occupe les positions (k + u) / n, u tiré au
 * hasard dans [0, 1) : réparti régulièrement, sans motif fixe. Les morceaux sans rien à montrer sont écartés.
 */
export function buildTour(pieces: Pick<Piece, 'id' | 'name' | 'photoUrl' | 'message'>[], showMessages = true, rand: () => number = Math.random): string[] {
  const tiers: string[][] = [[], [], []]
  for (const p of pieces) {
    const t = stageTier(p, showMessages)
    if (t !== null) tiers[t].push(p.id)
  }
  const placed: { id: string; at: number }[] = []
  for (const ids of tiers) {
    // Mélange de Fisher-Yates, puis une place par tranche
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    ids.forEach((id, k) => placed.push({ id, at: (k + rand()) / ids.length }))
  }
  return placed.sort((a, b) => a.at - b.at).map(x => x.id)
}
