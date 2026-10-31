import { CONFIG } from './config'
import { drawGlassTile, glassColors } from './glass'
import { UNIVERSE_RADIUS, seedFromIds, type Tile, type TilingItem } from './tiling'
import { computeTiling } from './tilingClient'
import type { Piece } from './types'

/** Poids de pavage : l'aire d'un morceau suit (montant ^ exposant), avec un plancher (relatif à la moyenne) pour rester visible. */
export function pieceWeights(pieces: Piece[]): TilingItem[] {
  const raw = pieces.map(p => Math.pow(p.amountCents, CONFIG.sizeExponent))
  const mean = raw.length ? raw.reduce((a, b) => a + b, 0) / raw.length : 0
  const floor = mean * CONFIG.minRelativeToMean
  return pieces.map((p, i) => ({ id: p.id, weight: Math.max(raw[i], floor) }))
}

/** Pavage stable : la graine ne dépend que de l'ensemble des donateurs. */
export async function tilePieces(pieces: Piece[]): Promise<Map<string, Tile>> {
  if (pieces.length === 0) return new Map()
  const { tiles } = await computeTiling(pieceWeights(pieces), seedFromIds(pieces.map(p => p.id)))
  return tiles
}

/** Dessine toutes les pièces. La transformation monde → écran doit déjà être posée sur ctx. */
export function paintGlass(ctx: CanvasRenderingContext2D, tiles: Map<string, Tile>, colors: Map<string, string>, scale: number) {
  for (const [id, tile] of tiles) {
    drawGlassTile(ctx, tile, {
      colors: glassColors(colors.get(id) ?? '#f472b6', id),
      sizePx: tile.equivRadius * scale,
      zoom: scale,
      avatar: null,
      reveal: 0,
      dim: 1,
      hovered: false,
    })
  }
}

/** Fond d'un vitrail encore vide : un cercle de plomb. */
export function paintEmptyGlass(ctx: CanvasRenderingContext2D, scale: number) {
  ctx.beginPath()
  ctx.arc(0, 0, UNIVERSE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fill()
  ctx.lineWidth = 3 / scale
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.stroke()
}

export function colorMap(pieces: Piece[]): Map<string, string> {
  return new Map(pieces.map(p => [p.id, p.color]))
}

export { UNIVERSE_RADIUS }
