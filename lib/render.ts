import { ANON_LABEL, CONFIG } from './config'
import { donorNamesSerif, FONT_DISPLAY, FONT_SANS, FONT_SERIF } from './fonts'
import { drawGlassTile, glassColors } from './glass'
import type { ImageCache } from './images'
import { UNIVERSE_RADIUS, seedFromIds, type Tile, type TilingItem } from './tiling'
import { computeTiling } from './tilingClient'
import type { Piece } from './types'

// ── Pavage ────────────────────────────────────────────────────────────────────

/**
 * Exposant de taille en vigueur. Pour comparer des échelles, une page peut le changer par son adresse :
 * `?echelle=0.75` (de 0,3 à 1,2). Sinon, celui de la configuration.
 */
export function sizeExponentOverride(): number | null {
  if (typeof window === 'undefined') return null
  const v = parseFloat((new URLSearchParams(window.location.search).get('echelle') ?? '').replace(',', '.'))
  return Number.isFinite(v) ? Math.min(1.2, Math.max(0.3, v)) : null
}
export function sizeExponent(): number {
  return sizeExponentOverride() ?? CONFIG.sizeExponent
}

/** Poids de pavage : l'aire d'un morceau suit (montant ^ exposant), avec un plancher (relatif à la moyenne) pour rester visible. */
export function pieceWeights(pieces: Piece[]): TilingItem[] {
  const e = sizeExponent()
  const raw = pieces.map(p => Math.pow(p.amountCents, e))
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

/** Une ligne d'un texte placé sur le verre : petite (« Merci à »), nom, montant ou message. */
export interface LabelRow {
  text: string
  kind: 'small' | 'name' | 'amount' | 'message'
}

export interface PaintPiece {
  color: string
  name: string | null
  message: string | null
  photoUrl: string | null
  /** Texte imposé (annonce fusionnée avec le morceau sorti du vitrail) : remplace nom/message et ignore les seuils de taille. */
  rows?: LabelRow[]
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

// Réglages des étiquettes (tailles en px à l'écran, pour un vitrail de 1000 unités de rayon)
const PHOTO_MIN_SIDE = 34 // en dessous, pas de photo
const LABEL_NAME_MIN = 40 // rayon inscrit minimal pour afficher le nom
const LABEL_MESSAGE_MIN = 55 // … et le message
const SIDE_FACTOR = 1.7725 // côté du carré de même aire qu'un disque de rayon 1 (√π) : échelle des seuils du verre
/** Part du voile coloré du vitrail conservée sur une photo qui porte du texte (0 = photo en couleurs, 1 = photo entièrement teintée). */
const LIFT_VEIL = 0.7

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
  /** Opacité des textes (0 à 1) : pour les faire apparaître une fois le morceau en place. */
  labelAlpha?: number
  /**
   * Morceau mis en scène sur l'écran : son verre montre la vraie photo, sans étiquette (le nom et le témoignage
   * sont dans la légende à côté, jamais en double).
   */
  stageId?: string | null
}

/** Initiales d'un nom : « Marie-Ève Gagnon » → « MG », « Alex » → « A ». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : ''
  return (first + last).toLocaleUpperCase('fr-CA')
}

/**
 * Morceau en scène (écran) : la photo entière, sertie dans le plus grand cercle inscrit de la forme (rien n'est rogné),
 * avec un plomb autour ; sans photo, les initiales du donateur, gravées dans le verre. Coordonnées monde.
 */
function paintMedallion(ctx: CanvasRenderingContext2D, tile: Tile, piece: PaintPiece | undefined, photo: HTMLImageElement | null, scale: number) {
  const [cx, cy] = tile.labelCenter
  const R = tile.inRadius * 0.9
  if (photo && photo.naturalWidth > 0) {
    // Le plus grand carré qui tient dans le cercle : la photo (carrée) se voit en entier
    const side = R * Math.SQRT2
    const x = cx - side / 2
    const y = cy - side / 2
    const rad = side * 0.05
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, side, side, rad)
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 24 / scale
    ctx.fillStyle = '#050408'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.clip()
    const w = photo.naturalWidth
    const h = photo.naturalHeight
    const k = Math.max(side / w, side / h)
    ctx.drawImage(photo, cx - (w * k) / 2, cy - (h * k) / 2, w * k, h * k)
    ctx.restore()
    ctx.beginPath()
    ctx.roundRect(x, y, side, side, rad)
    ctx.lineWidth = 4 / scale
    ctx.strokeStyle = '#050408'
    ctx.stroke()
    return
  }
  const text = piece?.name ? initials(piece.name) : ''
  if (!text) return
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${R * (text.length > 1 ? 0.78 : 0.95)}px ${FONT_DISPLAY}`
  ctx.fillStyle = 'rgba(255,248,234,0.92)'
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 18 / scale
  ctx.fillText(text, cx, cy)
  ctx.restore()
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
      // Hors champ (zoom) : inutile de dessiner
      const [x0, y0, x1, y1] = tile.bbox
      if (x1 * view.scale + view.ox < -4 || x0 * view.scale + view.ox > s.width + 4 || y1 * view.scale + view.oy < -4 || y0 * view.scale + view.oy > s.height + 4) continue
      const piece = s.pieces.get(id)
      const sidePx = tile.equivRadius * view.scale * SIDE_FACTOR
      const focused = s.focusId === id
      const avatar = piece?.photoUrl && sidePx >= PHOTO_MIN_SIDE ? s.images.get(piece.photoUrl) : null
      let reveal = focused ? 1 : Math.min(1, Math.max(0, (sidePx - CONFIG.photoColorFromPx) / (CONFIG.photoColorToPx - CONFIG.photoColorFromPx)))
      // Morceau sorti avec du texte dessus : on garde le voile coloré du vitrail sur la photo, pour que le texte reste lisible
      if (piece?.rows && avatar) reveal = 1 - LIFT_VEIL * (s.labelAlpha ?? 1)
      const staged = s.stageId === id
      drawGlassTile(ctx, tile, {
        colors: glassColors(piece?.color ?? '#E0657F', id),
        sizePx: sidePx,
        zoom: view.scale,
        // En scène, la photo n'est pas étalée dans la forme (elle y serait rognée) : elle est sertie en médaillon
        avatar: staged ? null : avatar,
        reveal,
        dim: s.focusId && !focused ? 0.55 : 1,
        hovered: false,
      })
      if (staged) paintMedallion(ctx, tile, piece, piece?.photoUrl ? s.images.get(piece.photoUrl) : null, view.scale)
      // Photo + texte : on l'assombrit un peu en plus du voile coloré (les photos très claires restent lisibles)
      if (piece?.rows && avatar && tile.path) {
        ctx.fillStyle = `rgba(4,3,8,${0.3 * (s.labelAlpha ?? 1)})`
        ctx.fill(tile.path)
      }
    }
    const focus = s.focusId ? s.tiles.get(s.focusId) : null
    if (focus?.path) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = 4 / view.scale
      ctx.strokeStyle = '#F0B24A'
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

interface LabelLine {
  text: string
  font: string
  color: string
  shadow: boolean
  y: number // haut de la ligne, relatif au centre du cercle utile
  size: number
  spacing: string
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Typographie : DM Sans en plusieurs graisses ; les petites mentions en capitales espacées. Les noms peuvent passer en Fraunces
// (essai : ?noms=fraunces). Couleurs chaudes (crème) ; un contour sombre garde tout lisible sur n'importe quel verre.
const LABEL_STYLE: Record<LabelRow['kind'], { family: string; weight: string; italic: boolean; color: string; line: number; upper: boolean; spacing: number }> = {
  small: { family: FONT_SANS, weight: '500', italic: false, color: 'rgba(255,238,205,0.88)', line: 1.3, upper: true, spacing: 0.2 },
  name: { family: FONT_DISPLAY, weight: '600', italic: false, color: '#fff8ea', line: 1.08, upper: false, spacing: 0 },
  amount: { family: FONT_DISPLAY, weight: '700', italic: false, color: '#FFE2A8', line: 1.1, upper: false, spacing: 0 },
  message: { family: FONT_DISPLAY, weight: '400', italic: false, color: 'rgba(255,248,235,0.94)', line: 1.22, upper: false, spacing: 0 },
}
type SpacingCtx = CanvasRenderingContext2D & { letterSpacing?: string }
const setSpacing = (ctx: CanvasRenderingContext2D, value: string) => {
  if ('letterSpacing' in ctx) (ctx as SpacingCtx).letterSpacing = value
}
const NAME_SERIF = { family: FONT_SERIF, weight: '500', italic: false, color: '#fff8ea', line: 1.08, upper: false, spacing: 0 }
const styleOf = (kind: LabelRow['kind']) => (kind === 'name' && donorNamesSerif() ? NAME_SERIF : LABEL_STYLE[kind])
const LABEL_MAX_LINES: Record<LabelRow['kind'], number> = { small: 1, name: 2, amount: 1, message: 4 }

/**
 * Dispose des lignes de texte à l'intérieur du cercle utile du morceau, avec une marge : chaque ligne doit tenir dans la corde du cercle
 * à sa hauteur. On essaie des polices de plus en plus petites jusqu'à ce que tout rentre ; si rien ne rentre, rien ne s'affiche.
 * Les messages sont retirés en dernier recours (sauf en mode strict : tout ou rien).
 */
export function layoutRows(ctx: CanvasRenderingContext2D, rows: LabelRow[], hasPhoto: boolean, r: number, u: number, strict = false): LabelLine[] | null {
  const rs = r * 0.84 // rayon sûr : le texte ne s'approche jamais du plomb
  const base: Record<LabelRow['kind'], number> = {
    small: clamp(r * 0.085, 10 * u, 20 * u),
    // Tailles presque uniformes d'un morceau à l'autre : un grand morceau ne crie pas son nom en énorme
    name: clamp(r * 0.2, 12 * u, 19 * u),
    amount: clamp(r * 0.26, 14 * u, 56 * u),
    message: clamp(r * 0.16, 10 * u, 14 * u),
  }
  const min: Record<LabelRow['kind'], number> = { small: 8 * u, name: 10 * u, amount: 11 * u, message: 9 * u }

  const attempt = (list: LabelRow[]): LabelLine[] | null => {
    for (const k of [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.45]) {
      if (list.some(row => base[row.kind] * k < min[row.kind])) break
      for (const wf of [1.75, 1.5, 1.25, 1.05]) {
        const built: { text: string; font: string; color: string; h: number; gap: number; size: number; spacing: string }[] = []
        for (const row of list) {
          const st = styleOf(row.kind)
          const size = base[row.kind] * k
          const font = `${st.italic ? 'italic ' : ''}${st.weight} ${size}px ${st.family}`
          const spacing = st.spacing ? `${(st.spacing * size).toFixed(2)}px` : '0px'
          ctx.font = font
          setSpacing(ctx, spacing)
          const text = row.kind === 'message' ? `« ${row.text} »` : st.upper ? row.text.toLocaleUpperCase('fr-CA') : row.text
          const width = rs * wf * (row.kind === 'message' ? 0.92 : 1)
          wrapLines(ctx, text, width, LABEL_MAX_LINES[row.kind]).forEach((t, i) =>
            built.push({
              text: t,
              font,
              color: st.color,
              h: size * st.line,
              // un peu d'air avant le montant et avant le message
              gap: i === 0 ? (row.kind === 'message' ? size * 0.4 : row.kind === 'amount' ? size * 0.12 : 0) : 0,
              size,
              spacing,
            }),
          )
          setSpacing(ctx, '0px')
        }
        const H = built.reduce((a, b) => a + b.h + b.gap, 0)
        let y = hasPhoto ? rs * 0.78 - H : -H / 2
        const lines: LabelLine[] = []
        let ok = true
        for (const b of built) {
          y += b.gap
          ctx.font = b.font
          setSpacing(ctx, b.spacing)
          const half = ctx.measureText(b.text).width / 2
          setSpacing(ctx, '0px')
          const far = Math.max(Math.abs(y), Math.abs(y + b.h))
          if (far >= rs || half > Math.sqrt(rs * rs - far * far)) {
            ok = false
            break
          }
          lines.push({ text: b.text, font: b.font, color: b.color, shadow: true, y, size: b.size, spacing: b.spacing })
          y += b.h
        }
        if (ok) return lines
      }
    }
    return null
  }

  const withoutMessage = rows.filter(row => row.kind !== 'message')
  return attempt(rows) ?? (strict || withoutMessage.length === rows.length ? null : attempt(withoutMessage))
}

/** Début du témoignage pour le verre : coupé à un mot, avec « … » (le texte entier est dans la fiche et sur l'écran). */
export function glassExcerpt(text: string, max: number = CONFIG.glassMessageMax): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?«»-]+$/, '') + '…'
}

/** Nom (et message si la pièce est assez grande) au bas de la pièce quand elle a une photo, au centre sinon. Toujours à l'intérieur du morceau. */
function paintLabels(ctx: CanvasRenderingContext2D, s: Scene) {
  const { view } = s
  const u = s.uiScale ?? 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  const alpha = s.labelAlpha ?? 1
  if (alpha <= 0) return
  ctx.globalAlpha = alpha

  for (const [id, tile] of s.tiles) {
    const piece = s.pieces.get(id)
    if (!piece || s.stageId === id) continue
    const r = tile.inRadius * view.scale // rayon utile : plus grand cercle inscrit
    if (!piece.rows && r < LABEL_NAME_MIN * u) continue
    const sx = tile.labelCenter[0] * view.scale + view.ox
    const sy = tile.labelCenter[1] * view.scale + view.oy
    if (sx < -r || sx > s.width + r || sy < -r || sy > s.height + r) continue

    const hasPhoto = !!(piece.photoUrl && s.images.peek(piece.photoUrl))
    let rows = piece.rows
    if (!rows) {
      // Don anonyme : « Anonyme » sur le verre, à la place du nom
      rows = [{ text: piece.name ?? ANON_LABEL, kind: 'name' }]
      if (r >= LABEL_MESSAGE_MIN * u && piece.message) rows.push({ text: glassExcerpt(piece.message), kind: 'message' })
    }
    const lines = layoutRows(ctx, rows, hasPhoto, r, u)
    if (!lines?.length) continue

    // Texte sur une photo : un voile sombre et doux derrière le bloc de texte (limité au morceau)
    if (piece.rows && hasPhoto && tile.path) {
      let minY = Infinity
      let maxY = -Infinity
      let maxHalf = 0
      for (const line of lines) {
        ctx.font = line.font
        setSpacing(ctx, line.spacing)
        minY = Math.min(minY, line.y)
        maxY = Math.max(maxY, line.y + line.size * 1.1)
        maxHalf = Math.max(maxHalf, ctx.measureText(line.text).width / 2)
        setSpacing(ctx, '0px')
      }
      ctx.save()
      ctx.setTransform(s.dpr * view.scale, 0, 0, s.dpr * view.scale, s.dpr * view.ox, s.dpr * view.oy)
      ctx.clip(tile.path)
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
      ctx.translate(sx, sy + (minY + maxY) / 2)
      ctx.scale(maxHalf * 1.4 + r * 0.1, (maxY - minY) / 2 + r * 0.22)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      g.addColorStop(0, `rgba(4,3,8,${0.5 * alpha})`)
      g.addColorStop(0.6, `rgba(4,3,8,${0.3 * alpha})`)
      g.addColorStop(1, 'rgba(4,3,8,0)')
      ctx.fillStyle = g
      ctx.fillRect(-1, -1, 2, 2)
      ctx.restore()
    }

    for (const line of lines) {
      ctx.font = line.font
      setSpacing(ctx, line.spacing)
      const x = sx + parseFloat(line.spacing) / 2 // le dernier espacement de lettre est à droite du mot : on recentre
      const y = sy + line.y
      // Contour sombre doux, puis ombre, puis le texte : lisible sur tous les verres
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(1.2, line.size * 0.1)
      ctx.strokeStyle = 'rgba(8,5,14,0.45)'
      ctx.strokeText(line.text, x, y)
      ctx.fillStyle = line.color
      ctx.shadowColor = 'rgba(0,0,0,0.7)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 1
      ctx.fillText(line.text, x, y)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      setSpacing(ctx, '0px')
    }
  }
  ctx.globalAlpha = 1
}

export { UNIVERSE_RADIUS }
