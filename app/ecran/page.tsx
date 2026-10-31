'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import { Ambience, glassColors, type GlassColors } from '@/lib/glass'
import { hitTile, type Tile } from '@/lib/tiling'
import { ImageCache } from '@/lib/images'
import { drawScene, pieceMap, tilePieces, UNIVERSE_RADIUS, type PieceMap } from '@/lib/render'
import type { Snapshot } from '@/lib/types'

// Écran d'affichage plein écran : le vitrail, le total, le QR code, et une animation à chaque nouveau don.
// Il interroge /api/vitrail toutes les 3 s (plus fiable qu'une connexion ouverte sur un Wi-Fi d'événement),
// garde le dernier état en mémoire locale, et se resynchronise tout seul après une coupure.
// Adresse de don dans le QR : ?url=https://… dans l'adresse de cette page, sinon NEXT_PUBLIC_SITE_URL, sinon l'origine.

const CACHE_KEY = 'vitrail:last-snapshot'
const FADE_MS = 1400
const HIGHLIGHT_MS = 9000
const BANNER_MS = 7000
const RELOAD_MS = 6 * 60 * 60 * 1000

interface Banner {
  id: string
  photoUrl: string | null
  title: string
  message: string | null
  amount: string
  leaving: boolean
  /** Durée d'affichage ; 7 s par défaut. */
  durationMs?: number
}

interface World {
  tiles: Map<string, Tile>
  pieces: PieceMap
  images: ImageCache
  layer: HTMLCanvasElement | null
  prevLayer: HTMLCanvasElement | null
  fadeStart: number
  highlights: Map<string, number>
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
      highlights: new Map(),
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
  const bannerQueue = useRef<Banner[]>([])
  const showing = useRef(false)
  const pump = useRef<() => void>(() => {})
  const piecesRef = useRef<Snapshot['pieces']>([])
  const deck = useRef<string[]>([])
  const lastSpot = useRef<string | null>(null)

  const totalShown = useCountUp(snap?.totalCents ?? 0)
  const eventShown = useCountUp(snap?.event?.totalCents ?? 0)

  // ── Annonces : une à la fois, 7 s chacune ──
  useEffect(() => {
    pump.current = () => {
      if (showing.current) return
      const next = bannerQueue.current.shift()
      if (!next) return
      showing.current = true
      setBanner(next)
      const ms = next.durationMs ?? BANNER_MS
      setTimeout(() => setBanner(b => (b ? { ...b, leaving: true } : b)), ms - 600)
      setTimeout(() => {
        setBanner(null)
        showing.current = false
        pump.current()
      }, ms)
    }
  }, [])

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
            bannerQueue.current.push({
              id: d.id,
              photoUrl: d.photoUrl,
              title: d.name ? `${d.name} vient de donner` : 'Un don anonyme',
              message: CONFIG.showMessagesOnScreen ? d.message : null,
              amount: formatMoney(d.amountCents),
              leaving: false,
            })
          }
        }
        for (const d of s.recent) seen.current.add(d.id)
        prevAmounts.current = new Map(s.pieces.map(p => [p.id, p.amountCents]))
        setSnap(s)
        piecesRef.current = s.pieces

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
        const now = performance.now()
        for (const id of lit) world.highlights.set(id, now)
        first.current = false
        pump.current()
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

  // ── Projecteur : un donateur au hasard, à intervalle régulier, sans répétition avant que tous soient passés ──
  useEffect(() => {
    if (CONFIG.spotlightEveryMs <= 0) return
    const timer = setInterval(() => {
      // Les vrais dons passent toujours en premier : on ne mélange pas les deux
      if (document.hidden || showing.current || bannerQueue.current.length > 0 || first.current) return
      const eligible = piecesRef.current.filter(p => p.name !== null)
      if (eligible.length === 0) return
      const byId = new Map(eligible.map(p => [p.id, p]))
      deck.current = deck.current.filter(id => byId.has(id))
      if (deck.current.length === 0) {
        const ids = eligible.map(p => p.id)
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        // Le dernier montré ne revient pas en premier
        if (ids.length > 1 && ids[ids.length - 1] === lastSpot.current) [ids[0], ids[ids.length - 1]] = [ids[ids.length - 1], ids[0]]
        deck.current = ids
      }
      const id = deck.current.pop()
      const piece = id ? byId.get(id) : undefined
      if (!piece) return
      lastSpot.current = piece.id
      world.highlights.set(piece.id, performance.now() - (HIGHLIGHT_MS - CONFIG.spotlightShowMs - 1000))
      bannerQueue.current.push({
        id: `spot-${piece.id}-${Date.now()}`,
        photoUrl: piece.photoUrl,
        title: `Merci à ${piece.name}`,
        message: CONFIG.showMessagesOnScreen ? piece.message : null,
        amount: formatMoney(piece.amountCents),
        leaving: false,
        durationMs: CONFIG.spotlightShowMs,
      })
      pump.current()
    }, CONFIG.spotlightEveryMs)
    return () => clearInterval(timer)
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
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx || world.R <= 0) return
      const dt = Math.min(64, now - last)
      last = now
      const { W, H, dpr, R, cx, cy } = world
      const scale = R / UNIVERSE_RADIUS

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

      // Nouveau don : la pièce s'illumine et pulse
      if (world.highlights.size) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(scale, scale)
        ctx.lineJoin = 'round'
        for (const [id, start] of world.highlights) {
          const age = now - start
          const tile = world.tiles.get(id)
          if (age > HIGHLIGHT_MS || !tile?.path) {
            if (age > HIGHLIGHT_MS) world.highlights.delete(id)
            continue
          }
          const fade = age < HIGHLIGHT_MS - 2000 ? 1 : 1 - (age - (HIGHLIGHT_MS - 2000)) / 2000
          const pulse = 0.5 + 0.5 * Math.sin(age / 260)
          ctx.globalCompositeOperation = 'lighter'
          ctx.fillStyle = `rgba(255,240,200,${0.38 * pulse * fade})`
          ctx.fill(tile.path)
          ctx.globalCompositeOperation = 'source-over'
          ctx.lineWidth = (3 + 3 * pulse) / scale
          ctx.strokeStyle = `rgba(245,196,81,${0.95 * fade})`
          ctx.stroke(tile.path)
        }
        ctx.restore()
      }

      world.ambience.drawFront(ctx, cx, cy, R, now, false)
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
    <main className={`tv fixed inset-0 overflow-hidden ${idle ? 'tv-hide-cursor' : ''}`} onClick={toggleFullscreen}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* En-tête */}
      <div className="absolute" style={{ left: '2.5em', top: '2em', maxWidth: '24em' }}>
        <div className="muted" style={{ fontSize: '1.05em', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          {CONFIG.orgName}
        </div>
        <div style={{ fontSize: '3em', fontWeight: 700, lineHeight: 1.05, marginTop: '0.2em' }}>{CONFIG.appName}</div>
        {event && (
          <div className="muted" style={{ fontSize: '1.4em', marginTop: '0.5em' }}>
            {event.name}
          </div>
        )}
      </div>

      {/* Totaux */}
      <div className="absolute" style={{ left: '2.5em', bottom: '2.5em', width: '21em' }}>
        <div className="muted" style={{ fontSize: '1.1em' }}>
          Total amassé
        </div>
        <div style={{ fontSize: '4.2em', fontWeight: 700, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(totalShown)}</div>
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
        className="absolute text-center"
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

      {/* Vitrail vide */}
      {empty && (
        <div className="absolute text-center" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '22em' }}>
          <div style={{ fontSize: '1.8em', fontWeight: 650 }}>Le vitrail attend sa première pièce</div>
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
          <div style={{ fontSize: '1.2em' }}>{banner.title}</div>
          <div style={{ fontSize: '2.6em', fontWeight: 700, color: '#f5c451', lineHeight: 1.1 }}>{banner.amount}</div>
          {banner.message && <div className="muted" style={{ fontSize: '1.1em', marginTop: '0.3em' }}>« {banner.message} »</div>}
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
