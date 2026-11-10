// lib/glass.ts
// Rendu « rosace » : chaque territoire est une pièce de vitrail éclairée par derrière.
// Tout est dessiné en coordonnées monde (l'appelant pose la transformation caméra),
// sauf l'ambiance (halo, rayons, poussière, projection, cadre), dessinée en coordonnées écran.

import type { Tile } from './tiling'
import { FALLBACK_GLASS, LEGACY_GLASSES } from './theme'

// ---------- Couleurs de verre ----------
export interface GlassColors {
  base: string   // fond profond de la pièce
  mid: string    // teinte moyenne (petites pièces, minicarte)
  core: string   // cœur lumineux
  clear: string  // même teinte, transparente (fin de dégradé)
  tint: string   // teinte appliquée sur la grisaille des photos
  rgb: [number, number, number]
}

function hexToRgb(hex: string): [number, number, number] {
  // Ancienne palette : ramenée au verre actuel (morceaux d'essai gardés dans le navigateur, brouillons)
  const h = LEGACY_GLASSES[hex.toUpperCase()] ?? (/^#[0-9a-f]{6}$/i.test(hex) ? hex : FALLBACK_GLASS)
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

function rgbToHsl([r0, g0, b0]: [number, number, number]): [number, number, number] {
  const r = r0 / 255
  const g = g0 / 255
  const b = b0 / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l * 100]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

function hslToRgb(h: number, s0: number, l0: number): [number, number, number] {
  const s = s0 / 100
  const l = l0 / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

/** Petite variation stable par tuile (deux verres de même couleur ne sont jamais identiques). */
function jitterFromId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 6
}

/**
 * Palette des vitraux.
 * - 'glow'  : fidèle aux Glow Colors choisies par les utilisateurs (lib/constants.ts). Palette actuelle.
 * - 'jewel' : verre profond « pierre précieuse », plus sombre et plus contrasté (première version du prototype).
 * Pour revenir à l'ancienne palette, il suffit de remplacer 'glow' par 'jewel'.
 */
export const GLASS_PALETTE: 'glow' | 'jewel' = 'glow'

const colorCache = new Map<string, GlassColors>()

/** Couleurs de verre pour une couleur choisie par l'utilisateur. Mises en cache par (couleur, tuile). */
export function glassColors(hex: string, id: string): GlassColors {
  const key = hex + '|' + id
  const cached = colorCache.get(key)
  if (cached) return cached
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  const j = jitterFromId(id)
  const colors = GLASS_PALETTE === 'glow' ? glowPalette(hex, h, s, l, j) : jewelPalette(h, s, l, j)
  colorCache.set(key, colors)
  return colors
}

/** Palette fidèle : la pièce a exactement la Glow Color choisie, avec un cœur plus clair et des bords plus sombres. */
function glowPalette(hex: string, h: number, s: number, l: number, j: number): GlassColors {
  const jl = j * 0.5
  return {
    base: `hsl(${h} ${s}% ${Math.max(14, l * 0.62 + jl)}%)`,
    mid: `hsl(${h} ${s}% ${Math.max(18, l + jl)}%)`,
    core: `hsla(${h} ${s}% ${Math.min(88, l + 16 + jl)}% / 0.9)`,
    clear: `hsla(${h} ${s}% ${l}% / 0)`,
    tint: hex,
    rgb: hexToRgb(hex),
  }
}

/** Palette « pierre précieuse » (première version) : verre profond, cœur lumineux. */
function jewelPalette(h: number, s: number, l: number, j: number): GlassColors {
  const midL = Math.max(18, l * 0.52 + j)
  return {
    base: `hsl(${h} ${s * 0.85}% ${Math.max(10, l * 0.28 + j)}%)`,
    mid: `hsl(${h} ${s * 0.9}% ${midL}%)`,
    core: `hsla(${h} ${s}% ${Math.min(76, l * 0.98 + j)}% / 0.92)`,
    clear: `hsla(${h} ${s}% ${l * 0.52}% / 0)`,
    tint: `hsl(${h} ${Math.min(100, s * 1.05)}% ${Math.min(72, Math.max(45, l * 0.95))}%)`,
    rgb: hslToRgb(h, s * 0.9, midL),
  }
}

// ---------- Une pièce de vitrail ----------
export interface GlassTileOptions {
  colors: GlassColors
  /** Taille de la tuile à l'écran, en px (rayon du cercle de même aire). */
  sizePx: number
  zoom: number
  avatar: HTMLImageElement | null
  /** 0 = photo peinte (grisaille teintée par la couleur du verre), 1 = vraie photo en couleur. */
  reveal: number
  /** Assombrissement quand une autre tuile est sélectionnée (1 = aucun). */
  dim: number
  hovered: boolean
}

/** Photo recadrée en carré autour du centre de la pièce (point le plus spacieux), découpée par elle. */
function drawPhoto(ctx: CanvasRenderingContext2D, tile: Tile, img: CanvasImageSource, iw: number, ih: number, alpha: number) {
  if (!tile.path || alpha <= 0) return
  const [x0, y0, x1, y1] = tile.bbox
  const [cx, cy] = tile.labelCenter
  const half = Math.max(cx - x0, x1 - cx, cy - y0, y1 - cy)
  const side = half * 2
  const aspect = iw / ih
  const dw = aspect >= 1 ? side * aspect : side
  const dh = aspect >= 1 ? side : side / aspect
  const a0 = ctx.globalAlpha
  ctx.save()
  ctx.clip(tile.path)
  ctx.globalAlpha = a0 * alpha
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  ctx.restore()
  ctx.globalAlpha = a0
}

function glow(ctx: CanvasRenderingContext2D, tile: Tile, colors: GlassColors, strength: number, op: GlobalCompositeOperation) {
  if (!tile.path) return
  const [cx, cy] = tile.labelCenter
  const r = Math.max(tile.inRadius * 1.6, tile.equivRadius * 0.8)
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  grad.addColorStop(0, colors.core)
  grad.addColorStop(0.55, colors.mid)
  grad.addColorStop(1, colors.clear)
  // Pas de découpe (clip) : remplir le chemin ne peint déjà qu'à l'intérieur de la pièce.
  // Les découpes, une par pièce, coûtaient cher à chaque image (surtout sur téléphone).
  const prevOp = ctx.globalCompositeOperation
  const prevAlpha = ctx.globalAlpha
  ctx.globalCompositeOperation = op
  ctx.globalAlpha = prevAlpha * strength
  ctx.fillStyle = grad
  ctx.fill(tile.path)
  ctx.globalCompositeOperation = prevOp
  ctx.globalAlpha = prevAlpha
}

/** Dessine une pièce : verre, photo peinte éventuelle, plomb. Transformation caméra déjà posée. */
export function drawGlassTile(ctx: CanvasRenderingContext2D, tile: Tile, o: GlassTileOptions) {
  const path = tile.path
  if (!path) return
  const { colors, sizePx } = o

  if (sizePx < 10) {
    // Trop petite pour un dégradé : couleur moyenne, qui forme la texture de la rosace vue de loin
    ctx.fillStyle = colors.mid
    ctx.fill(path)
  } else {
    ctx.fillStyle = colors.base
    ctx.fill(path)
    const photo = o.avatar && sizePx >= 34 && o.avatar.naturalWidth > 0 ? o.avatar : null
    if (photo) {
      if (o.reveal < 1) {
        // Grisaille par modes de fusion (aucune lecture de pixels, donc aucune contrainte CORS) :
        // photo → désaturée → teintée par la couleur du verre → éclairée par derrière
        drawPhoto(ctx, tile, photo, photo.naturalWidth, photo.naturalHeight, 1)
        const prevOp = ctx.globalCompositeOperation
        ctx.globalCompositeOperation = 'saturation'
        ctx.fillStyle = '#808080'
        ctx.fill(path)
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = colors.tint
        ctx.fill(path)
        ctx.globalCompositeOperation = prevOp
        glow(ctx, tile, colors, 0.55, 'screen')
      }
      // Sélectionnée : la vraie photo, en couleur
      if (o.reveal > 0) drawPhoto(ctx, tile, photo, photo.naturalWidth, photo.naturalHeight, o.reveal)
    } else {
      glow(ctx, tile, colors, 1, 'source-over')
    }
  }

  if (o.hovered) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.13)'
    ctx.fill(path)
  }
  if (o.dim < 1) {
    ctx.fillStyle = `rgba(5, 4, 8, ${1 - o.dim})`
    ctx.fill(path)
  }
  if (sizePx > 2) {
    // Plomb : plus épais autour des grandes pièces, comme dans un vrai vitrail
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.min(5, 0.7 + Math.sqrt(sizePx) * 0.3) / o.zoom
    ctx.strokeStyle = '#050408'
    ctx.stroke(path)
  }
}

// ---------- Ambiance ----------
interface Ray { ang: number; rgb: [number, number, number]; w: number; ph: number }
interface Mote { r: number; t: number; o: number; v: number; s: number; ph: number }

/**
 * Lumière autour de la rosace : halo, rayons colorés, poussière, projection au sol,
 * reflet qui passe sur le verre et cadre de pierre. Tout est en coordonnées écran.
 */
export class Ambience {
  private rays: Ray[] = []
  private dust: Mote[] = []
  private dom: [number, number, number] = [140, 110, 200]
  private projection: HTMLCanvasElement | null = null

  /**
   * À appeler après chaque (re)calcul du pavage.
   * colorAt : couleur de la tuile au point monde donné (les rayons prennent la couleur du verre traversé).
   */
  rebuild(tiles: Iterable<Tile>, colorOf: (t: Tile) => GlassColors, radius: number, colorAt: (x: number, y: number) => GlassColors | null) {
    let r = 0
    let g = 0
    let b = 0
    let A = 0
    const list = [...tiles]
    for (const t of list) {
      const c = colorOf(t).rgb
      r += c[0] * t.area
      g += c[1] * t.area
      b += c[2] * t.area
      A += t.area
    }
    if (A > 0) this.dom = [r / A, g / A, b / A]

    this.rays = []
    for (let k = 0; k < 7; k++) {
      const ang = ((28 + k * (124 / 6) + (Math.random() - 0.5) * 8) * Math.PI) / 180
      const hit = colorAt(Math.cos(ang) * radius * 0.9, Math.sin(ang) * radius * 0.9)
      this.rays.push({ ang, rgb: hit ? hit.rgb : this.dom, w: 0.7 + Math.random() * 0.6, ph: Math.random() * 6.28 })
    }
    this.dust = []
    for (let i = 0; i < 90; i++) {
      this.dust.push({ r: i % 7, t: Math.random(), o: Math.random() * 2 - 1, v: 0.00002 + Math.random() * 0.00005, s: 0.6 + Math.random() * 1.6, ph: Math.random() * 6.28 })
    }

    // Projection au sol : petite image de la rosace, naturellement floue une fois agrandie
    if (typeof document === 'undefined') return
    const P = 40
    const c = document.createElement('canvas')
    c.width = c.height = P
    const x = c.getContext('2d')
    if (x) {
      const k = P / (2 * radius)
      x.setTransform(k, 0, 0, k, P / 2, P / 2)
      for (const t of list) {
        if (!t.path) continue
        x.fillStyle = colorOf(t).mid
        x.fill(t.path)
      }
    }
    this.projection = c
  }

  private rayGeom(ray: Ray, cx: number, cy: number, r: number, H: number, now: number, reduced: boolean) {
    const sway = reduced ? 0 : Math.sin(now * 0.00025 + ray.ph) * 0.05
    const P: [number, number] = [cx + Math.cos(ray.ang) * r * 0.96, cy + Math.sin(ray.ang) * r * 0.96]
    let dx = Math.cos(ray.ang) * 0.42 + sway
    let dy = 1
    const L = Math.hypot(dx, dy)
    dx /= L
    dy /= L
    return { P, dx, dy, nx: -dy, ny: dx, len: H * 1.3 + r, w0: r * 0.09 * ray.w, w1: r * 0.4 * ray.w }
  }

  /** Derrière le verre : halo, projection, rayons, poussière. `a` = intensité (0 quand on zoome). */
  drawBehind(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, W: number, H: number, a: number, now: number, dt: number, reduced: boolean) {
    if (a <= 0) return
    const [dr, dg, db] = this.dom.map(Math.round)
    const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2.3)
    halo.addColorStop(0, `rgba(${dr},${dg},${db},${0.34 * a})`)
    halo.addColorStop(0.35, `rgba(${dr},${dg},${db},${0.1 * a})`)
    halo.addColorStop(1, `rgba(${dr},${dg},${db},0)`)
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, W, H)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    if (this.projection) {
      ctx.save()
      ctx.globalAlpha = 0.2 * a
      ctx.translate(cx, cy + r * 1.75)
      ctx.scale(1, 0.2)
      ctx.imageSmoothingQuality = 'high'
      const d = 2 * r * 1.15
      ctx.drawImage(this.projection, -d / 2, -d / 2, d, d)
      ctx.restore()
    }
    for (const ray of this.rays) {
      const q = this.rayGeom(ray, cx, cy, r, H, now, reduced)
      const E: [number, number] = [q.P[0] + q.dx * q.len, q.P[1] + q.dy * q.len]
      const gr = ctx.createLinearGradient(q.P[0], q.P[1], E[0], E[1])
      const [rr, rg, rb] = ray.rgb.map(Math.round)
      gr.addColorStop(0, `rgba(${rr},${rg},${rb},${0.13 * a})`)
      gr.addColorStop(0.5, `rgba(${rr},${rg},${rb},${0.05 * a})`)
      gr.addColorStop(1, `rgba(${rr},${rg},${rb},0)`)
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.moveTo(q.P[0] + q.nx * q.w0, q.P[1] + q.ny * q.w0)
      ctx.lineTo(E[0] + q.nx * q.w1, E[1] + q.ny * q.w1)
      ctx.lineTo(E[0] - q.nx * q.w1, E[1] - q.ny * q.w1)
      ctx.lineTo(q.P[0] - q.nx * q.w0, q.P[1] - q.ny * q.w0)
      ctx.closePath()
      ctx.fill()
    }
    if (this.rays.length) {
      for (const p of this.dust) {
        if (!reduced) {
          p.t += p.v * dt
          if (p.t > 1) {
            p.t = 0
            p.o = Math.random() * 2 - 1
          }
        }
        const q = this.rayGeom(this.rays[p.r % this.rays.length], cx, cy, r, H, now, reduced)
        const along = 0.05 + p.t * 0.75
        const w = q.w0 + (q.w1 - q.w0) * along
        const x = q.P[0] + q.dx * q.len * along + q.nx * p.o * w * 0.8
        const y = q.P[1] + q.dy * q.len * along + q.ny * p.o * w * 0.8
        const tw = 0.55 + 0.45 * Math.sin(now * 0.002 + p.ph)
        ctx.fillStyle = `rgba(255,226,168,${0.5 * tw * a * Math.sin(Math.PI * p.t)})`
        ctx.beginPath()
        ctx.arc(x, y, p.s, 0, 6.2832)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  /** Devant le verre : reflet qui passe lentement, puis cadre de pierre. */
  drawFront(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, now: number, reduced: boolean) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, 6.2832)
    ctx.clip()
    const cyc = reduced ? 0.35 : ((now * 0.00006) % 1.8) - 0.4
    const st = (v: number) => Math.max(0, Math.min(1, v))
    const lg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    lg.addColorStop(st(cyc - 0.18), 'rgba(255,226,168,0)')
    lg.addColorStop(st(cyc), 'rgba(255,226,168,0.09)')
    lg.addColorStop(st(cyc + 0.18), 'rgba(255,226,168,0)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = lg
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r)
    ctx.restore()

    const ringW = Math.max(4, r * 0.03)
    ctx.save()
    ctx.lineWidth = ringW
    ctx.strokeStyle = '#16131d'
    ctx.beginPath()
    ctx.arc(cx, cy, r + ringW / 2 - 1, 0, 6.2832)
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,240,215,.10)'
    ctx.beginPath()
    ctx.arc(cx, cy, r + ringW - 1, 0, 6.2832)
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(0,0,0,.85)'
    ctx.beginPath()
    ctx.arc(cx, cy, r + 0.5, 0, 6.2832)
    ctx.stroke()
    if (ringW > 6) {
      ctx.fillStyle = 'rgba(255,240,215,.07)'
      for (let k = 0; k < 32; k++) {
        const t = (k / 32) * 6.2832
        ctx.beginPath()
        ctx.arc(cx + Math.cos(t) * (r + ringW / 2), cy + Math.sin(t) * (r + ringW / 2), ringW * 0.16, 0, 6.2832)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}
