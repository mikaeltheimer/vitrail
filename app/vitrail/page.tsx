'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CONFIG } from '@/lib/config'
import { ensureFonts } from '@/lib/fonts'
import { formatMoney } from '@/lib/format'
import { ImageCache } from '@/lib/images'
import { drawScene, pieceMap, tilePieces, UNIVERSE_RADIUS, type View } from '@/lib/render'
import { hitTile, type Tile } from '@/lib/tiling'
import type { Piece, Snapshot } from '@/lib/types'

// Le vitrail en ligne, sur téléphone ou ordinateur : on le parcourt (glisser, pincer, molette), on touche un morceau pour
// voir qui l'a offert. Sert après un don (« explorer le vitrail en grand ») et pour promouvoir la collecte sans être sur place.

const MAX_ZOOM = 60
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

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
  const images = useMemo(() => new ImageCache(), [])

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [tiles, setTiles] = useState<Map<string, Tile> | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hint, setHint] = useState(true)

  // Caméra et rendu hors de React : un dessin seulement quand quelque chose change
  const cam = useRef<{ view: View; W: number; H: number; dpr: number; anim: { from: View; to: View; start: number; ms: number } | null }>({
    view: { scale: 1, ox: 0, oy: 0 },
    W: 0,
    H: 0,
    dpr: 1,
    anim: null,
  })
  const dirty = useRef(true)
  const version = useRef('')
  const focused = useRef(false)
  const selectedRef = useRef<string | null>(null)
  const tilesRef = useRef<Map<string, Tile> | null>(null)
  const piecesRef = useRef(pieceMap([]))

  const baseScale = () => (Math.min(cam.current.W, cam.current.H) / 2 - 12) / UNIVERSE_RADIUS
  const homeView = (): View => ({ scale: baseScale(), ox: cam.current.W / 2, oy: cam.current.H / 2 })

  const flyTo = useCallback((to: View, ms = 700) => {
    cam.current.anim = { from: { ...cam.current.view }, to, start: performance.now(), ms }
    dirty.current = true
  }, [])

  /** Vue centrée sur un morceau, assez zoomée pour lire son nom. */
  const viewOn = useCallback((tile: Tile): View => {
    const { W, H } = cam.current
    const scale = Math.min(baseScale() * MAX_ZOOM, Math.max(baseScale(), (0.28 * Math.min(W, H)) / tile.inRadius))
    // Le morceau un peu au-dessus du centre : la fiche occupe le bas de l'écran
    return { scale, ox: W / 2 - tile.labelCenter[0] * scale, oy: H * 0.42 - tile.labelCenter[1] * scale }
  }, [])

  // ── Données : instantané toutes les 10 s, pavage recalculé quand le vitrail change ──
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const s = (await fetch('/api/vitrail', { cache: 'no-store' }).then(r => r.json())) as Snapshot
        if (stop || !s.pieces) return
        setSnap(s)
        if (s.version !== version.current) {
          version.current = s.version
          const t = await tilePieces(s.pieces)
          if (stop) return
          tilesRef.current = t
          piecesRef.current = pieceMap(s.pieces)
          setTiles(t)
          dirty.current = true
        }
      } catch {}
    }
    void load()
    const id = setInterval(load, 10_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [])

  // Après un don (?d=…) : on vole jusqu'au morceau du donateur et on ouvre sa fiche
  useEffect(() => {
    if (!tiles || focused.current || !focusParam) return
    const tile = tiles.get(focusParam)
    if (!tile) return
    focused.current = true
    selectedRef.current = focusParam
    Promise.resolve().then(() => setSelected(focusParam))
    setTimeout(() => flyTo(viewOn(tile), 1400), 400)
  }, [tiles, focusParam, flyTo, viewOn])

  useEffect(() => {
    selectedRef.current = selected
    dirty.current = true
  }, [selected])

  useEffect(() => images.subscribe(() => (dirty.current = true)), [images])
  useEffect(() => {
    void ensureFonts().then(() => (dirty.current = true))
  }, [])

  // ── Taille de l'écran ──
  useEffect(() => {
    const resize = () => {
      const c = cam.current
      const first = c.W === 0
      const canvas = canvasRef.current
      c.W = window.innerWidth
      c.H = window.innerHeight
      c.dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas) {
        canvas.width = Math.round(c.W * c.dpr)
        canvas.height = Math.round(c.H * c.dpr)
      }
      if (first) c.view = homeView()
      dirty.current = true
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Boucle de dessin (seulement si quelque chose a changé) ──
  useEffect(() => {
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const c = cam.current
      if (c.anim) {
        const k = Math.min(1, (now - c.anim.start) / c.anim.ms)
        const e = ease(k)
        // Zoom exponentiel (régulier à l'œil), position linéaire en coordonnées monde
        const { from, to } = c.anim
        const scale = from.scale * Math.pow(to.scale / from.scale, e)
        const cx0 = (c.W / 2 - from.ox) / from.scale
        const cy0 = (c.H / 2 - from.oy) / from.scale
        const cx1 = (c.W / 2 - to.ox) / to.scale
        const cy1 = (c.H / 2 - to.oy) / to.scale
        const wx = cx0 + (cx1 - cx0) * e
        const wy = cy0 + (cy1 - cy0) * e
        c.view = { scale, ox: c.W / 2 - wx * scale, oy: c.H / 2 - wy * scale }
        if (k >= 1) c.anim = null
        dirty.current = true
      }
      if (!dirty.current) return
      dirty.current = false
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const t = tilesRef.current
      if (!canvas || !ctx || !t) return
      ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0)
      ctx.fillStyle = '#07060b'
      ctx.fillRect(0, 0, c.W, c.H)
      drawScene(ctx, { tiles: t, pieces: piecesRef.current, images, view: c.view, dpr: c.dpr, width: c.W, height: c.H, focusId: selectedRef.current })
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [images])

  // ── Gestes : glisser, pincer, molette, toucher ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pts = new Map<number, { x: number; y: number }>()
    let moved = 0
    let lastTap = 0

    const clampView = () => {
      const c = cam.current
      const base = baseScale()
      c.view.scale = Math.min(base * MAX_ZOOM, Math.max(base * 0.8, c.view.scale))
      // Le vitrail ne quitte jamais complètement l'écran
      const r = UNIVERSE_RADIUS * c.view.scale
      c.view.ox = Math.min(c.W + r * 0.6, Math.max(-r * 0.6, c.view.ox))
      c.view.oy = Math.min(c.H + r * 0.6, Math.max(-r * 0.6, c.view.oy))
    }
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const v = cam.current.view
      const wx = (sx - v.ox) / v.scale
      const wy = (sy - v.oy) / v.scale
      v.scale *= factor
      clampView()
      v.ox = sx - wx * v.scale
      v.oy = sy - wy * v.scale
      clampView()
      dirty.current = true
    }
    const tap = (sx: number, sy: number) => {
      const v = cam.current.view
      const t = tilesRef.current
      if (!t) return
      const hit = hitTile(t.values(), (sx - v.ox) / v.scale, (sy - v.oy) / v.scale)
      setSelected(hit ? hit.id : null)
    }

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1) moved = 0
      cam.current.anim = null
      setHint(false)
    }
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId)
      if (!p) return
      const v = cam.current.view
      if (pts.size === 1) {
        const dx = e.clientX - p.x
        const dy = e.clientY - p.y
        moved += Math.abs(dx) + Math.abs(dy)
        v.ox += dx
        v.oy += dy
        clampView()
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const other = a === p ? b : a
        const before = Math.hypot(p.x - other.x, p.y - other.y)
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
        moved += 20
        if (before > 0) zoomAt((e.clientX + other.x) / 2, (e.clientY + other.y) / 2, after / before)
        // Le milieu des deux doigts suit le geste
        v.ox += (e.clientX - p.x) / 2
        v.oy += (e.clientY - p.y) / 2
      }
      p.x = e.clientX
      p.y = e.clientY
      dirty.current = true
    }
    const up = (e: PointerEvent) => {
      const wasSingle = pts.size === 1
      pts.delete(e.pointerId)
      if (!wasSingle || moved > 8) return
      const now = performance.now()
      if (now - lastTap < 300) {
        zoomAt(e.clientX, e.clientY, 2.2) // double toucher : on zoome
        lastTap = 0
      } else {
        lastTap = now
        tap(e.clientX, e.clientY)
      }
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      cam.current.anim = null
      setHint(false)
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
    }
     
  }, [])

  const piece: Piece | null = useMemo(() => (selected ? snap?.pieces.find(p => p.id === selected) ?? null : null), [selected, snap])
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr-CA')
    if (q.length < 2 || !snap) return []
    return snap.pieces.filter(p => p.name && p.name.toLocaleLowerCase('fr-CA').includes(q)).slice(0, 6)
  }, [query, snap])

  const goTo = (id: string) => {
    const tile = tilesRef.current?.get(id)
    if (!tile) return
    setQuery('')
    setSelected(id)
    flyTo(viewOn(tile))
  }

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: '#07060b', touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }} aria-label="Le vitrail de dons" />

      {/* En-tête */}
      <header className="pointer-events-none absolute inset-x-0 top-0 p-4" style={{ background: 'rgba(7,6,11,0.82)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)' }}>
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div>
            <p className="muted text-[0.7rem] font-medium uppercase tracking-[0.2em]">{CONFIG.orgName}</p>
            <h1 className="text-xl font-bold leading-tight">{CONFIG.appName}</h1>
            {snap && (
              <p className="muted text-sm">
                {formatMoney(snap.totalCents)} · {snap.pieces.length} morceau{snap.pieces.length > 1 ? 'x' : ''}
              </p>
            )}
          </div>
          <div className="relative w-40 sm:w-56">
            <input className="field !py-2 text-sm" placeholder="Trouver un nom" value={query} onChange={e => setQuery(e.target.value)} aria-label="Trouver un nom" />
            {matches.length > 0 && (
              <ul className="card absolute right-0 mt-1 w-full !p-1 text-sm" style={{ background: '#121019' }}>
                {matches.map(m => (
                  <li key={m.id}>
                    <button className="w-full rounded-lg px-2 py-2 text-left hover:bg-white/10" onClick={() => goTo(m.id)}>
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </header>

      {hint && tiles && tiles.size > 0 && !selected && (
        <p className="pointer-events-none absolute inset-x-0 text-center text-sm muted" style={{ bottom: '6.5rem' }}>
          Glissez, pincez pour zoomer, touchez un morceau
        </p>
      )}

      {/* Fiche du morceau touché */}
      {piece && (
        <section className="card absolute inset-x-3 mx-auto max-w-md" style={{ bottom: '5.5rem', background: 'rgba(16,14,23,0.96)' }}>
          <div className="flex items-start gap-3">
            {piece.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={piece.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="h-14 w-14 shrink-0 rounded-xl" style={{ background: piece.color, boxShadow: 'inset 0 0 12px rgba(255,255,255,0.35)' }} />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold">{piece.name ?? 'Donateur anonyme'}</div>
              <div className="font-bold" style={{ color: '#ffe7a0' }}>
                {formatMoney(piece.amountCents)}
              </div>
              {piece.message && <p className="muted mt-1 text-sm">« {piece.message} »</p>}
            </div>
            <button className="muted shrink-0 px-1 text-xl leading-none" aria-label="Fermer" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
        </section>
      )}

      {/* Appel à donner, toujours visible */}
      <div className="absolute inset-x-3 bottom-4 mx-auto flex max-w-md gap-2">
        <Link href="/" className="btn flex-1">
          Ajouter mon morceau
        </Link>
        <button className="btn btn-ghost !w-auto px-4" aria-label="Voir tout le vitrail" onClick={() => flyTo(homeView())}>
          ⤢
        </button>
      </div>
    </main>
  )
}
