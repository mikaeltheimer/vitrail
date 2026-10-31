'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import { Ambience, glassColors, type GlassColors } from '@/lib/glass'
import { hitTile, type Tile } from '@/lib/tiling'
import { ensureFonts } from '@/lib/fonts'
import { ImageCache } from '@/lib/images'
import { drawScene, layoutRows, pieceMap, tilePieces, UNIVERSE_RADIUS, type LabelRow, type PieceMap } from '@/lib/render'
import type { Snapshot } from '@/lib/types'

// Écran d'affichage plein écran : le vitrail, le total, le QR code, et une animation à chaque nouveau don.
// Il interroge /api/vitrail toutes les 3 s (plus fiable qu'une connexion ouverte sur un Wi-Fi d'événement),
// garde le dernier état en mémoire locale, et se resynchronise tout seul après une coupure.
// Adresse de don dans le QR : ?url=https://… dans l'adresse de cette page, sinon NEXT_PUBLIC_SITE_URL, sinon l'origine.

const CACHE_KEY = 'vitrail:last-snapshot'
const FADE_MS = 1400
const RELOAD_MS = 6 * 60 * 60 * 1000

interface Banner {
  id: string
  photoUrl: string | null
  title: string
  message: string | null
  amount: string
  caption?: string
  /** Les mêmes mots, découpés pour être écrits sur le morceau agrandi. */
  rows: LabelRow[]
  leaving: boolean
}

/** Ce qu'on sait d'un don tout neuf (pour l'annonce « vient de donner »). */
interface News {
  rows: LabelRow[]
  title: string
  message: string | null
  amount: string
  photoUrl: string | null
}

interface World {
  tiles: Map<string, Tile>
  pieces: PieceMap
  images: ImageCache
  layer: HTMLCanvasElement | null
  prevLayer: HTMLCanvasElement | null
  fadeStart: number
  /** Visite de l'écran : un morceau est toujours en brillance. */
  dir: { phase: 'mark' | 'lift' | 'hold' | 'drop' | 'cta'; t0: number; id: string | null }
  sinceCta: number
  dimK: number
  amounts: Map<string, number>
  /** Annonce fusionnée avec le morceau sorti : le texte est écrit sur le verre (sinon, l'encart habituel). */
  cardRows: LabelRow[] | null
  cardMerged: boolean
  /** Agrandissement retenu pour le morceau en cours (1 = il ne sort pas). */
  liftS: number
  news: Map<string, News>
  lit: { id: string; start: number } | null
  litPrev: { id: string; end: number } | null
  priority: string[] // nouveaux dons : passent avant le tirage au hasard
  deck: string[]
  last: string | null
  ambience: Ambience
  W: number
  H: number
  dpr: number
  R: number
  cx: number
  cy: number
}

function buildLayer(w: World): HTMLCanvasElement {
  const size = Math.max(2, Math.ceil(w.R * 2 * w.dpr))
  const layer = document.createElement('canvas')
  layer.width = layer.height = size
  const ctx = layer.getContext('2d')
  if (!ctx) return layer
  // La couche couvre le disque du vitrail : le centre du monde est au milieu de la couche
  drawScene(ctx, {
    tiles: w.tiles,
    pieces: w.pieces,
    images: w.images,
    view: { scale: w.R / UNIVERSE_RADIUS, ox: w.R, oy: w.R },
    dpr: w.dpr,
    width: w.R * 2,
    height: w.R * 2,
    uiScale: w.R / 475, // les seuils et les polices sont réglés pour un vitrail de 475 px de rayon (écran 1080p)
  })
  return layer
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/**
 * Agrandissement d'un petit morceau quand il « sort » du vitrail : son cercle utile occupe environ 30 % de la hauteur de l'écran,
 * sans jamais dépasser l'écran. 1 = déjà assez grand, il reste en place.
 */
function liftFor(w: World, tile: Tile, merged: boolean): number {
  const base = w.R / UNIVERSE_RADIUS
  const need = (CONFIG.tourTargetFraction * w.H) / Math.max(1e-6, tile.inRadius * base)
  const [x0, y0, x1, y1] = tile.bbox
  // Texte sur le morceau : il peut occuper presque toute la hauteur ; avec l'encart en bas, on lui laisse moins de place
  const fit = Math.min((0.9 * w.W) / Math.max(1e-6, (x1 - x0) * base), ((merged ? 0.88 : 0.6) * w.H) / Math.max(1e-6, (y1 - y0) * base))
  const s = Math.min(CONFIG.tourMaxLift, need, fit)
  return s < 1.15 ? 1 : s
}

/** Choisit le prochain morceau en brillance : un nouveau don d'abord, sinon un tirage au hasard sans répétition. */
function pickNext(w: World, now: number) {
  // Tous les `ctaEvery` morceaux : pause « Faites partie du vitrail » (les nouveaux dons passent avant)
  if (CONFIG.ctaEvery > 0 && w.sinceCta >= CONFIG.ctaEvery && w.dir.id && w.dir.phase !== 'cta' && w.priority.length === 0) {
    w.sinceCta = 0
    w.dir = { phase: 'cta', t0: now, id: w.dir.id }
    return
  }
  let id: string | undefined
  while (w.priority.length) {
    const c = w.priority.shift()
    if (c && w.tiles.has(c)) {
      id = c
      break
    }
  }
  if (!id) {
    w.deck = w.deck.filter(i => w.tiles.has(i))
    if (w.deck.length === 0) {
      const ids = [...w.tiles.keys()]
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
      }
      // Le dernier montré ne revient pas en premier
      if (ids.length > 1 && ids[ids.length - 1] === w.last) [ids[0], ids[ids.length - 1]] = [ids[ids.length - 1], ids[0]]
      w.deck = ids
    }
    id = w.deck.pop()
  }
  if (!id) return
  w.sinceCta++
  w.litPrev = w.lit ? { id: w.lit.id, end: now } : null
  w.lit = { id, start: now }
  w.last = id
  w.dir = { phase: 'mark', t0: now, id }
}

/**
 * Fait avancer la visite : repère (le morceau pulse en place) → sortie du vitrail + annonce → pause → retour → suivant.
 * Renvoie le degré de sortie (0 = en place, 1 = sorti et agrandi).
 */
function stepDirector(w: World, now: number): number {
  if (w.tiles.size === 0) {
    w.dir.id = null
    return 0
  }
  if (!w.dir.id || !w.tiles.has(w.dir.id)) {
    pickNext(w, now)
    if (!w.dir.id) return 0
  }
  if (w.dir.phase === 'cta') {
    if (now - w.dir.t0 >= CONFIG.ctaMs) pickNext(w, now)
    return 0
  }
  const dir = w.dir
  const id = dir.id as string
  const tile = w.tiles.get(id)
  if (!tile) return 0
  const el = now - dir.t0
  // Avant la sortie, on ne sait pas encore si le texte tiendra sur le morceau : on teste avec l'agrandissement le plus généreux
  const lifts = dir.phase === 'mark' ? liftFor(w, tile, true) > 1 : w.liftS > 1
  switch (dir.phase) {
    case 'mark':
      if (el >= CONFIG.tourMarkMs) {
        dir.phase = 'lift'
        dir.t0 = now
      }
      return 0
    case 'lift': {
      const k = Math.min(1, el / CONFIG.tourLiftMs)
      if (k >= 1) {
        dir.phase = 'hold'
        dir.t0 = now
      }
      return lifts ? ease(k) : 0
    }
    case 'hold': {
      const piece = w.pieces.get(id)
      const hold = piece?.name || piece?.photoUrl ? CONFIG.tourHoldMs : CONFIG.tourHoldBareMs
      if (el >= hold || (w.priority.length > 0 && el > 1500)) {
        dir.phase = 'drop'
        dir.t0 = now
      }
      return lifts ? 1 : 0
    }
    case 'drop': {
      const k = Math.min(1, el / CONFIG.tourLiftMs)
      if (k >= 1) {
        pickNext(w, now)
        return 0
      }
      return lifts ? 1 - ease(k) : 0
    }
    default:
      return 0
  }
}

/** Les lignes de l'annonce : « Merci à / Nom / montant / au total / message », ou « Nom / vient de donner / montant / message ». */
function rowsFor(lead: string | null, name: string, verb: string | null, amount: string, caption: string | null, message: string | null): LabelRow[] {
  const rows: LabelRow[] = []
  if (lead) rows.push({ text: lead, kind: 'small' })
  rows.push({ text: name, kind: 'name' })
  if (verb) rows.push({ text: verb, kind: 'small' })
  rows.push({ text: amount, kind: 'amount' })
  if (caption) rows.push({ text: caption, kind: 'small' })
  if (message) rows.push({ text: message, kind: 'message' })
  return rows
}

/** Annonce d'un morceau : « vient de donner » pour un don tout neuf, « Merci à … » sinon. */
function cardFor(w: World, id: string): Banner {
  const news = w.news.get(id)
  if (news) {
    w.news.delete(id)
    return { id: `${id}-${Date.now()}`, ...news, leaving: false }
  }
  const piece = w.pieces.get(id)
  const amount = formatMoney(w.amounts.get(id) ?? 0)
  const message = CONFIG.showMessagesOnScreen ? piece?.message ?? null : null
  return {
    id: `${id}-${Date.now()}`,
    photoUrl: piece?.photoUrl ?? null,
    title: piece?.name ? `Merci à ${piece.name}` : 'Merci à un donateur anonyme',
    message,
    amount,
    caption: 'au total',
    rows: rowsFor('Merci à', piece?.name ?? 'un donateur anonyme', null, amount, 'au total', message),
    leaving: false,
  }
}

/** Le nombre « roule » jusqu'à sa nouvelle valeur. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    const from = current.current
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 1500)
      const eased = 1 - Math.pow(1 - k, 3)
      current.current = Math.round(from + (target - from) * eased)
      setValue(current.current)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

export default function EcranPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const world = useMemo<World>(
    () => ({
      tiles: new Map(),
      pieces: new Map(),
      images: new ImageCache(),
      layer: null,
      prevLayer: null,
      fadeStart: 0,
      dir: { phase: 'mark', t0: 0, id: null },
      sinceCta: 0,
      dimK: 0,
      amounts: new Map(),
      cardRows: null,
      cardMerged: false,
      liftS: 1,
      news: new Map(),
      lit: null,
      litPrev: null,
      priority: [],
      deck: [],
      last: null,
      ambience: new Ambience(),
      W: 0,
      H: 0,
      dpr: 1,
      R: 0,
      cx: 0,
      cy: 0,
    }),
    [],
  )

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [online, setOnline] = useState(true)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [ctaOn, setCtaOn] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [idle, setIdle] = useState(false)
  const [hint, setHint] = useState(true)

  const seen = useRef(new Set<string>())
  const prevAmounts = useRef(new Map<string, number>())
  const version = useRef('')
  const first = useRef(true)
  const busy = useRef(false)
  const queued = useRef<Snapshot | null>(null)
  const rootRef = useRef<HTMLElement>(null)

  const totalShown = useCountUp(snap?.totalCents ?? 0)
  const eventShown = useCountUp(snap?.event?.totalCents ?? 0)

  // ── Mise en page du canvas ──
  const layout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    Object.assign(world, { W, H, dpr, R: Math.min(H * 0.44, W * 0.34), cx: W / 2, cy: H / 2 })
    world.layer = buildLayer(world)
    world.prevLayer = null
  }, [world])

  // ── Applique un instantané : pavage, animations, annonces ──
  const apply = useCallback(
    async (s: Snapshot) => {
      if (busy.current) {
        queued.current = s
        return
      }
      busy.current = true
      try {
        const isFirst = first.current
        const lit: string[] = []
        if (!isFirst) {
          for (const p of s.pieces) {
            const before = prevAmounts.current.get(p.id)
            if (before === undefined || p.amountCents > before) lit.push(p.id)
          }
          for (const d of [...s.recent].reverse()) {
            if (seen.current.has(d.id)) continue
            const message = CONFIG.showMessagesOnScreen ? d.message : null
            const amount = formatMoney(d.amountCents)
            world.news.set(d.donorId, {
              photoUrl: d.photoUrl,
              title: d.name ? `${d.name} vient de donner` : 'Un don anonyme',
              message,
              amount,
              rows: d.name ? rowsFor(null, d.name, 'vient de donner', amount, null, message) : rowsFor(null, 'Un don anonyme', null, amount, null, message),
            })
          }
        }
        for (const d of s.recent) seen.current.add(d.id)
        prevAmounts.current = new Map(s.pieces.map(p => [p.id, p.amountCents]))
        world.amounts = prevAmounts.current
        setSnap(s)

        if (s.version !== version.current) {
          const tiles = await tilePieces(s.pieces)
          world.prevLayer = isFirst ? null : world.layer
          world.tiles = tiles
          world.pieces = pieceMap(s.pieces, CONFIG.showMessagesOnScreen)
          world.layer = buildLayer(world)
          world.fadeStart = performance.now()
          const colorOf = (t: Tile): GlassColors => glassColors(world.pieces.get(t.id)?.color ?? '#f472b6', t.id)
          world.ambience.rebuild(tiles.values(), colorOf, UNIVERSE_RADIUS, (x, y) => {
            const t = hitTile(tiles.values(), x, y)
            return t ? colorOf(t) : null
          })
          version.current = s.version
        }
        for (const id of lit) if (!world.priority.includes(id)) world.priority.push(id)
        first.current = false
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(s))
        } catch {}
      } finally {
        busy.current = false
        const next = queued.current
        queued.current = null
        if (next) void apply(next)
      }
    },
    [world],
  )

  // ── Interrogation du serveur, avec reprise automatique ──
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let failures = 0

    layout()
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) void apply(JSON.parse(cached) as Snapshot)
    } catch {}

    const tick = async () => {
      try {
        const res = await fetch('/api/vitrail', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const s = (await res.json()) as Snapshot
        failures = 0
        if (!stopped) {
          setOnline(true)
          await apply(s)
        }
      } catch {
        failures++
        if (!stopped) setOnline(false)
      }
      if (!stopped) timer = setTimeout(tick, failures ? Math.min(30_000, CONFIG.pollMs * 2 ** failures) : CONFIG.pollMs)
    }
    void tick()

    const onResize = () => layout()
    window.addEventListener('resize', onResize)
    // Relance au retour du réseau, sans attendre le prochain tour
    const onOnline = () => {
      clearTimeout(timer)
      failures = 0
      void tick()
    }
    window.addEventListener('online', onOnline)
    // Rechargement périodique : une page ouverte des jours finit par accumuler de la mémoire
    const reload = setTimeout(() => window.location.reload(), RELOAD_MS)

    return () => {
      stopped = true
      clearTimeout(timer)
      clearTimeout(reload)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('online', onOnline)
    }
  }, [apply, layout])

  // ── Polices chargées : on redessine le verre avec les vraies polices ──
  useEffect(() => {
    let stopped = false
    void ensureFonts().then(() => {
      if (!stopped && world.R > 0) world.layer = buildLayer(world)
    })
    return () => {
      stopped = true
    }
  }, [world])

  // ── Une photo vient d'arriver : on redessine le verre (regroupé, sans fondu) ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = world.images.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (world.R > 0) world.layer = buildLayer(world)
      }, 250)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [world])

  // ── Boucle de dessin ──
  useEffect(() => {
    let raf = 0
    let lastZoomStr = ''
    let lastPhaseKey = ''
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx || world.R <= 0) return
      const dt = Math.min(64, now - last)
      last = now
      const { W, H, dpr, R, cx, cy } = world
      const base = R / UNIVERSE_RADIUS
      const e = stepDirector(world, now)
      const focusTile = world.dir.id ? world.tiles.get(world.dir.id) : undefined

      // Annonce : apparaît quand le morceau sort du vitrail, repart quand il y retourne
      const phaseKey = `${world.dir.id}:${world.dir.phase}`
      if (phaseKey !== lastPhaseKey) {
        lastPhaseKey = phaseKey
        const id = world.dir.id
        setCtaOn(world.dir.phase === 'cta')
        if (id && world.dir.phase === 'lift') {
          const card = cardFor(world, id)
          const tile = world.tiles.get(id)
          // Fusion : si le texte entier tient sur le morceau agrandi, il y est écrit ; sinon l'encart habituel reste affiché
          const S = tile ? liftFor(world, tile, true) : 1
          world.cardRows = card.rows
          world.cardMerged = !!tile && S > 1 && layoutRows(ctx, card.rows, !!card.photoUrl, tile.inRadius * base * S, R / 475, true) !== null
          world.liftS = tile ? (world.cardMerged ? S : liftFor(world, tile, false)) : 1
          setBanner(world.cardMerged ? null : card)
        }
        else if (world.dir.phase === 'drop') setBanner(b => (b ? { ...b, leaving: true } : b))
        else if (world.dir.phase === 'mark') setBanner(null)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1
      ctx.fillStyle = '#07060b'
      ctx.fillRect(0, 0, W, H)
      world.ambience.drawBehind(ctx, cx, cy, R, W, H, 1, now, dt, false)

      const f = Math.min(1, (now - world.fadeStart) / FADE_MS)
      if (world.prevLayer && f < 1) ctx.drawImage(world.prevLayer, cx - R, cy - R, R * 2, R * 2)
      else world.prevLayer = null
      if (world.layer) {
        ctx.globalAlpha = world.prevLayer ? f : 1
        ctx.drawImage(world.layer, cx - R, cy - R, R * 2, R * 2)
        ctx.globalAlpha = 1
      }

      // Le don en brillance (toujours un), et le précédent qui s'éteint
      const glow = (id: string, strength: number) => {
        const tile = world.tiles.get(id)
        if (!tile?.path || strength <= 0) return
        const pulse = 0.5 + 0.5 * Math.sin(now / 260)
        ctx.setTransform(dpr * base, 0, 0, dpr * base, dpr * cx, dpr * cy)
        ctx.lineJoin = 'round'
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = `rgba(255,240,200,${0.3 * pulse * strength})`
        ctx.fill(tile.path)
        ctx.globalCompositeOperation = 'source-over'
        ctx.lineWidth = (3 + 3 * pulse) / base
        ctx.strokeStyle = `rgba(245,196,81,${0.95 * strength})`
        ctx.stroke(tile.path)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      if (world.litPrev) {
        const k = 1 - (now - world.litPrev.end) / 800
        if (k <= 0) world.litPrev = null
        else glow(world.litPrev.id, k)
      }
      if (world.lit) glow(world.lit.id, Math.min(1, (now - world.lit.start) / 500) * (1 - e))

      world.ambience.drawFront(ctx, cx, cy, R, now, false)

      // Pause « Faites partie du vitrail » : le vitrail s'assombrit doucement
      world.dimK += ((world.dir.phase === 'cta' ? 1 : 0) - world.dimK) * Math.min(1, dt / 260)
      if (world.dimK > 0.01) {
        ctx.fillStyle = `rgba(5,4,8,${0.6 * world.dimK})`
        ctx.fillRect(0, 0, W, H)
      }

      // Le morceau « sort » du vitrail : il s'agrandit au-dessus, avec une ombre, pendant que le reste s'assombrit
      if (e > 0.001 && focusTile?.path) {
        const S = world.liftS
        const [lx, ly] = focusTile.labelCenter
        const sx0 = cx + lx * base
        const sy0 = cy + ly * base
        // Position d'arrivée : le morceau vient au centre de l'écran (sa partie la plus spacieuse, là où est le texte), sans sortir de l'écran ;
        // avec l'encart de repli, on garde le bas libre pour lui
        const end = base * S
        const [bx0, by0, bx1, by1] = focusTile.bbox
        const left = (bx0 - lx) * end
        const right = (bx1 - lx) * end
        const top = (by0 - ly) * end
        const bottom = (by1 - ly) * end
        const m = Math.min(W, H) * 0.04
        const yMax = world.cardMerged ? H - m : H * 0.66
        const ex = right - left <= W - 2 * m ? Math.min(W - m - right, Math.max(m - left, cx)) : W / 2 - (left + right) / 2
        const ey = bottom - top <= yMax - m ? Math.min(yMax - bottom, Math.max(m - top, world.cardMerged ? cy : cy - H * 0.08)) : (m + yMax) / 2 - (top + bottom) / 2
        const sc = base * Math.pow(S, e)
        const px = lerp(sx0, ex, e)
        const py = lerp(sy0, ey, e)
        const ox = px - lx * sc
        const oy = py - ly * sc

        // La place laissée vide, puis le reste du vitrail assombri
        ctx.setTransform(dpr * base, 0, 0, dpr * base, dpr * cx, dpr * cy)
        ctx.fillStyle = `rgba(5,4,8,${0.8 * e})`
        ctx.fill(focusTile.path)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = `rgba(5,4,8,${0.55 * e})`
        ctx.fillRect(0, 0, W, H)

        // Ombre portée du morceau soulevé
        ctx.save()
        ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy)
        ctx.shadowColor = 'rgba(0,0,0,0.75)'
        ctx.shadowBlur = 46 * dpr * e
        ctx.shadowOffsetY = 14 * dpr * e
        ctx.fillStyle = '#000'
        ctx.fill(focusTile.path)
        ctx.restore()

        // Le morceau lui-même : verre, photo et — une fois en place — l'annonce écrite dessus
        const piece = world.pieces.get(focusTile.id)
        const lifted: PieceMap = new Map([[focusTile.id, { color: piece?.color ?? '#f472b6', name: null, message: null, photoUrl: piece?.photoUrl ?? null, rows: world.cardMerged ? world.cardRows ?? undefined : undefined }]])
        drawScene(ctx, { tiles: new Map([[focusTile.id, focusTile]]), pieces: lifted, images: world.images, view: { scale: sc, ox, oy }, dpr, width: W, height: H, uiScale: R / 475, labelAlpha: Math.min(1, Math.max(0, (e - 0.92) / 0.08)) })
        ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy)
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4 / sc
        ctx.strokeStyle = `rgba(245,196,81,${e})`
        ctx.stroke(focusTile.path)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      // Panneaux d'information : en retrait pendant le zoom
      const zoomStr = e.toFixed(2)
      if (zoomStr !== lastZoomStr) {
        lastZoomStr = zoomStr
        rootRef.current?.style.setProperty('--zoom', zoomStr)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [world])

  // ── QR code ──
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get('url') || process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#0b0a10', light: '#ffffff' } })
      .then(dataUrl => {
        setQr(dataUrl)
        setTarget(url.replace(/^https?:\/\//, '').replace(/\/$/, ''))
      })
      .catch(() => setQr(null))
  }, [])

  // ── Écran allumé, plein écran, curseur caché ──
  useEffect(() => {
    type Lock = { release: () => Promise<void> }
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock
    let lock: Lock | null = null
    const request = async () => {
      try {
        lock = (await wl?.request('screen')) ?? null
      } catch {}
    }
    void request()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisible)

    let idleTimer: ReturnType<typeof setTimeout>
    const onMove = () => {
      setIdle(false)
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => setIdle(true), 3000)
    }
    onMove()
    window.addEventListener('mousemove', onMove)
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
      clearTimeout(idleTimer)
      void lock?.release().catch(() => {})
    }
  }, [])

  function toggleFullscreen() {
    setHint(false)
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  const event = snap?.event ?? null
  const goalPct = event && event.goalCents > 0 ? Math.min(1, eventShown / event.goalCents) : 0
  const empty = snap !== null && snap.pieces.length === 0

  return (
    <main ref={rootRef} className={`tv fixed inset-0 overflow-hidden ${idle ? 'tv-hide-cursor' : ''}`} onClick={toggleFullscreen}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* En-tête */}
      <div className="tv-panel absolute" style={{ left: '2.5em', top: '2em', maxWidth: '24em' }}>
        <div className="muted tv-kicker" style={{ fontSize: '1em' }}>
          {CONFIG.orgName}
        </div>
        <div className="tv-display" style={{ fontSize: '3.1em', fontWeight: 600, lineHeight: 1.04, marginTop: '0.2em' }}>{CONFIG.appName}</div>
        {event && (
          <div className="muted" style={{ fontSize: '1.4em', marginTop: '0.5em' }}>
            {event.name}
          </div>
        )}
      </div>

      {/* Totaux */}
      <div className="tv-panel absolute" style={{ left: '2.5em', bottom: '2.5em', width: '21em' }}>
        <div className="muted" style={{ fontSize: '1.1em' }}>
          Total amassé
        </div>
        <div className="tv-display" style={{ fontSize: '4.2em', fontWeight: 700, lineHeight: 1.05, fontVariantNumeric: 'lining-nums tabular-nums' }}>{formatMoney(totalShown)}</div>
        <div className="muted" style={{ fontSize: '1.1em', marginTop: '0.3em' }}>
          {snap ? `${snap.pieces.length} morceau${snap.pieces.length > 1 ? 'x' : ''} de verre` : ''}
        </div>
        {event && event.goalCents > 0 && (
          <div style={{ marginTop: '1.4em' }}>
            <div style={{ fontSize: '1.15em' }}>
              {formatMoney(eventShown)} <span className="muted">sur {formatMoney(event.goalCents)}</span>
            </div>
            <div style={{ height: '0.7em', borderRadius: '1em', background: 'rgba(255,255,255,0.12)', marginTop: '0.5em', overflow: 'hidden' }}>
              <div style={{ width: `${goalPct * 100}%`, height: '100%', background: 'linear-gradient(90deg,#f472b6,#facc15)', transition: 'width 1.5s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* QR code en incrustation */}
      <div
        className={`tv-panel absolute text-center ${ctaOn ? 'tv-qr-pulse' : ''}`}
        style={{ right: '2.5em', bottom: '2.5em', width: '15em', background: '#fff', color: '#0b0a10', borderRadius: '1.2em', padding: '1em' }}
      >
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code pour donner" style={{ width: '100%', display: 'block' }} />
        ) : (
          <div style={{ aspectRatio: '1', background: '#eee' }} />
        )}
        <div style={{ fontWeight: 700, fontSize: '1.15em', marginTop: '0.5em', lineHeight: 1.2 }}>Scannez pour donner</div>
        <div style={{ fontSize: '0.8em', opacity: 0.65, marginTop: '0.25em', wordBreak: 'break-all' }}>{target}</div>
      </div>


      {/* Appel à donner : « Faites partie du vitrail », avec une petite démonstration de la taille des morceaux */}
      {ctaOn && (
        <div className="absolute" style={{ left: '50%', top: '47%', transform: 'translate(-50%,-50%)', width: '36em' }}>
          <div
            className="tv-cta-card text-center"
            style={{
              ['--cta-ms' as string]: `${CONFIG.ctaMs}ms`,
              padding: '1.8em 2em 1.6em',
              borderRadius: '1.4em',
              background: 'rgba(14,12,22,0.93)',
              border: '1px solid rgba(255,231,160,0.55)',
              boxShadow: '0 0 4em rgba(255,231,160,0.18)',
            }}
          >
            <div className="tv-kicker" style={{ fontSize: '0.95em', color: '#ffe7a0' }}>
              Faites partie du vitrail
            </div>
            <div className="tv-display" style={{ fontSize: '2.2em', fontWeight: 700, lineHeight: 1.1, marginTop: '0.35em' }}>
              Chaque don devient un morceau de verre
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '1.4em', margin: '1.4em 0 0.9em' }}>
              {[
                { dollars: 10, color: 'linear-gradient(135deg,#60a5fa,#2563eb)' },
                { dollars: 25, color: 'linear-gradient(135deg,#f472b6,#c026d3)' },
                { dollars: 100, color: 'linear-gradient(135deg,#facc15,#f97316)' },
              ].map(d => (
                <div key={d.dollars} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      // l'aire suit le don : le côté suit sa racine (à l'exposant de taille près)
                      width: `${1.25 * Math.pow(d.dollars / 10, CONFIG.sizeExponent / 2) * 1.6}em`,
                      height: `${1.25 * Math.pow(d.dollars / 10, CONFIG.sizeExponent / 2) * 1.6}em`,
                      background: d.color,
                      border: '0.18em solid #050408',
                      boxShadow: 'inset 0 0 1em rgba(255,255,255,0.35)',
                      margin: '0 auto',
                    }}
                  />
                  <div className="tv-display" style={{ fontSize: '1.2em', fontWeight: 700, marginTop: '0.4em' }}>
                    {d.dollars} $
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '1.2em', lineHeight: 1.35, opacity: 0.88 }}>
              Plus votre don est grand, plus votre morceau l&apos;est : 100 $ occupent {Math.round(Math.pow(10, CONFIG.sizeExponent))} fois plus de place que 10 $.
            </div>
            <div className="tv-display" style={{ fontSize: '1.45em', fontWeight: 600, marginTop: '0.9em', color: '#ffe7a0' }}>
              Dès {formatMoney(CONFIG.minAmountCents)} · scannez le code ↘
            </div>
          </div>
        </div>
      )}

      {/* Vitrail vide */}
      {empty && (
        <div className="absolute text-center" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '22em' }}>
          <div className="tv-display" style={{ fontSize: '1.9em', fontWeight: 600 }}>Le vitrail attend sa première pièce</div>
          <div className="muted" style={{ fontSize: '1.2em', marginTop: '0.5em' }}>
            Scannez le code pour donner et voir votre morceau de verre apparaître.
          </div>
        </div>
      )}

      {/* Annonce d'un nouveau don */}
      {banner && (
        <div
          key={banner.id}
          className={`absolute text-center ${banner.leaving ? 'tv-banner-out' : 'tv-banner-in'}`}
          style={{
            left: '50%',
            bottom: '2.2em',
            transform: 'translateX(-50%)',
            minWidth: '22em',
            maxWidth: '34em',
            padding: '1em 1.6em',
            borderRadius: '1.2em',
            background: 'rgba(16,14,23,0.92)',
            border: '1px solid rgba(245,196,81,0.6)',
            boxShadow: '0 0 3em rgba(245,196,81,0.25)',
          }}
        >
          {banner.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.photoUrl}
              alt=""
              style={{ width: '5.5em', height: '5.5em', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.6em', display: 'block', border: '0.15em solid #f5c451' }}
            />
          )}
          <div className="tv-display" style={{ fontSize: '1.3em', fontWeight: 600 }}>{banner.title}</div>
          <div className="tv-display" style={{ fontSize: '2.6em', fontWeight: 700, color: '#ffe7a0', lineHeight: 1.1 }}>{banner.amount}</div>
          {banner.caption && <div className="muted" style={{ fontSize: '0.95em' }}>{banner.caption}</div>}
          {banner.message && <div className="tv-display" style={{ fontSize: '1.15em', marginTop: '0.3em', opacity: 0.85 }}>« {banner.message} »</div>}
        </div>
      )}

      {/* État */}
      <div className="absolute text-right" style={{ right: '2.5em', top: '2em', fontSize: '0.95em' }}>
        {snap?.mode === 'demo' && (
          <div style={{ background: '#f5c451', color: '#1b1405', fontWeight: 700, padding: '0.3em 0.8em', borderRadius: '0.6em', display: 'inline-block' }}>
            MODE DÉMO — aucun paiement réel
          </div>
        )}
        {!online && (
          <div className="muted" style={{ marginTop: '0.5em' }}>
            Connexion perdue — dernier état affiché, reprise automatique
          </div>
        )}
        {hint && online && snap?.mode !== 'demo' && (
          <div className="muted" style={{ opacity: 0.5 }}>
            Cliquez pour le plein écran
          </div>
        )}
      </div>
    </main>
  )
}
