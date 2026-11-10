// Le vitrail en SVG, sans canevas : image de partage (/api/og, côté serveur) et affiche (/affiche, à imprimer).
// Même pavage que la page (même graine, mêmes poids), même lecture du verre (fond profond, cœur lumineux, plomb plus
// épais autour des grandes pièces), sans photos ni textes. Couleurs en rgb() : le moteur de l'image de partage (resvg)
// ne lit pas la syntaxe hsl() récente.

import { FALLBACK_GLASS, LEGACY_GLASSES } from './theme'
import { pieceWeights } from './render'
import { UNIVERSE_RADIUS, computeTileData, mulberry32, pointInPolygon, seedFromIds, type Point, type TileData, type TilingItem } from './tiling'

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const h = LEGACY_GLASSES[hex.toUpperCase()] ?? (/^#[0-9a-f]{6}$/i.test(hex) ? hex : FALLBACK_GLASS)
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}
function rgbToHsl([r0, g0, b0]: Rgb): Rgb {
  const r = r0 / 255,
    g = g0 / 255,
    b = b0 / 255
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l * 100]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}
function hsl(h: number, s0: number, l0: number): string {
  const s = s0 / 100,
    l = Math.max(0, Math.min(100, l0)) / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255)
  return `rgb(${f(0)},${f(8)},${f(4)})`
}

/** Mêmes teintes que glowPalette (lib/glass.ts) : fond, teinte moyenne, cœur. */
function shades(hex: string) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  return { base: hsl(h, s, Math.max(14, l * 0.62)), mid: hsl(h, s, Math.max(18, l)), core: hsl(h, s, Math.min(88, l + 16)) }
}

export interface SvgPiece {
  id: string
  color: string
  amountCents: number
}

export interface SceneTile {
  id: string
  /** Points pour <polygon points> (unités monde, origine au centre). */
  points: string
  poly: Point[]
  /** Fond, teinte moyenne, cœur (rgb). */
  base: string
  mid: string
  core: string
  /** Assez grande pour un dégradé (sinon : teinte moyenne pleine). */
  shaded: boolean
  /** Dégradé : centre et rayon (unités monde). */
  glow: [number, number, number]
  /** Plomb (unités monde). */
  lead: number
  labelCenter: Point
  inRadius: number
}

export interface GlassScene {
  tiles: SceneTile[]
  /** La place libre de l'affiche (morceau vide), si demandée. */
  free: SceneTile | null
  /** Demi-côté du carré à afficher (le disque et son anneau de plomb), centré sur l'origine. */
  view: number
  ring: number
  radius: number
}

const FREE_ID = '__votre-morceau'

/**
 * Le vitrail en tuiles prêtes à dessiner, pour un rendu de `sizePx` px de côté (épaisseur du plomb).
 * `freeSlot` (affiche) : une place libre est ajoutée au pavage, grande comme un don généreux ; parmi quelques essais
 * (la graine dépend de l'ensemble des identifiants), on garde celui où elle tombe le plus près du centre.
 */
export function glassScene(pieces: SvgPiece[], sizePx: number, freeSlot = false): GlassScene | null {
  if (!pieces.length && !freeSlot) return null
  const R = UNIVERSE_RADIUS
  const ring = R * 0.035
  const view = R + ring
  const k = sizePx / (2 * view)
  const weights: TilingItem[] = pieceWeights(pieces as never)
  let data: TileData[]
  let freeId: string | null = null
  if (!freeSlot) data = computeTileData(weights, mulberry32(seedFromIds(pieces.map(p => p.id))))
  else {
    const mean = weights.length ? weights.reduce((a, w) => a + w.weight, 0) / weights.length : 1
    // Assez grande pour y écrire « votre morceau » et se voir de loin (environ 5 % du disque sur un grand vitrail),
    // sans écraser un petit vitrail
    const total = weights.reduce((a, w) => a + w.weight, 0)
    const weight = Math.max(mean * 1.6, total * 0.05)
    let best: { data: TileData[]; id: string; score: number } | null = null
    for (let n = 0; n < (weights.length > 150 ? 4 : 8); n++) {
      const id = `${FREE_ID}-${n}`
      const items = [...weights, { id, weight }]
      const d = computeTileData(items, mulberry32(seedFromIds(items.map(i => i.id))))
      const t = d.find(x => x.id === id)!
      const score = Math.hypot(t.labelCenter[0], t.labelCenter[1]) / R - t.inRadius / R
      if (!best || score < best.score) best = { data: d, id, score }
    }
    data = best!.data
    freeId = best!.id
  }
  const byId = new Map(pieces.map(p => [p.id, p]))
  const f = (n: number) => n.toFixed(1)
  let free: SceneTile | null = null
  const tiles: SceneTile[] = []
  for (const t of data) {
    const c = shades(byId.get(t.id)?.color ?? FALLBACK_GLASS)
    const px = t.equivRadius * 2 * k
    const tile: SceneTile = {
      id: t.id,
      points: t.poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' '),
      poly: t.poly,
      ...c,
      shaded: px >= 10,
      glow: [t.labelCenter[0], t.labelCenter[1], Math.max(t.inRadius * 1.6, t.equivRadius * 0.8)],
      lead: Math.min(5, 0.7 + Math.sqrt(px) * 0.3) / k,
      labelCenter: t.labelCenter,
      inRadius: t.inRadius,
    }
    if (t.id === freeId) free = tile
    else tiles.push(tile)
  }
  return { tiles, free, view, ring, radius: R }
}

export interface LightRay {
  /** Quadrilatère du rayon (unités monde). */
  points: string
  /** Ligne du dégradé : du verre vers le bas. */
  from: Point
  to: Point
  /** Couleur du verre traversé (rgb). */
  color: string
}

/**
 * Rayons de lumière sous le vitrail, comme sur la page (lib/glass.ts, drawBehind) : sept faisceaux qui partent du bas
 * du disque, s'évasent en tombant, chacun de la couleur du verre qu'il traverse. Déterministes (pas d'aléa) pour
 * l'impression. `length` : longueur, en rayons du disque.
 */
export function lightRays(scene: GlassScene, length = 2.6): LightRay[] {
  const R = scene.radius
  const all = scene.free ? [...scene.tiles, scene.free] : scene.tiles
  const widths = [1.0, 0.8, 1.2, 0.9, 1.15, 0.75, 1.0]
  return widths.map((w, k) => {
    const ang = ((28 + k * (124 / 6)) * Math.PI) / 180
    const hx = Math.cos(ang) * R * 0.9
    const hy = Math.sin(ang) * R * 0.9
    const hit = scene.tiles.find(t => pointInPolygon(t.poly, hx, hy)) ?? all[0]
    const P: Point = [Math.cos(ang) * R * 0.96, Math.sin(ang) * R * 0.96]
    let dx = Math.cos(ang) * 0.42
    let dy = 1
    const L = Math.hypot(dx, dy)
    dx /= L
    dy /= L
    const nx = -dy
    const ny = dx
    const len = R * length
    const w0 = R * 0.09 * w
    const w1 = R * 0.4 * w
    const E: Point = [P[0] + dx * len, P[1] + dy * len]
    const f = (n: number) => n.toFixed(1)
    const pts: Point[] = [
      [P[0] + nx * w0, P[1] + ny * w0],
      [E[0] + nx * w1, E[1] + ny * w1],
      [E[0] - nx * w1, E[1] - ny * w1],
      [P[0] - nx * w0, P[1] - ny * w0],
    ]
    return { points: pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' '), from: P, to: E, color: hit?.mid ?? 'rgb(240,178,74)' }
  })
}

/**
 * Le vitrail entier en texte SVG, carré de `size` px (le disque le remplit, avec son anneau de plomb).
 * Vide : null (l'appelant montre autre chose).
 */
export function vitrailSvg(pieces: SvgPiece[], size: number, opts: { rays?: boolean; padX?: number; padBottom?: number } = {}): string | null {
  const s = glassScene(pieces, size)
  if (!s) return null
  const f = (n: number) => n.toFixed(1)
  const defs: string[] = []
  const body: string[] = []
  // Rayons (fond sombre) : la lumière du verre qui tombe sous le disque. L'image s'agrandit (padX de chaque côté,
  // padBottom dessous, en px) pour les laisser s'évaser ; le disque garde sa taille et sa place en haut.
  const k = (2 * s.view) / size
  const padX = (opts.padX ?? 0) * k
  const padBottom = (opts.padBottom ?? 0) * k
  if (opts.rays) {
    lightRays(s, 2.4).forEach((r, i) => {
      defs.push(
        `<linearGradient id="r${i}" gradientUnits="userSpaceOnUse" x1="${f(r.from[0])}" y1="${f(r.from[1])}" x2="${f(r.to[0])}" y2="${f(r.to[1])}"><stop offset="0" stop-color="${r.color}" stop-opacity="0.26"/><stop offset="0.3" stop-color="${r.color}" stop-opacity="0.09"/><stop offset="0.75" stop-color="${r.color}" stop-opacity="0"/></linearGradient>`,
      )
      body.push(`<polygon points="${r.points}" fill="url(#r${i})"/>`)
    })
  }
  body.push(`<circle r="${s.radius}" fill="#050408"/>`)
  s.tiles.forEach((t, i) => {
    body.push(`<polygon points="${t.points}" fill="${t.shaded ? t.base : t.mid}"/>`)
    if (t.shaded) {
      const [cx, cy, r] = t.glow
      defs.push(
        `<radialGradient id="g${i}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"><stop offset="0" stop-color="${t.core}" stop-opacity="0.9"/><stop offset="0.55" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.mid}" stop-opacity="0"/></radialGradient>`,
      )
      body.push(`<polygon points="${t.points}" fill="url(#g${i})"/>`)
    }
    body.push(`<polygon points="${t.points}" fill="none" stroke="#050408" stroke-width="${f(t.lead)}" stroke-linejoin="round"/>`)
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 2 * (opts.padX ?? 0)}" height="${size + (opts.padBottom ?? 0)}" viewBox="${f(-s.view - padX)} ${f(-s.view)} ${f(2 * s.view + 2 * padX)} ${f(2 * s.view + padBottom)}">` +
    `<defs>${defs.join('')}</defs>` +
    body.join('') +
    `<circle r="${f(s.radius + s.ring / 2)}" fill="none" stroke="#050408" stroke-width="${f(s.ring)}"/>` +
    `</svg>`
  )
}
