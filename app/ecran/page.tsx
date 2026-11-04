'use client'

// Écran de projection : la rosace du vitrail en ligne, en visite automatique.
// La caméra va d'un morceau à l'autre (au hasard, sans répétition avant que tous soient passés), le met en lumière,
// et une carte montre son contenu : photo, nom, message. Jamais de montant : la taille du verre en dit assez.
// Un nouveau don passe en premier ; toutes les quelques visites, retour au vitrail entier avec un appel à donner.
// Robuste pour un événement : dernier état gardé en mémoire, reprise après coupure, écran toujours allumé,
// rechargement périodique, plein écran au clic ou avec F, curseur caché.

import { browserOrigin } from '@/lib/env'
import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { PiecePortrait } from '@/components/vitrail/PiecePortrait'
import { ANON_LABEL, CONFIG } from '@/lib/config'
import { ensureFonts } from '@/lib/fonts'
import { formatMoney } from '@/lib/format'
import { Ambience, glassColors, type GlassColors } from '@/lib/glass'
import { ImageCache } from '@/lib/images'
import { drawScene, pieceMap, tilePieces, UNIVERSE_RADIUS, type PieceMap } from '@/lib/render'
import { hitTile, type Tile } from '@/lib/tiling'
import type { Piece, Snapshot } from '@/lib/types'
import ScaleBadge from '@/components/ScaleBadge'

const CACHE_KEY = 'vitrail:last-snapshot'
const RELOAD_MS = 6 * 60 * 60 * 1000
const FLY_MS = 2800
const HOLD_MS = 8000 // morceau avec nom, photo ou message
const HOLD_BARE_MS = 4500 // morceau anonyme
const READ_MS_PER_CHAR = 45 // témoignage : le temps de le lire (≈ 22 caractères par seconde, à 3 m de l'écran)
const READ_MAX_MS = 20000
const LONG_TEXT = 140 // au-delà, la carte s'élargit et le texte passe en mise en page « témoignage »
const CARD_EM = 26
const CARD_WIDE_EM = 46 // portrait à gauche (même taille que pour un texte court), texte à droite
const isLong = (message: string | null | undefined) => (message?.length ?? 0) > LONG_TEXT
const CTA_EVERY = 6 // une pause « Faites partie du vitrail » toutes les N visites
const CTA_MS = 11000
const MAX_ZOOM = 40
const GOLD = '#F0B24A'
const MONO = "'DM Sans', sans-serif"

type Cam = { x: number; y: number; zoom: number }
interface Card {
  key: string
  id: string
  fresh: boolean
  name: string | null
  message: string | null
  photoUrl: string | null
  color: string
  tile: Tile | null
}

export default function Ecran() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const images = useMemo(() => new ImageCache(), [])
  const ambience = useMemo(() => new Ambience(), [])
  const engine = useRef<{ apply: (s: Snapshot) => void }>({ apply: () => {} })

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [cardOut, setCardOut] = useState(false)
  const [cta, setCta] = useState(false)
  const [online, setOnline] = useState(true)
  const [qr, setQr] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [idle, setIdle] = useState(false)

  // ═════════════════════════════════ Moteur : rendu et visite automatique ═════════════════════════════════
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return

    let W = 0
    let H = 0
    let dpr = 1
    let base = 1
    let cam: Cam = { x: 0, y: 0, zoom: 1 }
    let tiles = new Map<string, Tile>()
    let pieces: PieceMap = new Map()
    let list: Piece[] = []
    let version = 0
    let imageVersion = 0
    let fontsVersion = 0
    let needs = true
    let spot: string | null = null
    let ready = false
    // Moteur arrêté (démontage, double montage en développement) : plus aucune action, sinon deux visites
    // se disputeraient la carte et on verrait le nom d'un autre morceau pendant le vol
    let disposed = false

    // Visite
    const priority: string[] = []
    const fresh = new Set<string>() // morceaux d'un don tout neuf (annonce « vient de donner »)
    let deck: string[] = []
    let last: string | null = null
    let hops = 0
    let anim = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let prevAmounts = new Map<string, number>()
    let seenRecent = new Set<string>()
    let first = true

    // Deux couches : le verre (redessiné quand la vue se pose) et la lumière (animée)
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

    const homeCam = (): Cam => ({ x: 0, y: 0, zoom: (Math.min(H * 0.88, W * 0.62)) / 2 / UNIVERSE_RADIUS })

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      margin = Math.round(Math.max(W, H) * 0.15)
      layer.width = Math.round((W + margin * 2) * dpr)
      layer.height = Math.round((H + margin * 2) * dpr)
      layerKey = ''
      const wasHome = Math.abs(cam.zoom - base) < 1e-9
      base = homeCam().zoom
      if (wasHome || !ready) cam = homeCam()
      needs = true
    }

    const flyTo = (to: Cam, ms: number, dip: number, onEnd: () => void) => {
      cancelAnimationFrame(anim)
      const from = { ...cam }
      const t0 = performance.now()
      const step = (now: number) => {
        if (disposed) return
        const k = Math.min(1, (now - t0) / ms)
        const e = 0.5 - Math.cos(Math.PI * k) / 2
        const zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e - dip * Math.sin(Math.PI * k))
        cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, zoom }
        needs = true
        if (k < 1) anim = requestAnimationFrame(step)
        else onEnd()
      }
      anim = requestAnimationFrame(step)
    }

    /** Cadrage d'un morceau dans l'espace laissé libre par la carte (à gauche) et le code QR (en bas à droite). */
    // Le morceau au centre de l'écran, assez petit pour ne passer ni sous la carte (à gauche) ni sous le code QR (à droite)
    // Avec un long témoignage, la carte s'élargit : le morceau se place alors au centre de l'espace qui reste.
    const camOn = (tile: Tile, wide = false): Cam => {
      const em = Math.min(W * 0.011, H * 0.0195) // taille de police de l'écran (classe .tv)
      const cardRight = em * (2.4 + (wide ? CARD_WIDE_EM : CARD_EM)) + em
      const qrLeft = W - em * (2.4 + 14) - em
      const sx = wide ? (cardRight + qrLeft) / 2 : W / 2 // où le morceau apparaît à l'écran
      const halfW = wide ? Math.max(W * 0.1, (qrLeft - cardRight) / 2) : Math.max(W * 0.12, Math.min(W / 2 - cardRight, qrLeft - W / 2))
      const halfH = H * 0.42
      const [x0, y0, x1, y1] = tile.bbox
      const [lx, ly] = tile.labelCenter
      // Demi-étendue de la pièce autour du point centré, dans chaque direction
      const ex = Math.max(lx - x0, x1 - lx, 1e-6)
      const ey = Math.max(ly - y0, y1 - ly, 1e-6)
      const zoom = Math.min(base * MAX_ZOOM, Math.max(base * 1.2, Math.min((halfW * 0.92) / ex, (halfH * 0.92) / ey)))
      return { x: lx - (sx - W / 2) / zoom, y: ly, zoom }
    }

    const pickNext = (): string | null => {
      while (priority.length) {
        const id = priority.shift()!
        if (tiles.has(id)) return id
      }
      deck = deck.filter(id => tiles.has(id))
      if (!deck.length) {
        // Les témoignages passent deux fois plus souvent : ce sont eux qu'on s'arrête pour lire
        const told = new Set(list.filter(p => (p.message?.length ?? 0) >= 40).map(p => p.id))
        const ids = [...tiles.keys()].flatMap(id => (told.has(id) ? [id, id] : [id]))
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        // Jamais deux fois de suite le même morceau
        for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) ids.splice(i--, 1)
        if (ids.length > 1 && ids[ids.length - 1] === last) [ids[0], ids[ids.length - 1]] = [ids[ids.length - 1], ids[0]]
        deck = ids
      }
      return deck.pop() ?? null
    }

    const hideCard = () => {
      setCardOut(true)
      setTimeout(() => !disposed && setCard(null), 600)
    }

    const next = () => {
      if (disposed) return
      clearTimeout(timer)
      if (!tiles.size) {
        timer = setTimeout(next, 2000)
        return
      }
      hideCard()
      spot = null
      needs = true
      // Pause d'appel : retour au vitrail entier (les nouveaux dons passent avant)
      if (hops >= CTA_EVERY && !priority.length) {
        hops = 0
        flyTo(homeCam(), FLY_MS, 0, () => {
          setCta(true)
          timer = setTimeout(() => {
            setCta(false)
            next()
          }, CTA_MS)
        })
        return
      }
      const id = pickNext()
      const tile = id ? tiles.get(id) : null
      if (!id || !tile) {
        timer = setTimeout(next, 2000)
        return
      }
      hops++
      last = id
      const isFresh = fresh.has(id)
      fresh.delete(id)
      const p = list.find(x => x.id === id)
      const message = CONFIG.showMessagesOnScreen ? p?.message ?? null : null
      flyTo(camOn(tile, isLong(message)), FLY_MS, 0.6, () => {
        spot = id
        needs = true
        setCardOut(false)
        setCard({ key: `${id}-${Date.now()}`, id, fresh: isFresh, name: p?.name ?? null, message, photoUrl: p?.photoUrl ?? null, color: p?.color ?? '#E0657F', tile })
        const rich = !!(p?.name || p?.photoUrl || message)
        // Le temps de lire le témoignage en entier
        const reading = Math.min(READ_MAX_MS, (message?.length ?? 0) * READ_MS_PER_CHAR)
        timer = setTimeout(next, (isFresh ? HOLD_MS + 2000 : rich ? HOLD_MS : HOLD_BARE_MS) + reading)
      })
    }

    // Instantané reçu : nouveaux dons en priorité, pavage recalculé si le vitrail a changé
    let busy = false
    let queued: Snapshot | null = null
    let lastVersion = ''
    const apply = async (s: Snapshot) => {
      if (busy) {
        queued = s
        return
      }
      busy = true
      try {
        if (!first) {
          const newDonors = new Set(s.recent.filter(d => !seenRecent.has(d.id)).map(d => d.donorId))
          for (const p of s.pieces) {
            const before = prevAmounts.get(p.id)
            if (before === undefined || p.amountCents > before) {
              if (!priority.includes(p.id)) priority.push(p.id)
              if (newDonors.has(p.id) || before === undefined) fresh.add(p.id)
            }
          }
        }
        seenRecent = new Set(s.recent.map(d => d.id))
        prevAmounts = new Map(s.pieces.map(p => [p.id, p.amountCents]))
        list = s.pieces
        setSnap(s)
        if (s.version !== lastVersion) {
          lastVersion = s.version
          const t = await tilePieces(s.pieces)
          if (disposed) return
          tiles = t
          pieces = pieceMap(s.pieces, CONFIG.showMessagesOnScreen)
          version++
          needs = true
          const colorOf = (tile: Tile): GlassColors => glassColors(pieces.get(tile.id)?.color ?? '#E0657F', tile.id)
          ambience.rebuild(t.values(), colorOf, UNIVERSE_RADIUS, (x, y) => {
            const hit = hitTile(t.values(), x, y)
            return hit ? colorOf(hit) : null
          })
        }
        if (first) {
          first = false
          ready = true
          cam = homeCam()
          timer = setTimeout(next, 3000)
        }
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(s))
        } catch {}
      } finally {
        busy = false
        const q = queued
        queued = null
        if (q) void apply(q)
      }
    }
    engine.current.apply = s => void apply(s)

    // ── Rendu ──
    const ambientLevel = () => Math.min(1, Math.max(0, 1 - (cam.zoom / base - 1) / 2.5))
    const hexA = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`
    let bg: CanvasGradient | null = null
    const render = (now: number) => {
      const dt = Math.min(64, now - (lastFrame || now))
      lastFrame = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!bg) {
        bg = ctx.createLinearGradient(0, 0, 0, H)
        bg.addColorStop(0, '#0a0910')
        bg.addColorStop(1, '#040306')
      }
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
      if (!ready || !tiles.size || !lctx) return
      const cx = W / 2 - cam.x * cam.zoom
      const cy = H / 2 - cam.y * cam.zoom
      const r = UNIVERSE_RADIUS * cam.zoom
      const level = ambientLevel()
      ambience.drawBehind(ctx, cx, cy, r, W, H, level, now, dt, false)

      const key = [W, H, version, imageVersion, fontsVersion].join('|')
      if (cam.x !== prevCam.x || cam.y !== prevCam.y || cam.zoom !== prevCam.zoom) {
        lastMoveAt = now
        prevCam = { ...cam }
        stillFrames = 0
      } else stillFrames++
      const settled = stillFrames >= 3 && now - lastMoveAt > 120
      const camMatches = cam.x === layerCam.x && cam.y === layerCam.y && cam.zoom === layerCam.zoom
      const lw = W + margin * 2
      const lh = H + margin * 2
      const placement = () => {
        const k = cam.zoom / layerCam.zoom
        return { k, dx: (-margin - W / 2) * k + (layerCam.x - cam.x) * cam.zoom + W / 2, dy: (-margin - H / 2) * k + (layerCam.y - cam.y) * cam.zoom + H / 2 }
      }
      let pl = placement()
      const stale = !(pl.k <= 1.25 && pl.dx <= 0 && pl.dy <= 0 && pl.dx + lw * pl.k >= W && pl.dy + lh * pl.k >= H)
      if (key !== layerKey || (!camMatches && (settled || stale))) {
        lctx.setTransform(1, 0, 0, 1, 0, 0)
        lctx.clearRect(0, 0, layer.width, layer.height)
        drawScene(lctx, {
          tiles,
          pieces,
          images,
          view: { scale: cam.zoom, ox: W / 2 + margin - cam.x * cam.zoom, oy: H / 2 + margin - cam.y * cam.zoom },
          dpr,
          width: lw,
          height: lh,
          uiScale: Math.max(1, Math.min(W, H) / 1080),
        })
        layerCam = { ...cam }
        layerKey = key
        pl = placement()
      }
      ctx.drawImage(layer, pl.dx, pl.dy, lw * pl.k, lh * pl.k)

      // Le morceau en lumière : le reste s'assombrit doucement, son contour pulse dans sa couleur
      const tile = spot ? tiles.get(spot) : null
      if (tile?.path) {
        const z = cam.zoom
        ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * cx, dpr * cy)
        const rest = new Path2D()
        rest.rect(-UNIVERSE_RADIUS * 3, -UNIVERSE_RADIUS * 3, UNIVERSE_RADIUS * 6, UNIVERSE_RADIUS * 6)
        rest.addPath(tile.path)
        ctx.fillStyle = 'rgba(5,4,8,0.45)'
        ctx.fill(rest, 'evenodd')
        const color = pieces.get(tile.id)?.color ?? '#ffffff'
        const pulse = Math.sin(now / 420) * 0.5 + 0.5
        ctx.lineJoin = 'round'
        ctx.shadowColor = color
        ctx.shadowBlur = 24 + pulse * 22
        ctx.strokeStyle = hexA(color, 0.4 + pulse * 0.3)
        ctx.lineWidth = 10 / z
        ctx.stroke(tile.path)
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 3 / z
        ctx.stroke(tile.path)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      if (level > 0.01) {
        ctx.globalAlpha = level
        ambience.drawFront(ctx, cx, cy, r, now, false)
        ctx.globalAlpha = 1
      }
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (needs || spot || ambientLevel() > 0.02) {
        needs = false
        render(now)
      }
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(loop)
    const unsub = images.subscribe(() => {
      imageVersion++
      needs = true
    })
    void ensureFonts().then(() => {
      fontsVersion++
      needs = true
    })
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(anim)
      clearTimeout(timer)
      unsub()
      window.removeEventListener('resize', resize)
    }
     
  }, [images, ambience])

  // ═════════════════════════════════ Données : toutes les 3 s, avec reprise ═════════════════════════════════
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let failures = 0
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) engine.current.apply(JSON.parse(cached) as Snapshot)
    } catch {}
    const tick = async () => {
      try {
        const res = await fetch('/api/vitrail', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const s = (await res.json()) as Snapshot
        failures = 0
        if (!stopped) {
          setOnline(true)
          engine.current.apply(s)
        }
      } catch {
        failures++
        if (!stopped) setOnline(false)
      }
      if (!stopped) timer = setTimeout(tick, failures ? Math.min(30_000, CONFIG.pollMs * 2 ** failures) : CONFIG.pollMs)
    }
    void tick()
    const onOnline = () => {
      clearTimeout(timer)
      failures = 0
      void tick()
    }
    window.addEventListener('online', onOnline)
    const reload = setTimeout(() => window.location.reload(), RELOAD_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
      clearTimeout(reload)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // ── Code QR : le don sur place, dans le vitrail, provenance « ecran » ──
  useEffect(() => {
    const base = (new URLSearchParams(window.location.search).get('url') || browserOrigin()).replace(/\/$/, '')
    const url = `${base}/vitrail?don&src=ecran`
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#0b0a10', light: '#ffffff' } })
      .then(d => {
        setQr(d)
        setTarget(base.replace(/^https?:\/\//, ''))
      })
      .catch(() => setQr(null))
  }, [])

  // ── Écran toujours allumé, curseur caché, plein écran ──
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
    const onVisible = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', onVisible)
    let idleTimer: ReturnType<typeof setTimeout>
    const onMove = () => {
      setIdle(false)
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => setIdle(true), 3000)
    }
    onMove()
    window.addEventListener('mousemove', onMove)
    const onKey = (e: KeyboardEvent) => e.key.toLowerCase() === 'f' && toggleFullscreen()
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
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  const event = snap?.event ?? null
  const raised = event && event.goalCents > 0 ? event.totalCents : snap?.totalCents ?? 0
  const pct = event && event.goalCents > 0 ? Math.min(100, (event.totalCents / event.goalCents) * 100) : 0
  const count = snap?.pieces.length ?? 0

  return (
    <main className={`tv fixed inset-0 overflow-hidden ${idle ? 'tv-hide-cursor' : ''}`} onClick={toggleFullscreen} style={{ background: '#0B0A12' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Voile sombre derrière l'en-tête : il reste lisible même quand le verre clair passe dessous */}
      <div className="pointer-events-none absolute left-0 top-0" style={{ width: '40em', height: '24em', background: 'radial-gradient(ellipse at top left, rgba(11,10,18,0.92) 0%, rgba(11,10,18,0.75) 40%, rgba(11,10,18,0) 72%)' }} />

      {/* École et collecte, en haut à gauche */}
      <div className="absolute" style={{ left: '2.4em', top: '2em', width: '22em' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ecole-logo.png" alt={CONFIG.orgName} style={{ width: '12em', height: 'auto', display: 'block' }} />
        <div className="font-display" style={{ fontSize: '2.3em', marginTop: '0.45em', lineHeight: 1.05 }}>{CONFIG.vitrailTitle}</div>
        <div style={{ marginTop: '0.9em', fontFamily: MONO }}>
          <span style={{ fontSize: '1.7em', fontWeight: 700, color: GOLD }}>{formatMoney(raised)}</span>
          <span style={{ fontSize: '1em', color: 'rgba(255,255,255,0.6)', marginLeft: '0.5em' }}>{event && event.goalCents > 0 ? `sur ${formatMoney(event.goalCents)}` : 'amassés'}</span>
        </div>
        {pct > 0 && (
          <div style={{ height: '0.35em', borderRadius: '1em', background: 'rgba(255,255,255,0.12)', marginTop: '0.5em', overflow: 'hidden', width: '18em' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: GOLD, transition: 'width 1.5s ease' }} />
          </div>
        )}
        <div style={{ fontFamily: MONO, fontSize: '0.95em', color: 'rgba(255,255,255,0.55)', marginTop: '0.5em' }}>
          {count} donateur{count > 1 ? 's' : ''}
        </div>
      </div>

      {/* Donivers, discret : le message de l'organisme passe avant */}
      <div className="absolute" style={{ left: '50%', bottom: '0.9em', transform: 'translateX(-50%)', fontSize: '0.85em', color: 'rgba(244,239,230,0.45)', whiteSpace: 'nowrap' }}>
        {CONFIG.brand.name} · <span className="slogan">{CONFIG.brand.slogan}</span>
      </div>

      {/* Le morceau en lumière : photo, nom, message — jamais de montant */}
      {card && !cta && (
        <div key={card.key} style={{ position: 'absolute', left: '2.4em', bottom: '2.4em', width: `${isLong(card.message) ? CARD_WIDE_EM : CARD_EM}em` }}>
          <div className={cardOut ? 'tv-banner-out' : 'tv-banner-in'} style={{ padding: '1.6em', borderRadius: '1.2em', background: 'rgba(12,10,18,0.96)', border: `1px solid ${card.color}66`, boxShadow: `0 0 4em ${card.color}33, 0 1.5em 4em rgba(0,0,0,0.6)`, backdropFilter: 'blur(12px)' }}>
            <div style={{ fontFamily: MONO, fontSize: '0.85em', letterSpacing: '0.18em', textTransform: 'uppercase', color: card.fresh ? GOLD : 'rgba(255,255,255,0.55)' }}>
              {card.fresh ? '✦ Vient de donner' : 'Merci à'}
            </div>
            {isLong(card.message) ? (
              // Témoignage : le portrait à gauche, au même format que pour un texte court ; le nom et le texte à droite
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.6em', marginTop: '1em' }}>
                <div style={{ flexShrink: 0 }}>
                  <CardPortrait card={card} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '2.1em', fontWeight: 700, lineHeight: 1.1 }}>{card.name ?? ANON_LABEL}</div>
                  <div style={{ marginTop: '0.7em', paddingLeft: '1em', borderLeft: `0.2em solid ${card.color}`, fontSize: card.message!.length > 340 ? '1.1em' : '1.22em', lineHeight: 1.5, color: 'rgba(255,248,235,0.95)' }}>
                    {card.message}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '1em 0 1.1em' }}>
                  <CardPortrait card={card} />
                </div>
                <div style={{ fontSize: '2.1em', fontWeight: 700, lineHeight: 1.1, textAlign: 'center' }}>{card.name ?? ANON_LABEL}</div>
                {card.message && (
                  <div style={{ marginTop: '0.8em', fontSize: '1.25em', lineHeight: 1.45, textAlign: 'center', color: card.color, textShadow: `0 0 1em ${card.color}55` }}>« {card.message} »</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ScaleBadge style={{ left: '50%', top: 16, transform: 'translateX(-50%)' }} />

      {/* Pause : appel à donner, au centre, le vitrail entier derrière */}
      {cta && (
        <div className="absolute" style={{ left: '50%', bottom: '3em', transform: 'translateX(-50%)', width: '40em', textAlign: 'center' }}>
          <div className="tv-banner-in" style={{ padding: '1.6em 2em', borderRadius: '1.4em', background: 'rgba(12,10,18,0.92)', border: '1px solid rgba(240,178,74,0.5)', boxShadow: '0 0 4em rgba(240,178,74,0.15)' }}>
            <div style={{ fontFamily: MONO, fontSize: '0.95em', letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD }}>Faites partie du vitrail</div>
            <div className="font-display" style={{ fontSize: '2.5em', lineHeight: 1.1, marginTop: '0.35em' }}>Chaque don devient un morceau de verre</div>
            <div style={{ fontSize: '1.2em', lineHeight: 1.4, marginTop: '0.6em', color: 'rgba(255,255,255,0.8)' }}>
              Plus le don est grand, plus le morceau l&apos;est. {CONFIG.orgWhyShort}.
            </div>
            <div style={{ fontSize: '1.3em', fontWeight: 600, marginTop: '0.7em', color: GOLD }}>Scannez le code →</div>
          </div>
        </div>
      )}

      {/* Code QR, en bas à droite */}
      <div className="absolute text-center" style={{ right: '2.4em', bottom: '2.4em', width: '14em', background: '#fff', color: '#0b0a10', borderRadius: '1.2em', padding: '1em', boxShadow: cta ? '0 0 0 0.4em rgba(240,178,74,0.6)' : 'none', transition: 'box-shadow 0.6s' }}>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Code QR pour donner" style={{ width: '100%', display: 'block' }} />
        ) : (
          <div style={{ aspectRatio: '1', background: '#eee' }} />
        )}
        <div style={{ fontWeight: 700, fontSize: '1.1em', marginTop: '0.5em', lineHeight: 1.2 }}>Ajoutez votre morceau</div>
        <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '0.2em', wordBreak: 'break-all' }}>{target}</div>
      </div>

      {/* État */}
      <div className="absolute text-right" style={{ right: '2.4em', top: '2em', fontSize: '0.95em' }}>
        {snap?.mode === 'demo' && <div style={{ background: GOLD, color: '#1A1208', fontWeight: 700, padding: '0.3em 0.8em', borderRadius: '0.6em', display: 'inline-block' }}>MODE DÉMO — aucun paiement réel</div>}
        {!online && <div className="muted" style={{ marginTop: '0.5em' }}>Connexion perdue — dernier état affiché, reprise automatique</div>}
      </div>

      {snap && count === 0 && (
        <div className="absolute text-center" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '24em' }}>
          <div style={{ fontSize: '1.9em', fontWeight: 600 }}>Le vitrail attend sa première pièce</div>
          <div className="muted" style={{ fontSize: '1.2em', marginTop: '0.5em' }}>Scannez le code pour donner et voir votre morceau de verre apparaître.</div>
        </div>
      )}
    </main>
  )
}

/** Portrait de la carte : la photo si le donateur en a mis une, sinon sa pièce de verre telle qu'elle est dans le vitrail. */
function CardPortrait({ card }: { card: Card }) {
  const [size, setSize] = useState(220)
  useEffect(() => {
    const s = () => setSize(Math.round(Math.min(window.innerWidth, window.innerHeight * 1.78) * (card.photoUrl ? 0.13 : 0.1)))
    s()
    window.addEventListener('resize', s)
    return () => window.removeEventListener('resize', s)
  }, [card.photoUrl])
  return <PiecePortrait id={card.id} color={card.color} photoUrl={card.photoUrl} tile={card.tile} size={size} />
}
