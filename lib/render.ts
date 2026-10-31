import { CONFIG } from './config'
import { drawGlassTile, glassColors } from './glass'
import type { ImageCache } from './images'
import { UNIVERSE_RADIUS, seedFromIds, type Tile, type TilingItem } from './tiling'
import { computeTiling } from './tilingClient'
import type { Piece } from './types'

// ── Pavage ────────────────────────────────────────────────────────────────────

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

// ── Ce qu'on dessine sur un morceau ──────────────────────────────────────────

export interface PaintPiece {
  color: string
  name: string | null
  message: string | null
  photoUrl: string | null
}
export type PieceMap = Map<string, PaintPiece>

export function pieceMap(pieces: Piece[], showMessages = true): PieceMap {
  return new Map(pieces.map(p => [p.id, { color: p.color, name: p.name, message: showMessages ? p.message : null, photoUrl: p.photoUrl }]))
}

/** Position du vitrail dans le canvas : écran = monde × scale + (ox, oy), en pixels CSS. */
export interface View {
  scale: number
  ox: number
  oy: number
}

// Mêmes réglages que Pay to Exist (tailles en px à l'écran, pour un vitrail de 1000 unités de rayon)
const PHOTO_MIN_SIDE = 34 // en dessous, pas de photo
const LABEL_NAME_MIN = 40 // rayon inscrit minimal pour afficher le nom
const LABEL_MESSAGE_MIN = 70 // … et le message
const SIDE_FACTOR = 1.7725 // côté du carré de même aire qu'un disque de rayon 1 (√π) : échelle des seuils du verre
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/**
 * Caméra de l'aperçu : tout le vitrail si le morceau est grand, sinon un zoom centré sur le morceau
 * (il occupe environ un tiers de la largeur du canvas, ses voisins l'entourent).
 */
export function focusView(tile: Tile | null | undefined, size: number): View {
  const base = (size / 2 - 4) / UNIVERSE_RADIUS
  if (!tile) return { scale: base, ox: size / 2, oy: size / 2 }
  const scale = Math.max(base, (0.34 * size) / tile.equivRadius)
  if (scale <= base) return { scale: base, ox: size / 2, oy: size / 2 }
  return { scale, ox: size / 2 - tile.labelCenter[0] * scale, oy: size / 2 - tile.labelCenter[1] * scale }
}

export interface Scene {
  tiles: Map<string, Tile>
  pieces: PieceMap
  images: ImageCache
  view: View
  dpr: number
  /** Taille du canvas en pixels CSS (pour ne pas dessiner d'étiquettes hors champ). */
  width: number
  height: number
  /** Pour un écran plus grand que 1080p : agrandit les seuils et les polices (1 = réglages de base). */
  uiScale?: number
  /** Morceau mis en valeur (aperçu) : les autres s'assombrissent, le sien reçoit la vraie photo et un liseré doré. */
  focusId?: string | null
}

/** Dessine le vitrail : verre, photos, étiquettes. Ne touche pas au fond ni à l'ambiance. */
export function drawScene(ctx: CanvasRenderingContext2D, s: Scene) {
  const { view, dpr } = s
  // ── Verre, en coordonnées monde
  ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.ox * dpr, view.oy * dpr)
  if (s.tiles.size === 0) {
    paintEmpty(ctx, view.scale)
  } else {
    for (const [id, tile] of s.tiles) {
      const piece = s.pieces.get(id)
      const sidePx = tile.equivRadius * view.scale * SIDE_FACTOR
      const focused = s.focusId === id
      const avatar = piece?.photoUrl && sidePx >= PHOTO_MIN_SIDE ? s.images.get(piece.photoUrl) : null
      const reveal = focused ? 1 : Math.min(1, Math.max(0, (sidePx - CONFIG.photoColorFromPx) / (CONFIG.photoColorToPx - CONFIG.photoColorFromPx)))
      drawGlassTile(ctx, tile, {
        colors: glassColors(piece?.color ?? '#f472b6', id),
        sizePx: sidePx,
        zoom: view.scale,
        avatar,
        reveal,
        dim: s.focusId && !focused ? 0.55 : 1,
        hovered: false,
      })
    }
    const focus = s.focusId ? s.tiles.get(s.focusId) : null
    if (focus?.path) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = 4 / view.scale
      ctx.strokeStyle = '#f5c451'
      ctx.stroke(focus.path)
    }
  }

  // ── Étiquettes (nom, message), en coordonnées écran
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  paintLabels(ctx, s)
}

function paintEmpty(ctx: CanvasRenderingContext2D, scale: number) {
  ctx.beginPath()
  ctx.arc(0, 0, UNIVERSE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fill()
  ctx.lineWidth = 3 / scale
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.stroke()
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text]
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 0) last = last.slice(0, -1)
    kept[maxLines - 1] = last + '…'
    return kept
  }
  return lines
}

/** Nom (et message si la pièce est assez grande) au bas de la pièce quand elle a une photo, au centre sinon. */
function paintLabels(ctx: CanvasRenderingContext2D, s: Scene) {
  const { view } = s
  const u = s.uiScale ?? 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  for (const [id, tile] of s.tiles) {
    const piece = s.pieces.get(id)
    if (!piece?.name) continue
    const r = tile.inRadius * view.scale // rayon utile : plus grand cercle inscrit
    if (r < LABEL_NAME_MIN * u) continue
    const sx = tile.labelCenter[0] * view.scale + view.ox
    const sy = tile.labelCenter[1] * view.scale + view.oy
    if (sx < -r || sx > s.width + r || sy < -r || sy > s.height + r) continue

    const showMessage = r >= LABEL_MESSAGE_MIN * u && !!piece.message
    const hasPhoto = !!(piece.photoUrl && s.images.peek(piece.photoUrl))
    const nameSize = Math.min(22 * u, Math.max(12 * u, r * 0.19))
    const msgSize = Math.min(14 * u, Math.max(9 * u, r * 0.09))

    ctx.font = `600 ${nameSize}px ${FONT}`
    const nameLines = wrapLines(ctx, piece.name, r * 1.6, 2)
    const nameHeight = nameLines.length * nameSize
    let total = nameHeight
    if (showMessage) total += msgSize * 4.5

    let y = hasPhoto ? sy + r - total - r * 0.18 : sy - total / 2
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 1
    ctx.fillStyle = '#fff'
    for (const line of nameLines) {
      ctx.fillText(line, sx, y)
      y += nameSize
    }
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    if (showMessage && piece.message) {
      ctx.font = `400 ${msgSize * 0.8}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillText('•', sx, y)
      y += msgSize * 0.9
      ctx.font = `italic 400 ${msgSize}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      const lines = wrapLines(ctx, piece.message, r * 1.1, 3)
      lines.forEach((line, i) => {
        const text = (i === 0 ? '« ' : '') + line + (i === lines.length - 1 ? ' »' : '')
        ctx.fillText(text, sx, y)
        y += msgSize * 1.2
      })
    }
  }
}

export { UNIVERSE_RADIUS }
