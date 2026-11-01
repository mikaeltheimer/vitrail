'use client'

// Le vitrail en ligne, calqué sur la rosace de Pay to Exist : ouverture en travelling arrière, lumière autour du vitrail,
// survol (ordinateur), fiche d'un morceau (panneau à droite / feuille en bas sur téléphone) avec son rang, navigation
// d'un morceau à l'autre, « au hasard », dérive au repos, derniers dons, mini-carte, partage, signalement.
// Sert après un don (/vitrail?d=…) et pour promouvoir la collecte en ligne, sans être sur place.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { HoverCard } from '@/components/vitrail/HoverCard'
import { PieceDetails } from '@/components/vitrail/PieceDetails'
import { RecentDonations } from '@/components/vitrail/RecentDonations'
import type { RankedPiece } from '@/components/vitrail/types'
import { CONFIG } from '@/lib/config'
import { ensureFonts } from '@/lib/fonts'
import { formatMoney } from '@/lib/format'
import { Ambience, glassColors, type GlassColors } from '@/lib/glass'
import { ImageCache } from '@/lib/images'
import { drawScene, pieceMap, tilePieces, UNIVERSE_RADIUS, type PieceMap } from '@/lib/render'
import { hitTile, type Tile } from '@/lib/tiling'
import type { Snapshot } from '@/lib/types'

const HEADER_H = 60
const MOBILE_BAR_H = 84 // barre « Ajouter mon morceau » en bas sur téléphone
const PANEL_W = 340 // fiche à droite sur ordinateur
const FRAME = 0.92 // part de l'espace libre occupée par le vitrail en vue d'ensemble
const MAX_ZOOM = 60 // par rapport à la vue d'ensemble
const IDLE_AFTER_MS = 25_000
const IDLE_EVERY_MS = 7_000
const INTRO_MS = 6500

type Cam = { x: number; y: number; zoom: number }
type IntroPhase = 'off' | 'running' | 'done'

interface Engine {
  tiles: Map<string, Tile>
  pieces: PieceMap
  ranked: RankedPiece[]
  byId: Map<string, RankedPiece>
  version: number
  cam: Cam
  base: number
  W: number
  H: number
  dpr: number
  mobile: boolean
  ready: boolean
  selected: string | null
  hovered: string | null
  spot: string | null
  anim: number | null
  intro: IntroPhase
  lastInput: number
  needs: boolean
  imageVersion: number
  fontsVersion: number
  recentlyMet: string[]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export default function VitrailPage() {
  return (
    <Suspense fallback={null}>
      <Vitrail />
    </Suspense>
  )
}

function Vitrail() {
  const params = useSearchParams()
  const focusParam = params.get('d')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const minimapViewRef = useRef<HTMLDivElement>(null)
  const introCountRef = useRef<HTMLDivElement>(null)
  const images = useMemo(() => new ImageCache(), [])
  const ambience = useMemo(() => new Ambience(), [])
  const wRef = useRef<Engine>({
      tiles: new Map(),
      pieces: new Map(),
      ranked: [],
      byId: new Map(),
      version: 0,
      cam: { x: 0, y: 0, zoom: 1 },
      base: 1,
      W: 0,
      H: 0,
      dpr: 1,
      mobile: false,
      ready: false,
      selected: null,
      hovered: null,
      spot: null,
      anim: null,
      intro: 'off',
      lastInput: 0,
      needs: true,
      imageVersion: 0,
      fontsVersion: 0,
      recentlyMet: [],
  })

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [ranked, setRanked] = useState<RankedPiece[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [mobile, setMobile] = useState(false)
  const [intro, setIntro] = useState<IntroPhase>('off')
  const [myId, setMyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [hint, setHint] = useState(true)
  const [toast, setToast] = useState<{ id: string; donorId: string; text: string } | null>(null)

  // Actions offertes à l'interface (définies dans le moteur ci-dessous)
  const api = useRef<{ select: (id: string | null) => void; home: () => void; step: (dir: 1 | -1) => void; meet: () => void; panTo: (x: number, y: number) => void }>({
    select: () => {},
    home: () => {},
    step: () => {},
    meet: () => {},
    panTo: () => {},
  })
  const [tilesMap, setTilesMap] = useState<Map<string, Tile>>(new Map())

  // ═════════════════════════════════ Moteur : caméra, rendu, gestes ═════════════════════════════════
  useEffect(() => {
    const w = wRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Deux couches, comme Pay to Exist : le verre (redessiné seulement quand la vue change) et la lumière (animée)
    const layer = document.createElement('canvas')
    const lctx = layer.getContext('2d')
    let margin = 0
    let layerKey = ''
    let layerCam: Cam = { x: NaN, y: NaN, zoom: NaN }
    let prevCam: Cam = { x: NaN, y: NaN, zoom: NaN }
    let lastMoveAt = 0
    let stillFrames = 0
    let lastFrame = 0
    let raf = 0
    let introRaf = 0

    // ── Géométrie de l'écran ──
    const freeArea = (withPanel: boolean) => {
      const top = HEADER_H
      const bottom = w.mobile ? (withPanel ? w.H * 0.5 : MOBILE_BAR_H) : 0
      const right = !w.mobile && withPanel ? PANEL_W : 0
      return { left: 0, top, right: w.W - right, bottom: w.H - bottom }
    }
    const homeCam = (): Cam => {
      const a = freeArea(false)
      const zoom = (Math.min(a.right - a.left, a.bottom - a.top) * FRAME) / 2 / UNIVERSE_RADIUS
      return { x: -((a.left + a.right) / 2 - w.W / 2) / zoom, y: -((a.top + a.bottom) / 2 - w.H / 2) / zoom, zoom }
    }
    const toWorld = (sx: number, sy: number) => ({ x: (sx - w.W / 2) / w.cam.zoom + w.cam.x, y: (sy - w.H / 2) / w.cam.zoom + w.cam.y })

    const resize = () => {
      const wasHome = !w.selected && Math.abs(w.cam.zoom - w.base) < 1e-9
      w.W = window.innerWidth
      w.H = window.innerHeight
      w.mobile = w.W < 760 || navigator.maxTouchPoints > 0 && w.W < 1024
      setMobile(w.mobile)
      w.dpr = Math.min(window.devicePixelRatio || 1, navigator.maxTouchPoints > 0 ? 2 : 3)
      canvas.width = Math.round(w.W * w.dpr)
      canvas.height = Math.round(w.H * w.dpr)
      margin = Math.round(Math.max(w.W, w.H) * (navigator.maxTouchPoints > 0 ? 0.3 : 0.12))
      layer.width = Math.round((w.W + margin * 2) * w.dpr)
      layer.height = Math.round((w.H + margin * 2) * w.dpr)
      layerKey = ''
      w.base = homeCam().zoom
      if (wasHome || !w.ready) w.cam = homeCam()
      w.needs = true
    }

    const clampCam = () => {
      w.cam.zoom = clamp(w.cam.zoom, w.base * 0.7, w.base * MAX_ZOOM)
      const lim = UNIVERSE_RADIUS * 1.05
      w.cam.x = clamp(w.cam.x, -lim, lim)
      w.cam.y = clamp(w.cam.y, -lim, lim)
    }

    const stopAnim = () => {
      if (w.anim) cancelAnimationFrame(w.anim)
      w.anim = null
    }

    /** Vol de caméra ; `dip` : léger recul à mi-chemin, on voit d'où l'on part et où l'on va. */
    const flyTo = (target: Cam, ms: number, dip = 0, onEnd?: () => void) => {
      stopAnim()
      const start = { ...w.cam }
      const t0 = performance.now()
      const step = (now: number) => {
        const k = reduced ? 1 : Math.min(1, (now - t0) / ms)
        const e = 0.5 - Math.cos(Math.PI * k) / 2
        const zoom = Math.exp(Math.log(start.zoom) + (Math.log(target.zoom) - Math.log(start.zoom)) * e - dip * Math.sin(Math.PI * k))
        w.cam = { x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e, zoom }
        w.needs = true
        if (k < 1) w.anim = requestAnimationFrame(step)
        else {
          w.anim = null
          onEnd?.()
        }
      }
      w.anim = requestAnimationFrame(step)
    }

    /** Cadrage d'un morceau : assez près pour lire son nom, centré dans l'espace laissé libre par la fiche. */
    const camOn = (tile: Tile, withPanel = true): Cam => {
      const a = freeArea(withPanel)
      const [x0, y0, x1, y1] = tile.bbox
      const zoom = clamp((Math.min(a.right - a.left, a.bottom - a.top) * 0.5) / Math.max(x1 - x0, y1 - y0, 1e-6), w.base, w.base * MAX_ZOOM)
      const cx = (a.left + a.right) / 2
      const cy = (a.top + a.bottom) / 2
      return { x: tile.labelCenter[0] - (cx - w.W / 2) / zoom, y: tile.labelCenter[1] - (cy - w.H / 2) / zoom, zoom }
    }

    const select = (id: string | null) => {
      endIntro(true)
      w.selected = id
      w.spot = null
      setSelected(id)
      w.needs = true
      layerKey = ''
      if (!id) return
      const tile = w.tiles.get(id)
      if (tile) flyTo(camOn(tile), 900, w.cam.zoom > w.base * 3 ? 0.35 : 0)
    }

    const home = () => {
      w.selected = null
      setSelected(null)
      layerKey = ''
      flyTo(homeCam(), 900)
    }

    // Morceau suivant / précédent dans l'ordre des montants (1 = le plus grand)
    const step = (dir: 1 | -1) => {
      const n = w.ranked.length
      if (!n) return
      const cur = w.selected ? w.byId.get(w.selected)?.rank ?? 0 : 0
      const next = cur === 0 ? (dir > 0 ? 1 : n) : ((cur - 1 + dir + n) % n) + 1
      const p = w.ranked[next - 1]
      if (p) select(p.id)
    }

    // « Au hasard » : de préférence quelqu'un avec une photo ou un message, jamais les derniers vus
    const pickSomeone = (): RankedPiece | null => {
      const real = w.ranked.filter(p => p.id !== w.selected)
      if (!real.length) return null
      const fresh = real.filter(p => !w.recentlyMet.includes(p.id))
      const pool = fresh.length ? fresh : real
      const weight = (p: RankedPiece) => 1 + (p.photoUrl ? 3 : 0) + (p.message ? 2 : 0)
      let r = Math.random() * pool.reduce((s, p) => s + weight(p), 0)
      const picked = pool.find(p => (r -= weight(p)) <= 0) ?? pool[pool.length - 1]
      w.recentlyMet = [picked.id, ...w.recentlyMet].slice(0, Math.min(12, Math.floor(real.length / 2)))
      return picked
    }
    const meet = () => {
      const p = pickSomeone()
      if (p) select(p.id)
    }

    const panTo = (x: number, y: number) => {
      endIntro(true)
      stopAnim()
      w.cam = { x, y, zoom: Math.max(w.cam.zoom, w.base * 3) }
      clampCam()
      w.lastInput = Date.now()
      w.needs = true
    }
    api.current = { select, home, step, meet, panTo }

    // ── Ouverture : travelling arrière d'un morceau moyen jusqu'au vitrail entier ──
    const endIntro = (hide: boolean) => {
      if (w.intro === 'running') {
        cancelAnimationFrame(introRaf)
        w.intro = 'done'
        setIntro('done')
      }
      if (hide && w.intro === 'done') {
        w.intro = 'off'
        setIntro('off')
      }
    }
    const startIntro = () => {
      const tiles = [...w.tiles.values()].sort((a, b) => a.area - b.area)
      if (tiles.length < 4) return false
      const target = homeCam()
      const start = tiles[Math.floor(tiles.length * (0.3 + Math.random() * 0.2))]
      const z0 = Math.min(target.zoom * MAX_ZOOM, (Math.min(w.W, w.H - HEADER_H) * 0.42) / Math.sqrt(start.area))
      const z1 = target.zoom
      const [sx, sy] = start.labelCenter
      const t0 = performance.now()
      w.intro = 'running'
      setIntro('running')
      const frame = (now: number) => {
        const k = Math.min(1, (now - t0) / INTRO_MS)
        const e = 0.5 - Math.cos(Math.PI * k) / 2
        const z = Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * e)
        // Le centre suit le recul (en échelle log) : le morceau de départ reste à l'écran
        const f = (Math.log(z0) - Math.log(z)) / (Math.log(z0) - Math.log(z1) || 1)
        w.cam = { x: sx + (target.x - sx) * f, y: sy + (target.y - sy) * f, zoom: z }
        w.needs = true
        if (introCountRef.current) {
          const hw = w.W / 2 / z
          const hh = w.H / 2 / z
          let n = 0
          for (const t of w.tiles.values()) {
            const bb = t.bbox
            if (bb[2] >= w.cam.x - hw && bb[0] <= w.cam.x + hw && bb[3] >= w.cam.y - hh && bb[1] <= w.cam.y + hh) n++
          }
          introCountRef.current.textContent = n === 1 ? '1 morceau' : `${n.toLocaleString('fr-CA')} morceaux`
        }
        if (k < 1) introRaf = requestAnimationFrame(frame)
        else endIntro(false)
      }
      w.cam = { x: sx, y: sy, zoom: z0 }
      introRaf = requestAnimationFrame(frame)
      return true
    }

    // Premier pavage reçu : caméra en place, puis ouverture (une fois par onglet, jamais sur un lien vers un morceau)
    const onFirstTiles = (focus: string | null) => {
      w.ready = true
      w.cam = homeCam()
      const sp = new URLSearchParams(window.location.search)
      let seen = false
      try {
        seen = sessionStorage.getItem('vitrail:intro') === '1'
      } catch {}
      if (focus && w.tiles.has(focus)) {
        setTimeout(() => select(focus), 300)
      } else if (!reduced && (!seen || sp.has('intro')) && startIntro()) {
        try {
          sessionStorage.setItem('vitrail:intro', '1')
        } catch {}
      }
      w.needs = true
    }
    ;(w as Engine & { onFirstTiles?: typeof onFirstTiles }).onFirstTiles = onFirstTiles

    // ── Rendu ──
    const ambientLevel = () => clamp(1 - (w.cam.zoom / w.base - 1) / 3, 0, 1)

    const drawLayer = () => {
      if (!lctx) return
      const cam = w.cam
      lctx.setTransform(1, 0, 0, 1, 0, 0)
      lctx.clearRect(0, 0, layer.width, layer.height)
      drawScene(lctx, {
        tiles: w.tiles,
        pieces: w.pieces,
        images,
        view: { scale: cam.zoom, ox: w.W / 2 + margin - cam.x * cam.zoom, oy: w.H / 2 + margin - cam.y * cam.zoom },
        dpr: w.dpr,
        width: w.W + margin * 2,
        height: w.H + margin * 2,
        focusId: w.selected,
      })
      layerCam = { ...cam }
    }

    const hexA = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`

    // Liseré du morceau choisi (qui pulse), de celui mis en lumière par la dérive, et de celui survolé
    const drawHighlights = (now: number) => {
      const z = w.cam.zoom
      ctx.setTransform(w.dpr * z, 0, 0, w.dpr * z, w.dpr * (w.W / 2 - w.cam.x * z), w.dpr * (w.H / 2 - w.cam.y * z))
      ctx.lineJoin = 'round'
      const pulse = Math.sin(now / 330) * 0.5 + 0.5
      const glow = (id: string, strong: boolean) => {
        const tile = w.tiles.get(id)
        const color = w.pieces.get(id)?.color ?? '#ffffff'
        if (!tile?.path) return
        ctx.shadowColor = color
        ctx.shadowBlur = strong ? 18 + pulse * 18 : 26
        ctx.strokeStyle = hexA(color, strong ? 0.35 + pulse * 0.3 : 0.55)
        ctx.lineWidth = 8 / z
        ctx.stroke(tile.path)
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = strong ? '#f5c451' : color
        ctx.lineWidth = 3 / z
        ctx.stroke(tile.path)
        // Morceau trop petit pour être repéré : un anneau qui pulse autour
        if (strong && tile.equivRadius * z < 14) {
          ctx.beginPath()
          ctx.arc(tile.labelCenter[0], tile.labelCenter[1], (16 + pulse * 8) / z, 0, Math.PI * 2)
          ctx.strokeStyle = hexA('#f5c451', 0.9 - pulse * 0.5)
          ctx.lineWidth = 2 / z
          ctx.stroke()
        }
      }
      if (w.hovered && w.hovered !== w.selected) {
        const tile = w.tiles.get(w.hovered)
        if (tile?.path) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)'
          ctx.fill(tile.path)
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'
          ctx.lineWidth = 2 / z
          ctx.stroke(tile.path)
        }
      }
      if (w.spot && !w.selected) glow(w.spot, false)
      if (w.selected) glow(w.selected, true)
      ctx.setTransform(w.dpr, 0, 0, w.dpr, 0, 0)
    }

    let bg: CanvasGradient | null = null
    let lastMini = ''
    const render = (now: number) => {
      const dt = Math.min(64, now - (lastFrame || now))
      lastFrame = now
      ctx.setTransform(w.dpr, 0, 0, w.dpr, 0, 0)
      if (!bg) {
        bg = ctx.createLinearGradient(0, 0, 0, w.H)
        bg.addColorStop(0, '#0a0910')
        bg.addColorStop(1, '#040306')
      }
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w.W, w.H)
      if (!w.ready || w.tiles.size === 0) return

      const cam = w.cam
      const cx = w.W / 2 - cam.x * cam.zoom
      const cy = w.H / 2 - cam.y * cam.zoom
      const r = UNIVERSE_RADIUS * cam.zoom
      const level = ambientLevel()
      ambience.drawBehind(ctx, cx, cy, r, w.W, w.H, level, now, dt, reduced)

      // Le verre n'est redessiné que si le contenu change ou une fois la caméra posée ; pendant un geste,
      // on déplace et met à l'échelle l'image déjà dessinée (c'est ce qui rend le téléphone fluide)
      const key = [w.W, w.H, w.selected ?? '', w.version, w.imageVersion, w.fontsVersion].join('|')
      if (cam.x !== prevCam.x || cam.y !== prevCam.y || cam.zoom !== prevCam.zoom) {
        lastMoveAt = now
        prevCam = { ...cam }
        stillFrames = 0
      } else stillFrames++
      const settled = stillFrames >= 3 && now - lastMoveAt > 120
      const camMatches = cam.x === layerCam.x && cam.y === layerCam.y && cam.zoom === layerCam.zoom
      const lw = w.W + margin * 2
      const lh = w.H + margin * 2
      const placement = () => {
        const k = cam.zoom / layerCam.zoom
        return { k, dx: (-margin - w.W / 2) * k + (layerCam.x - cam.x) * cam.zoom + w.W / 2, dy: (-margin - w.H / 2) * k + (layerCam.y - cam.y) * cam.zoom + w.H / 2 }
      }
      let pl = placement()
      const stale = !(pl.k <= 1.35 && pl.dx <= 0 && pl.dy <= 0 && pl.dx + lw * pl.k >= w.W && pl.dy + lh * pl.k >= w.H)
      if (key !== layerKey || (!camMatches && (settled || stale))) {
        drawLayer()
        layerKey = key
        pl = placement()
      }
      ctx.drawImage(layer, pl.dx, pl.dy, lw * pl.k, lh * pl.k)
      if (!settled) w.needs = true
      drawHighlights(now)
      ctx.globalAlpha = level
      if (level > 0.01) ambience.drawFront(ctx, cx, cy, r, now, reduced)
      ctx.globalAlpha = 1

      // Mini-carte : le cadre suit la caméra
      const mv = minimapViewRef.current
      if (mv) {
        const s = 150 / (UNIVERSE_RADIUS * 2.2)
        const vw = (w.W / cam.zoom) * s
        const vh = (w.H / cam.zoom) * s
        const k = `${Math.round(cam.x)}|${Math.round(cam.y)}|${cam.zoom.toFixed(5)}`
        if (k !== lastMini) {
          lastMini = k
          mv.style.width = `${Math.min(150, vw)}px`
          mv.style.height = `${Math.min(150, vh)}px`
          mv.style.transform = `translate(${75 + cam.x * s - Math.min(150, vw) / 2}px, ${75 + cam.y * s - Math.min(150, vh) / 2}px)`
          mv.style.opacity = cam.zoom > w.base * 1.15 ? '1' : '0'
        }
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const animated = !reduced && (ambientLevel() > 0.02 || !!w.selected || !!w.spot)
      if (animated || w.needs) {
        w.needs = false
        render(now)
      }
    }

    // ── Gestes : glisser, pincer, molette, toucher, survol ──
    const pts = new Map<number, { x: number; y: number }>()
    let moved = 0
    let lastTap = 0
    const touched = () => {
      w.lastInput = Date.now()
      if (w.spot) {
        w.spot = null
        w.needs = true
      }
      setHint(false)
    }
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const p = toWorld(sx, sy)
      w.cam.zoom = clamp(w.cam.zoom * factor, w.base * 0.7, w.base * MAX_ZOOM)
      w.cam.x = p.x - (sx - w.W / 2) / w.cam.zoom
      w.cam.y = p.y - (sy - w.H / 2) / w.cam.zoom
      clampCam()
      w.needs = true
    }
    const hit = (sx: number, sy: number) => {
      const p = toWorld(sx, sy)
      return hitTile(w.tiles.values(), p.x, p.y)
    }
    const down = (e: PointerEvent) => {
      touched()
      endIntro(true)
      stopAnim()
      canvas.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1) moved = 0
    }
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId)
      if (!p) {
        // Survol à la souris
        if (e.pointerType === 'mouse' && w.ready) {
          const t = hit(e.clientX, e.clientY)
          const id = t?.id ?? null
          if (id !== w.hovered) {
            w.hovered = id
            setHovered(id)
            canvas.style.cursor = id ? 'pointer' : 'grab'
            w.needs = true
          }
        }
        return
      }
      touched()
      if (pts.size === 1) {
        const dx = e.clientX - p.x
        const dy = e.clientY - p.y
        moved += Math.abs(dx) + Math.abs(dy)
        w.cam.x -= dx / w.cam.zoom
        w.cam.y -= dy / w.cam.zoom
        clampCam()
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const other = a === p ? b : a
        const before = Math.hypot(p.x - other.x, p.y - other.y)
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
        moved += 20
        if (before > 0) zoomAt((e.clientX + other.x) / 2, (e.clientY + other.y) / 2, after / before)
        w.cam.x -= (e.clientX - p.x) / 2 / w.cam.zoom
        w.cam.y -= (e.clientY - p.y) / 2 / w.cam.zoom
        clampCam()
      }
      p.x = e.clientX
      p.y = e.clientY
      w.needs = true
    }
    const up = (e: PointerEvent) => {
      const single = pts.size === 1
      pts.delete(e.pointerId)
      if (!single || moved > 8) return
      const now = performance.now()
      if (now - lastTap < 280) {
        zoomAt(e.clientX, e.clientY, 2.2) // double toucher : on s'approche
        lastTap = 0
        return
      }
      lastTap = now
      const t = hit(e.clientX, e.clientY)
      if (t) select(t.id)
      else if (w.selected) {
        w.selected = null
        setSelected(null)
        layerKey = ''
      }
    }
    const leave = () => {
      if (w.hovered) {
        w.hovered = null
        setHovered(null)
        w.needs = true
      }
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      touched()
      endIntro(true)
      stopAnim()
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))
    }
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      touched()
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'Escape') home()
    }

    // ── Dérive au repos : sans interaction, la caméra glisse doucement d'un morceau à l'autre ──
    let drifting = false
    let lastHop = 0
    const idle = setInterval(() => {
      const calm = !document.hidden && w.intro === 'off' && !w.selected && w.ranked.length > 2 && pts.size === 0
      if (!calm) {
        drifting = false
        return
      }
      const now = Date.now()
      if (now - w.lastInput < IDLE_AFTER_MS) {
        drifting = false
        return
      }
      if (drifting && now - lastHop < IDLE_EVERY_MS) return
      drifting = true
      lastHop = now
      const p = pickSomeone()
      const tile = p ? w.tiles.get(p.id) : null
      if (!p || !tile) return
      w.spot = null
      const [x0, y0, x1, y1] = tile.bbox
      const zoom = clamp((Math.min(w.W, w.H - HEADER_H) * 0.38) / Math.max(x1 - x0, y1 - y0, 1e-6), w.base, w.base * MAX_ZOOM)
      flyTo({ x: tile.labelCenter[0], y: tile.labelCenter[1] - (HEADER_H / 2) / zoom, zoom }, 2600, 0.55, () => {
        if (drifting) {
          w.spot = p.id
          w.needs = true
        }
      })
    }, 1000)

    resize()
    w.lastInput = Date.now()
    window.addEventListener('resize', resize)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', key)
    raf = requestAnimationFrame(loop)
    const unsub = images.subscribe(() => {
      w.imageVersion++
      w.needs = true
    })
    void ensureFonts().then(() => {
      w.fontsVersion++
      w.needs = true
    })

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(introRaf)
      stopAnim()
      clearInterval(idle)
      unsub()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
    }
  }, [images, ambience])

  // ═════════════════════════════════ Données : instantané toutes les 10 s ═════════════════════════════════
  useEffect(() => {
    const w = wRef.current
    let stop = false
    let version = ''
    let first = true
    const seen = new Set<string>()
    const load = async () => {
      try {
        const s = (await fetch('/api/vitrail', { cache: 'no-store' }).then(r => r.json())) as Snapshot
        if (stop || !s.pieces) return
        setSnap(s)
        // Nouveau don pendant la visite : une petite annonce, avec un lien vers le morceau
        const fresh = s.recent.filter(d => !seen.has(d.id))
        s.recent.forEach(d => seen.add(d.id))
        if (!first && fresh.length) {
          const d = fresh[0]
          setToast({ id: d.id, donorId: d.donorId, text: `${d.name ?? 'Quelqu’un'} vient de donner ${formatMoney(d.amountCents)}` })
        }
        if (s.version === version) return
        version = s.version
        const tiles = await tilePieces(s.pieces)
        if (stop) return
        const sorted = [...s.pieces].sort((a, b) => b.amountCents - a.amountCents || (a.id < b.id ? -1 : 1))
        const rankedList: RankedPiece[] = sorted.map((p, i) => ({ ...p, rank: i + 1 }))
        w.tiles = tiles
        w.pieces = pieceMap(s.pieces)
        w.ranked = rankedList
        w.byId = new Map(rankedList.map(p => [p.id, p]))
        w.version++
        w.needs = true
        const colorOf = (t: Tile): GlassColors => glassColors(w.pieces.get(t.id)?.color ?? '#f472b6', t.id)
        ambience.rebuild(tiles.values(), colorOf, UNIVERSE_RADIUS, (x, y) => {
          const t = hitTile(tiles.values(), x, y)
          return t ? colorOf(t) : null
        })
        setRanked(rankedList)
        setTilesMap(tiles)
        if (first) {
          first = false
          ;(w as Engine & { onFirstTiles?: (f: string | null) => void }).onFirstTiles?.(focusParam)
        }
      } catch {}
    }
    void load()
    const id = setInterval(load, 10_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [ambience, focusParam])

  // Mon morceau (retenu après un don sur ce navigateur)
  useEffect(() => {
    try {
      const me = localStorage.getItem('vitrail:me')
      if (me) Promise.resolve().then(() => setMyId(me))
    } catch {}
  }, [])

  // Annonce de nouveau don : 7 s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  // Mini-carte (ordinateur) : le vitrail en petit, redessiné à chaque nouveau pavage
  useEffect(() => {
    const w = wRef.current
    const c = minimapRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || mobile) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = c.height = 150 * dpr
    const s = (150 * dpr) / (UNIVERSE_RADIUS * 2.2)
    ctx.setTransform(s, 0, 0, s, 75 * dpr, 75 * dpr)
    ctx.clearRect(-UNIVERSE_RADIUS * 1.1, -UNIVERSE_RADIUS * 1.1, UNIVERSE_RADIUS * 2.2, UNIVERSE_RADIUS * 2.2)
    for (const t of tilesMap.values()) {
      if (!t.path) continue
      ctx.fillStyle = glassColors(w.pieces.get(t.id)?.color ?? '#f472b6', t.id).mid
      ctx.fill(t.path)
      ctx.lineWidth = 6
      ctx.strokeStyle = '#050408'
      ctx.stroke(t.path)
    }
  }, [tilesMap, mobile])

  const piece = selected ? ranked.find(p => p.id === selected) ?? null : null
  const hoveredPiece = hovered && hovered !== selected ? ranked.find(p => p.id === hovered) ?? null : null
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr-CA')
    if (q.length < 2) return []
    return ranked.filter(p => p.name && p.name.toLocaleLowerCase('fr-CA').includes(q)).slice(0, 6)
  }, [query, ranked])
  const mine = myId && ranked.some(p => p.id === myId) ? myId : null
  const tile = selected ? tilesMap.get(selected) ?? null : null
  const totalCents = snap?.totalCents ?? 0

  const pick = (id: string) => {
    setQuery('')
    setSearchOpen(false)
    api.current.select(id)
  }

  const nav = (
    <div className="flex gap-2">
      <button className="btn btn-ghost !w-14 shrink-0 !py-2.5 text-lg" onClick={() => api.current.step(-1)} aria-label="Morceau plus grand" title="Morceau plus grand (←)">
        ←
      </button>
      <button className="btn btn-ghost !py-2.5 text-sm" onClick={() => api.current.meet()}>
        Au hasard
      </button>
      <button className="btn btn-ghost !w-14 shrink-0 !py-2.5 text-lg" onClick={() => api.current.step(1)} aria-label="Morceau plus petit" title="Morceau plus petit (→)">
        →
      </button>
    </div>
  )

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: '#07060b' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none', cursor: 'grab' }} aria-label="Le vitrail de dons" />

      {/* ── En-tête ── */}
      <header
        className="absolute inset-x-0 top-0 z-[200] flex items-center gap-3 px-4"
        style={{ height: HEADER_H, background: 'rgba(7,6,11,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--line)' }}
      >
        <button className="min-w-0 text-left" onClick={() => api.current.home()} aria-label="Voir tout le vitrail">
          <div className="muted truncate text-[0.62rem] font-medium uppercase tracking-[0.2em]">{CONFIG.orgName}</div>
          <div className="truncate text-lg font-bold leading-tight">{CONFIG.appName}</div>
        </button>
        {snap && (
          <div className="muted hidden shrink-0 text-sm md:block">
            <b style={{ color: '#ffe7a0' }}>{formatMoney(totalCents)}</b> · {snap.pieces.length} morceau{snap.pieces.length > 1 ? 'x' : ''}
          </div>
        )}
        <div className="flex-1" />
        {/* Recherche */}
        <div className={`relative ${mobile && !searchOpen ? '' : 'w-44 lg:w-56'}`}>
          {mobile && !searchOpen ? (
            <button className="chip !px-3 text-sm" onClick={() => setSearchOpen(true)} aria-label="Trouver un nom">
              ⌕
            </button>
          ) : (
            <input
              autoFocus={mobile}
              className="field !py-2 text-sm"
              placeholder="Trouver un nom"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              aria-label="Trouver un nom"
            />
          )}
          {matches.length > 0 && (
            <ul className="card absolute right-0 mt-1 w-56 !p-1 text-sm" style={{ background: '#121019' }}>
              {matches.map(m => (
                <li key={m.id}>
                  <button className="flex w-full justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/10" onMouseDown={e => e.preventDefault()} onClick={() => pick(m.id)}>
                    <span className="truncate">{m.name}</span>
                    <span className="muted shrink-0">{formatMoney(m.amountCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {mine && (
          <button className="chip !px-3 text-sm" onClick={() => pick(mine)}>
            Mon morceau
          </button>
        )}
        {!mobile && (
          <>
            <button className="chip !px-3 text-sm" onClick={() => api.current.meet()}>
              Au hasard
            </button>
            <Link href="/?src=vitrail" className="btn !w-auto !py-2 px-4 text-sm">
              Ajouter mon morceau
            </Link>
          </>
        )}
      </header>

      {/* ── Ouverture ── */}
      {intro === 'running' && (
        <div className="pointer-events-none absolute inset-x-0 z-[150] text-center" style={{ bottom: mobile ? MOBILE_BAR_H + 24 : 48 }}>
          <div ref={introCountRef} className="text-3xl font-bold" style={{ color: '#ffe7a0', textShadow: '0 2px 20px #000' }} />
          <div className="muted mt-1 text-sm">Chaque don devient un morceau de verre</div>
        </div>
      )}
      {intro === 'done' && (
        <div className="absolute inset-x-0 z-[150] flex justify-center px-4" style={{ bottom: mobile ? MOBILE_BAR_H + 16 : 40 }}>
          <div className="card max-w-md text-center" style={{ background: 'rgba(14,12,22,0.92)', borderColor: 'rgba(255,231,160,0.4)' }}>
            <div className="text-[0.7rem] font-medium uppercase tracking-[0.2em]" style={{ color: '#ffe7a0' }}>
              Faites partie du vitrail
            </div>
            <div className="mt-1 text-xl font-bold">Chaque don devient un morceau de verre</div>
            <p className="muted mt-1 text-sm">Plus le don est grand, plus le morceau l&apos;est. Touchez un morceau pour voir qui l&apos;a offert.</p>
            <div className="mt-3 flex gap-2">
              <Link href="/?src=vitrail" className="btn !py-3 text-sm">
                Ajouter mon morceau
              </Link>
              <button className="btn btn-ghost !py-3 text-sm" onClick={() => setIntro('off')}>
                Explorer
              </button>
            </div>
          </div>
        </div>
      )}

      {intro === 'off' && hint && !piece && ranked.length > 0 && (
        <p className="muted pointer-events-none absolute inset-x-0 z-[100] text-center text-sm" style={{ bottom: mobile ? MOBILE_BAR_H + 70 : 24 }}>
          {mobile ? 'Glissez, pincez, touchez un morceau' : 'Glissez, zoomez à la molette, cliquez un morceau · ← → pour naviguer'}
        </p>
      )}

      {/* ── Derniers dons ── */}
      {snap && intro !== 'running' && !(mobile && piece) && (
        <div className="absolute z-[120]" style={mobile ? { left: 12, right: 12, bottom: MOBILE_BAR_H + 8 } : { left: 16, bottom: 16 }}>
          <RecentDonations recent={snap.recent} isMobile={mobile} onVisit={id => api.current.select(id)} />
        </div>
      )}

      {/* ── Mini-carte (ordinateur) ── */}
      {!mobile && ranked.length > 0 && (
        <div
          className="absolute z-[120] overflow-hidden rounded-full"
          style={{ right: piece ? PANEL_W + 16 : 16, bottom: 16, width: 150, height: 150, background: 'rgba(12,10,18,0.7)', border: '1px solid var(--line)', cursor: 'pointer' }}
          onPointerDown={e => {
            const r = e.currentTarget.getBoundingClientRect()
            const s = 150 / (UNIVERSE_RADIUS * 2.2)
            api.current.panTo((e.clientX - r.left - 75) / s, (e.clientY - r.top - 75) / s)
          }}
          aria-label="Mini-carte du vitrail"
        >
          <canvas ref={minimapRef} style={{ width: 150, height: 150, opacity: 0.85 }} />
          <div ref={minimapViewRef} className="pointer-events-none absolute left-0 top-0" style={{ border: '1.5px solid #ffe7a0', borderRadius: 3, opacity: 0 }} />
        </div>
      )}

      {/* ── Fiche du morceau : panneau à droite (ordinateur) ── */}
      {piece && !mobile && (
        <aside
          className="absolute right-0 z-[300] flex flex-col"
          style={{ top: HEADER_H, width: PANEL_W, bottom: 0, background: 'rgba(15,13,22,0.95)', backdropFilter: 'blur(24px)', borderLeft: `1px solid ${piece.color}33`, boxShadow: `0 0 40px ${piece.color}22` }}
        >
          <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--line)' }}>
            <span className="muted text-[0.7rem] uppercase tracking-[0.15em]">Morceau de verre</span>
            <button className="muted text-xl leading-none" aria-label="Fermer" onClick={() => api.current.home()}>
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <PieceDetails piece={piece} tile={tile} count={ranked.length} totalCents={totalCents} own={piece.id === mine} compact={false} />
          </div>
          <div className="border-t p-4" style={{ borderColor: 'var(--line)' }}>
            {nav}
          </div>
        </aside>
      )}

      {/* ── Fiche du morceau : feuille en bas (téléphone) ── */}
      {piece && mobile && <MobileSheet onClose={() => api.current.home()} nav={nav}>
        <PieceDetails piece={piece} tile={tile} count={ranked.length} totalCents={totalCents} own={piece.id === mine} compact />
      </MobileSheet>}

      {/* ── Barre du bas (téléphone) ── */}
      {mobile && !piece && (
        <div className="absolute inset-x-0 bottom-0 z-[200] flex gap-2 px-3 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))', background: 'linear-gradient(rgba(7,6,11,0), #07060b 40%)' }}>
          <Link href="/?src=vitrail" className="btn flex-1">
            Ajouter mon morceau
          </Link>
          <button className="btn btn-ghost !w-auto px-4 text-sm" onClick={() => api.current.meet()}>
            Au hasard
          </button>
        </div>
      )}

      {/* ── Survol (ordinateur) ── */}
      {!mobile && <HoverCard piece={hoveredPiece} />}

      {/* ── Nouveau don pendant la visite ── */}
      {toast && (
        <div className="absolute left-1/2 z-[400] -translate-x-1/2 px-3" style={{ top: HEADER_H + 12, width: 'min(92vw, 420px)' }}>
          <div className="tv-banner-in card flex items-center gap-3 !py-3" style={{ background: 'rgba(14,12,22,0.95)', borderColor: 'rgba(255,231,160,0.5)' }}>
            <span className="min-w-0 flex-1 text-sm">{toast.text}</span>
            <button
              className="chip shrink-0 !px-3 text-sm"
              onClick={() => {
                api.current.select(toast.donorId)
                setToast(null)
              }}
            >
              Voir
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

/** Feuille du bas sur téléphone : glisser vers le bas pour fermer. */
function MobileSheet({ children, nav, onClose }: { children: React.ReactNode; nav: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)
  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-[300] flex flex-col rounded-t-3xl"
      style={{ maxHeight: '52vh', background: 'rgba(15,13,22,0.97)', backdropFilter: 'blur(24px)', borderTop: '1px solid var(--line)', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', paddingBottom: 'env(safe-area-inset-bottom)', transition: 'transform 0.2s' }}
    >
      <div
        className="flex shrink-0 justify-center py-3"
        style={{ touchAction: 'none' }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, dy: 0 }
          if (ref.current) ref.current.style.transition = 'none'
        }}
        onPointerMove={e => {
          if (!drag.current || !ref.current) return
          drag.current.dy = Math.max(0, e.clientY - drag.current.y)
          ref.current.style.transform = `translateY(${drag.current.dy}px)`
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (!ref.current) return
          ref.current.style.transition = 'transform 0.2s'
          if (d && d.dy > 80) onClose()
          else ref.current.style.transform = 'none'
        }}
      >
        <span className="h-1.5 w-10 rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-3">{children}</div>
      <div className="shrink-0 px-4 pb-3">{nav}</div>
    </div>
  )
}
