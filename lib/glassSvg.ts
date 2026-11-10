// Le vitrail en SVG, côté serveur : image de partage (/api/og). Même pavage que la page (même graine, mêmes poids),
// même lecture du verre (fond profond, cœur lumineux, plomb plus épais autour des grandes pièces), sans photos ni textes.
// Couleurs en rgb() : le moteur qui dessine l'image (resvg) ne lit pas la syntaxe hsl() récente.

import { FALLBACK_GLASS, LEGACY_GLASSES } from './theme'
import { pieceWeights } from './render'
import { UNIVERSE_RADIUS, computeTileData, mulberry32, seedFromIds } from './tiling'

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const h = LEGACY_GLASSES[hex.toUpperCase()] ?? (/^#[0-9a-f]{6}$/i.test(hex) ? hex : FALLBACK_GLASS)
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}
function rgbToHsl([r0, g0, b0]: Rgb): Rgb {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l * 100]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}
function hsl(h: number, s0: number, l0: number): string {
  const s = s0 / 100, l = Math.max(0, Math.min(100, l0)) / 100
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

/**
 * Le vitrail entier, carré de `size` px (le disque le remplit, avec son anneau de plomb).
 * Vide : null (l'appelant montre autre chose).
 */
export function vitrailSvg(pieces: SvgPiece[], size: number): string | null {
  if (!pieces.length) return null
  // Même pavage que la page : poids de pieceWeights, graine tirée de l'ensemble des donateurs
  const data = computeTileData(pieceWeights(pieces as never), mulberry32(seedFromIds(pieces.map(p => p.id))))
  const byId = new Map(pieces.map(p => [p.id, p]))
  const R = UNIVERSE_RADIUS
  const ring = R * 0.035
  const view = R + ring
  const k = size / (2 * view) // px par unité
  const f = (n: number) => n.toFixed(1)
  const defs: string[] = []
  const body: string[] = []
  data.forEach((t, i) => {
    const p = byId.get(t.id)
    const c = shades(p?.color ?? FALLBACK_GLASS)
    const pts = t.poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')
    const sizePx = t.equivRadius * 2 * k
    const lead = Math.min(5, 0.7 + Math.sqrt(sizePx) * 0.3) / k
    body.push(`<polygon points="${pts}" fill="${sizePx < 10 ? c.mid : c.base}"/>`)
    if (sizePx >= 10) {
      const [cx, cy] = t.labelCenter
      const r = Math.max(t.inRadius * 1.6, t.equivRadius * 0.8)
      defs.push(
        `<radialGradient id="g${i}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"><stop offset="0" stop-color="${c.core}" stop-opacity="0.9"/><stop offset="0.55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.mid}" stop-opacity="0"/></radialGradient>`,
      )
      body.push(`<polygon points="${pts}" fill="url(#g${i})"/>`)
    }
    body.push(`<polygon points="${pts}" fill="none" stroke="#050408" stroke-width="${f(lead)}" stroke-linejoin="round"/>`)
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-view} ${-view} ${2 * view} ${2 * view}">` +
    `<defs>${defs.join('')}</defs>` +
    `<circle r="${R}" fill="#050408"/>` +
    body.join('') +
    `<circle r="${f(R + ring / 2)}" fill="none" stroke="#050408" stroke-width="${f(ring)}"/>` +
    `</svg>`
  )
}
