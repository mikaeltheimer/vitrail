// lib/tiling.ts
// Pavage sans vide de l'univers : chaque contribution reçoit un polygone convexe
// dont l'aire est proportionnelle à son poids.
//
// Méthode (v4) :
// 1. Les contributions sont réparties en 7 à 40 groupes de poids voisins (grands et petits mélangés).
// 2. Le cercle est découpé en autant de régions par un diagramme de Voronoï pondéré (diagramme de puissance),
//    dont les poids sont ajustés pour que chaque région ait l'aire de son groupe (écart < 0,1 %).
//    Les frontières se rejoignent en « Y » : aucune grande ligne droite ne traverse l'univers.
// 3. Chaque région est découpée récursivement par des droites (aires exactes), avec un garde-fou :
//    à chaque coupe, plusieurs mélanges et plusieurs angles sont essayés, et on garde la coupe
//    qui laisse les morceaux les plus ronds.

export type Point = [number, number]

/** Version sérialisable d'une tuile : peut traverser postMessage (pas de Path2D). */
export interface TileData {
  id: string
  poly: Point[]
  bbox: [number, number, number, number]
  centroid: Point
  area: number
  equivRadius: number
  labelCenter: Point
  inRadius: number
}

export interface Tile {
  id: string
  poly: Point[]
  bbox: [number, number, number, number] // minX, minY, maxX, maxY
  centroid: Point
  area: number
  /** Rayon du cercle de même aire. Sert de `radius` pour le zoom et le maxZoom existants. */
  equivRadius: number
  /** Centre du plus grand cercle inscrit : point le plus « spacieux » de la tuile (étiquettes, photo, caméra). */
  labelCenter: Point
  /** Rayon du plus grand cercle inscrit. Taille utile pour les étiquettes et le niveau de détail. */
  inRadius: number
  /** Chemin en coordonnées monde (null côté serveur). */
  path: Path2D | null
  /** Points pré-formatés pour <polygon points="..."> dans les minicartes. */
  svgPoints: string
}

export interface TilingItem {
  id: string
  weight: number
}

type Rand = () => number

// ---------- Réglages ----------
/** Rayon de l'univers en unités monde. La caméra s'y adapte, la valeur absolue importe peu. */
export const UNIVERSE_RADIUS = 1000
/** Nombre de côtés du contour de l'univers (160 ≈ cercle). */
export const UNIVERSE_SIDES = 160
/** Directions de coupe testées à chaque découpe. */
const GUARD_ANGLES = 12
/** Un groupe ne doit pas être « un géant + des miettes » : part minimale du reste. */
const GUARD_RMIN = 0.15
/** Écart d'aire toléré pour les régions (1e-3 = 0,1 %). */
const REGION_TOLERANCE = 1e-3

/** Nombre de régions selon le nombre de contributions. Moins de 7 régions dans un cercle = effet « pizza ». */
function regionCount(n: number): number {
  return n < 14 ? 1 : Math.min(40, Math.max(7, Math.round(n / 6)))
}

export const UNIVERSE_BOUNDS = {
  minX: -UNIVERSE_RADIUS,
  minY: -UNIVERSE_RADIUS,
  maxX: UNIVERSE_RADIUS,
  maxY: UNIVERSE_RADIUS,
}

export function universePolygon(): Point[] {
  const p: Point[] = []
  for (let i = 0; i < UNIVERSE_SIDES; i++) {
    const a = (i / UNIVERSE_SIDES) * Math.PI * 2
    p.push([Math.cos(a) * UNIVERSE_RADIUS, Math.sin(a) * UNIVERSE_RADIUS])
  }
  return p
}

// ---------- Hasard (optionnellement déterministe) ----------
/** Générateur pseudo-aléatoire reproductible. */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Graine dérivée des ids : l'univers ne change que lorsqu'une contribution est ajoutée ou retirée. */
export function seedFromIds(ids: string[]): number {
  let h = 2166136261
  for (const id of [...ids].sort()) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}

function shuffle<T>(a: T[], rand: Rand): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- Géométrie ----------
export function polygonArea(p: Point[]): number {
  let s = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

function polygonCentroid(p: Point[]): Point {
  let cx = 0
  let cy = 0
  let s = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    const f = a[0] * b[1] - b[0] * a[1]
    s += f
    cx += (a[0] + b[0]) * f
    cy += (a[1] + b[1]) * f
  }
  if (Math.abs(s) < 1e-12) return p[0]
  return [cx / (3 * s), cy / (3 * s)]
}

/** Garde la partie du polygone où sign × (p·d − t) ≤ 0. */
function clipHalfPlane(poly: Point[], dx: number, dy: number, t: number, sign: 1 | -1): Point[] {
  const out: Point[] = []
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const da = sign * (a[0] * dx + a[1] * dy - t)
    const db = sign * (b[0] * dx + b[1] * dy - t)
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const s = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s])
    }
  }
  return out
}

/** Coupe par une droite perpendiculaire à d, placée pour que la part A ait exactement `ratio` de l'aire. */
function splitPolygon(poly: Point[], dx: number, dy: number, ratio: number, iters = 52): [Point[], Point[]] {
  const total = polygonArea(poly)
  let lo = Infinity
  let hi = -Infinity
  for (const p of poly) {
    const v = p[0] * dx + p[1] * dy
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2
    if (polygonArea(clipHalfPlane(poly, dx, dy, mid, 1)) / total < ratio) lo = mid
    else hi = mid
  }
  const t = (lo + hi) / 2
  return [clipHalfPlane(poly, dx, dy, t, 1), clipHalfPlane(poly, dx, dy, t, -1)]
}

/** Distance d'un point intérieur au bord le plus proche (polygone convexe). */
function distanceToBoundary(poly: Point[], x: number, y: number): number {
  let min = Infinity
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const len = Math.hypot(ex, ey)
    if (len < 1e-12) continue
    const d = Math.abs(ex * (y - a[1]) - ey * (x - a[0])) / len
    if (d < min) min = d
  }
  return min === Infinity ? 0 : min
}

/**
 * Rondeur : distance du centroïde au bord le plus proche ÷ distance au sommet le plus loin.
 * cercle 1 · hexagone 0,87 · carré 0,71 · triangle équilatéral 0,5 · rectangle 2:1 0,45 · 4:1 0,24 · 8:1 0,12
 */
export function roundness(p: Point[]): number {
  const c = polygonCentroid(p)
  const inr = distanceToBoundary(p, c[0], c[1])
  let outr = 0
  for (const v of p) {
    const d = Math.hypot(v[0] - c[0], v[1] - c[1])
    if (d > outr) outr = d
  }
  return outr ? inr / outr : 0
}

/** Plus grand cercle inscrit (approché par une grille affinée trois fois). */
function inscribedCircle(poly: Point[], bbox: [number, number, number, number], start: Point): { center: Point; radius: number } {
  let best: Point = start
  let bestD = distanceToBoundary(poly, start[0], start[1])
  let cx = (bbox[0] + bbox[2]) / 2
  let cy = (bbox[1] + bbox[3]) / 2
  let hw = (bbox[2] - bbox[0]) / 2
  let hh = (bbox[3] - bbox[1]) / 2
  const N = 7
  for (let level = 0; level < 4; level++) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = cx - hw + (2 * hw * i) / N
        const y = cy - hh + (2 * hh * j) / N
        if (!pointInPolygon(poly, x, y)) continue
        const d = distanceToBoundary(poly, x, y)
        if (d > bestD) {
          bestD = d
          best = [x, y]
        }
      }
    }
    cx = best[0]
    cy = best[1]
    hw /= 3
    hh /= 3
  }
  return { center: best, radius: bestD }
}

// ---------- Découpe avec garde-fou ----------
/** Pénalité si un côté contient un élément qui écrase le reste (la coupe suivante ferait une lamelle). */
function sideRisk(side: TilingItem[], w: number): number {
  if (side.length < 2) return 1
  let m = 0
  for (const it of side) if (it.weight > m) m = it.weight
  const rest = 1 - m / w
  return rest >= GUARD_RMIN ? 1 : rest / GUARD_RMIN
}

function balancedSplit(items: TilingItem[]): [TilingItem[], TilingItem[], number] {
  const total = items.reduce((s, it) => s + it.weight, 0)
  let cum = 0
  let k = 1
  let best = Infinity
  for (let i = 0; i < items.length - 1; i++) {
    cum += items[i].weight
    const d = Math.abs(cum - total / 2)
    if (d < best) {
      best = d
      k = i + 1
    }
  }
  return [items.slice(0, k), items.slice(k), total]
}

type RawTile = { id: string; poly: Point[] }

function tileGuarded(poly: Point[], items: TilingItem[], rand: Rand, out: RawTile[]) {
  if (items.length === 1) {
    out.push({ id: items[0].id, poly })
    return
  }
  const tries = items.length <= 2 ? 1 : items.length > 24 ? 2 : 6
  const cands: { A: TilingItem[]; B: TilingItem[]; pa: Point[]; pb: Point[]; score: number }[] = []
  let bestScore = -1
  for (let t = 0; t < tries; t++) {
    const order = t === 0 ? items : shuffle([...items], rand)
    const [A, B, total] = balancedSplit(order)
    const wA = A.reduce((s, it) => s + it.weight, 0)
    const risk = Math.min(sideRisk(A, wA), sideRisk(B, total - wA))
    const offset = rand() * ((2 * Math.PI) / GUARD_ANGLES)
    for (let k = 0; k < GUARD_ANGLES; k++) {
      const ang = offset + (k / GUARD_ANGLES) * Math.PI * 2
      const [pa, pb] = splitPolygon(poly, Math.cos(ang), Math.sin(ang), wA / total, 36)
      if (pa.length < 3 || pb.length < 3) continue
      const score = Math.min(roundness(pa), roundness(pb)) * risk
      cands.push({ A, B, pa, pb, score })
      if (score > bestScore) bestScore = score
    }
  }
  if (cands.length === 0) {
    // Cas dégénéré : coupe simple et exacte
    const [A, B, total] = balancedSplit(items)
    const wA = A.reduce((s, it) => s + it.weight, 0)
    const [pa, pb] = splitPolygon(poly, 1, 0, wA / total)
    tileGuarded(pa, A, rand, out)
    tileGuarded(pb, B, rand, out)
    return
  }
  const good = cands.filter(c => c.score >= bestScore * 0.95)
  const c = good[Math.floor(rand() * good.length)]
  tileGuarded(c.pa, c.A, rand, out)
  tileGuarded(c.pb, c.B, rand, out)
}

// ---------- Régions de Voronoï pondérées ----------
/** Répartition en K groupes de poids voisins, chacun mélangeant grands et petits. */
function makeGroups(items: TilingItem[], K: number): { w: number; items: TilingItem[] }[] {
  const groups = Array.from({ length: K }, () => ({ w: 0, items: [] as TilingItem[] }))
  for (const it of [...items].sort((a, b) => b.weight - a.weight)) {
    let m = groups[0]
    for (const g of groups) if (g.w < m.w) m = g
    m.w += it.weight
    m.items.push(it)
  }
  return groups.filter(g => g.items.length > 0)
}

/** Cellules d'un diagramme de puissance, découpées dans l'univers. */
function powerCells(U: Point[], S: Point[], w: number[]): Point[][] {
  return S.map((si, i) => {
    let c = U
    for (let j = 0; j < S.length && c.length >= 3; j++) {
      if (j === i) continue
      const sj = S[j]
      const t = (sj[0] * sj[0] + sj[1] * sj[1] - (si[0] * si[0] + si[1] * si[1]) - w[j] + w[i]) / 2
      c = clipHalfPlane(c, sj[0] - si[0], sj[1] - si[1], t, 1)
    }
    return c
  })
}

const cellAreas = (cells: Point[][]) => cells.map(c => (c.length >= 3 ? polygonArea(c) : 0))

function maxRelativeError(areas: number[], targets: number[]): number {
  let e = 0
  for (let i = 0; i < areas.length; i++) e = Math.max(e, Math.abs(areas[i] - targets[i]) / targets[i])
  return e
}

/** Sensibilité de l'aire d'une cellule à son poids : Σ frontière partagée / (2 × distance entre germes). */
function sensitivity(cells: Point[][], S: Point[], w: number[]): number[] {
  return cells.map((c, i) => {
    if (c.length < 3) return 0
    let D = 0
    for (let k = 0; k < c.length; k++) {
      const a = c[k]
      const b = c[(k + 1) % c.length]
      const m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const pi = (m[0] - S[i][0]) ** 2 + (m[1] - S[i][1]) ** 2 - w[i]
      let best = Infinity
      let bj = -1
      for (let j = 0; j < S.length; j++) {
        if (j === i) continue
        const d = Math.abs((m[0] - S[j][0]) ** 2 + (m[1] - S[j][1]) ** 2 - w[j] - pi)
        if (d < best) {
          best = d
          bj = j
        }
      }
      if (bj < 0) continue
      const dij = Math.hypot(S[bj][0] - S[i][0], S[bj][1] - S[i][1])
      if (best < 1e-3 * dij * dij + 1e-6) D += Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * dij)
    }
    return D
  })
}

/** ∫ |x − s|² sur un polygone. */
function secondMoment(p: Point[], s: Point): number {
  let sum = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const ax = p[i][0] - s[0]
    const ay = p[i][1] - s[1]
    const bx = p[(i + 1) % n][0] - s[0]
    const by = p[(i + 1) % n][1] - s[1]
    sum += (ax * by - bx * ay) * (ax * ax + ax * bx + bx * bx + ay * ay + ay * by + by * by)
  }
  return Math.abs(sum) / 12
}

/** Fonction concave (transport optimal) dont le gradient est « cible − aire » : chaque pas accepté progresse. */
function dual(cells: Point[][], S: Point[], w: number[], targets: number[]): number {
  let g = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].length >= 3) g += secondMoment(cells[i], S[i]) - w[i] * polygonArea(cells[i])
    g += w[i] * targets[i]
  }
  return g
}

function solveWeights(U: Point[], S: Point[], targets: number[], maxIt: number, tol: number) {
  // Poids nuls = Voronoï classique : chaque germe est dans sa propre cellule, aucune région vide au départ
  let w: number[] = new Array(S.length).fill(0)
  let cells = powerCells(U, S, w)
  let areas = cellAreas(cells)
  let err = maxRelativeError(areas, targets)
  let G = dual(cells, S, w, targets)
  let lam = 1
  for (let it = 0; it < maxIt && err > tol; it++) {
    const D = sensitivity(cells, S, w)
    const pos = D.filter(x => x > 0)
    const Dm = pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 1
    const step = targets.map((t, i) => (t - areas[i]) / (D[i] > 0 ? D[i] : Dm))
    let ok = false
    for (let tries = 0; tries < 30; tries++) {
      const w2 = w.map((x, i) => x + lam * step[i])
      const c2 = powerCells(U, S, w2)
      const G2 = dual(c2, S, w2, targets)
      if (G2 > G) {
        w = w2
        cells = c2
        areas = cellAreas(c2)
        G = G2
        err = maxRelativeError(areas, targets)
        lam = Math.min(1, lam * 1.5)
        ok = true
        break
      }
      lam /= 2
    }
    if (!ok) break
  }
  return { cells, err }
}

function powerRegions(U: Point[], targets: number[], rand: Rand) {
  const R = Math.sqrt(polygonArea(U) / Math.PI)
  let S: Point[] = targets.map(() => {
    const a = rand() * 2 * Math.PI
    const r = R * 0.85 * Math.sqrt(rand())
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
  // Lloyd : chaque germe va au centre de sa région, pour des régions rondes et bien réparties
  for (let round = 0; round < 6; round++) {
    const res = solveWeights(U, S, targets, 40, 1e-3)
    S = res.cells.map((c, i) => (c.length >= 3 ? polygonCentroid(c) : S[i]))
  }
  return solveWeights(U, S, targets, 200, 1e-4)
}

// ---------- Point d'entrée ----------
/**
 * Calcule le pavage sous forme de données simples (utilisable dans un Web Worker).
 * `rand` : Math.random pour un univers différent à chaque chargement,
 * ou mulberry32(seedFromIds(ids)) pour un univers stable.
 */
export function computeTileData(items: TilingItem[], rand: Rand = Math.random): TileData[] {
  const valid = items.filter(it => it.weight > 0)
  if (valid.length === 0) return []

  const U = universePolygon()
  const raw: RawTile[] = []
  let done = false

  const K = regionCount(valid.length)
  if (K > 1) {
    const groups = makeGroups(shuffle([...valid], rand), K)
    const total = valid.reduce((s, it) => s + it.weight, 0)
    const UA = polygonArea(U)
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const reg = powerRegions(U, groups.map(g => (g.w / total) * UA), rand)
      if (reg.err < REGION_TOLERANCE && reg.cells.every(c => c.length >= 3)) {
        groups.forEach((g, i) => tileGuarded(reg.cells[i], shuffle([...g.items], rand), rand, raw))
        done = true
      }
    }
  }
  // Petits univers, ou échec (rare) du calcul des régions : découpe directe avec garde-fou
  if (!done) tileGuarded(U, shuffle([...valid], rand), rand, raw)

  return raw.map(({ id, poly }) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of poly) {
      if (p[0] < x0) x0 = p[0]
      if (p[0] > x1) x1 = p[0]
      if (p[1] < y0) y0 = p[1]
      if (p[1] > y1) y1 = p[1]
    }
    const area = polygonArea(poly)
    const centroid = polygonCentroid(poly)
    const bbox: [number, number, number, number] = [x0, y0, x1, y1]
    const inscribed = inscribedCircle(poly, bbox, centroid)
    return {
      id,
      poly,
      bbox,
      centroid,
      area,
      equivRadius: Math.sqrt(area / Math.PI),
      labelCenter: inscribed.center,
      inRadius: inscribed.radius,
    }
  })
}

/** Ajoute ce qui ne peut pas traverser postMessage : Path2D et points SVG. */
export function hydrateTiles(data: TileData[]): Map<string, Tile> {
  const tiles = new Map<string, Tile>()
  const canPath = typeof Path2D !== 'undefined'
  for (const d of data) {
    const path = canPath ? new Path2D() : null
    const pts: string[] = []
    d.poly.forEach((p, i) => {
      if (path) {
        if (i === 0) path.moveTo(p[0], p[1])
        else path.lineTo(p[0], p[1])
      }
      pts.push(`${p[0].toFixed(2)},${p[1].toFixed(2)}`)
    })
    path?.closePath()
    tiles.set(d.id, { ...d, path, svgPoints: pts.join(' ') })
  }
  return tiles
}

/** Version synchrone (tests, serveur, ou navigateur sans Web Worker). */
export function buildTiling(items: TilingItem[], rand: Rand = Math.random): Map<string, Tile> {
  return hydrateTiles(computeTileData(items, rand))
}

// ---------- Tests de position ----------
export function pointInPolygon(poly: Point[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside
    }
  }
  return inside
}

export function hitTile(tiles: Iterable<Tile>, x: number, y: number): Tile | null {
  for (const t of tiles) {
    const b = t.bbox
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue
    if (pointInPolygon(t.poly, x, y)) return t
  }
  return null
}
