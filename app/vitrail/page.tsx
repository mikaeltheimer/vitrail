'use client'

// Le vitrail en ligne : la rosace du Donivers, adaptée à la collecte.
// En-tête 56 px, vitrail dessous ; à gauche (ordinateur) : recherche, « Rencontrer quelqu'un », « Mon morceau »,
// mini-carte qu'on fait glisser ; fiche à droite ; « Ajouter mon morceau » ouvre le panneau de don sur place,
// avec l'aperçu du morceau en direct dans le vitrail. Téléphone : bouton doré flottant, mini-carte en bas à droite,
// « Rencontrer quelqu'un » en bas à gauche, un toucher choisit, un second ouvre la fiche.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import LanguageSwitch from '@/components/LanguageSwitch'
import AboutPanel from '@/components/vitrail/AboutPanel'
import BottomSheet from '@/components/vitrail/BottomSheet'
import ClaimPanel, { type ClaimDraft } from '@/components/vitrail/ClaimPanel'
import TestimonialField from '@/components/vitrail/TestimonialField'
import DetailPanel from '@/components/vitrail/DetailPanel'
import { HoverCard } from '@/components/vitrail/HoverCard'
import Ticker from '@/components/vitrail/Ticker'
import type { RankedPiece } from '@/components/vitrail/types'
import { CONFIG } from '@/lib/config'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { useOrg } from '@/lib/useOrg'
import { useMoney, useOrdinal, useSceneText } from '@/lib/useI18n'
import { ensureFonts } from '@/lib/fonts'
import { Ambience, glassColors, type GlassColors } from '@/lib/glass'
import { ImageCache } from '@/lib/images'
import { drawScene, pieceMap, tilePieces, UNIVERSE_RADIUS, type PieceMap } from '@/lib/render'
import { hitTile, type Tile } from '@/lib/tiling'
import type { Piece, Snapshot } from '@/lib/types'
import ScaleBadge from '@/components/ScaleBadge'
import { OrgMark } from '@/components/OrgBrand'
import Editable from '@/components/atelier/Editable'
import { useAtelier } from '@/components/atelier/Atelier'

const HEADER_HEIGHT = 56
const MONO = "'DM Sans', sans-serif"
const GOLD = '#F0B24A'
const ROSACE_FRAME = 0.8
const MAX_ZOOM = 60
const IDLE_DRIFT_AFTER_MS = 30_000
const IDLE_DRIFT_EVERY_MS = 7_000
const INTRO_MS = 6500
const PREVIEW_ID = '__preview__'
const BOUNDS = UNIVERSE_RADIUS * 1.08 // monde visible dans les mini-cartes

const introTitleStyle: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 600,
  fontSize: 'clamp(22px, 3.4vw, 34px)',
  letterSpacing: '-0.02em',
  color: '#F4EFE6',
  textShadow: '0 2px 24px rgba(0,0,0,0.9)',
  fontVariantNumeric: 'tabular-nums',
}
const goldButtonStyle: React.CSSProperties = {
  padding: '11px 18px',
  background: GOLD,
  color: '#1A1208',
  border: 0,
  borderRadius: '999px',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 8px 30px rgba(240,178,74,0.25)',
}

type Cam = { x: number; y: number; zoom: number }
type IntroPhase = 'off' | 'running' | 'done'

interface Engine {
  base: Piece[]
  tiles: Map<string, Tile>
  pieces: PieceMap
  ranked: RankedPiece[]
  byId: Map<string, RankedPiece>
  version: number
  cam: Cam
  baseZoom: number
  W: number
  H: number
  dpr: number
  mobile: boolean
  ready: boolean
  selected: string | null
  hovered: string | null
  spot: string | null
  claim: boolean
  previewOn: boolean
  sheetOpen: boolean
  anim: number | null
  intro: IntroPhase
  lastInput: number
  needs: boolean
  imageVersion: number
  fontsVersion: number
  recentlyMet: string[]
  onFirstTiles?: (focus: string | null) => void
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
  const t = useTranslations('vitrail')
  const ti = useTranslations('vitrail.intro')
  const tt = useTranslations('vitrail.toast')
  const tc = useTranslations('commun')
  const org = useOrg()
  const sceneText = useSceneText()
  const params = useSearchParams()
  const focusParam = params.get('d')
  // Retour de Stripe (?merci=réf.) : on revient sur le vitrail, directement sur son morceau
  const arrivalRef = useRef(params.get('merci'))
  const reloadRef = useRef<() => Promise<void>>(async () => {})
  const [welcome, setWelcome] = useState<Welcome | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const introCountRef = useRef<HTMLDivElement>(null)
  // Textes lus par le moteur (animations, instantanés), qui ne se relance pas à chaque changement de langue
  const fmtRef = useRef({ count: (n: number) => String(n), toast: (name: string | null) => name ?? '', anon: '', text: sceneText })
  const claimPanelRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const viewRects = useRef<Set<SVGRectElement>>(new Set())
  const images = useMemo(() => new ImageCache(), [])
  const ambience = useMemo(() => new Ambience(), [])
  const wRef = useRef<Engine>({
    base: [],
    tiles: new Map(),
    pieces: new Map(),
    ranked: [],
    byId: new Map(),
    version: 0,
    cam: { x: 0, y: 0, zoom: 1 },
    baseZoom: 1,
    W: 0,
    H: 0,
    dpr: 1,
    mobile: false,
    ready: false,
    selected: null,
    hovered: null,
    spot: null,
    claim: false,
    previewOn: false,
    sheetOpen: false,
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
  const [tilesMap, setTilesMap] = useState<Map<string, Tile>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [sheetOpen, setSheetOpenState] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [mobile, setMobile] = useState(false)
  const [intro, setIntro] = useState<IntroPhase>('off')
  const [introCta, setIntroCta] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  // Dons fermés (organisme pas encore en ligne) : « Donner » affiche un avis au lieu du panneau
  const closedRef = useRef(false)
  const [closedNotice, setClosedNotice] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [toast, setToast] = useState<{ id: string; donorId: string; text: string } | null>(null)

  const setSheetOpen = useCallback((v: boolean) => {
    wRef.current.sheetOpen = v
    setSheetOpenState(v)
  }, [])

  // Actions du moteur offertes à l'interface
  const api = useRef<{
    select: (id: string | null, openSheet?: boolean) => void
    home: () => void
    step: (dir: 1 | -1) => void
    meet: () => void
    zoomBy: (f: number) => void
    panTo: (x: number, y: number) => void
    preview: (draft: ClaimDraft, geometryChanged: boolean) => void
    openClaim: () => void
    closeClaim: () => void
  }>({ select: () => {}, home: () => {}, step: () => {}, meet: () => {}, zoomBy: () => {}, panTo: () => {}, preview: () => {}, openClaim: () => {}, closeClaim: () => {} })

  // ═════════════════════════════════ Moteur : caméra, rendu, gestes ═════════════════════════════════
  useEffect(() => {
    const w = wRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
    let previewSeq = 0
    let framing: 'place' | 'detail' = 'place'

    const homeCam = (): Cam => ({ x: 0, y: 0, zoom: (Math.min(w.W, w.H) * ROSACE_FRAME) / 2 / UNIVERSE_RADIUS })
    const toWorld = (sx: number, sy: number) => ({ x: (sx - w.W / 2) / w.cam.zoom + w.cam.x, y: (sy - w.H / 2) / w.cam.zoom + w.cam.y })
    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const clampCam = (c: Cam): Cam => {
      const lim = UNIVERSE_RADIUS * 1.1
      return { x: clamp(c.x, -lim, lim), y: clamp(c.y, -lim, lim), zoom: clamp(c.zoom, w.baseZoom * 0.5, w.baseZoom * MAX_ZOOM) }
    }
    const setCam = (c: Cam) => {
      w.cam = c
      w.needs = true
    }

    const resize = () => {
      const atHome = !w.selected && !w.claim && Math.abs(w.cam.zoom - w.baseZoom) < 1e-9
      w.W = window.innerWidth
      w.H = window.innerHeight - HEADER_HEIGHT
      w.mobile = window.innerWidth < 768
      setMobile(w.mobile)
      const touch = navigator.maxTouchPoints > 0
      w.dpr = Math.min(window.devicePixelRatio || 1, touch ? 2 : 3)
      canvas.width = Math.round(w.W * w.dpr)
      canvas.height = Math.round(w.H * w.dpr)
      canvas.style.width = `${w.W}px`
      canvas.style.height = `${w.H}px`
      margin = Math.round(Math.max(w.W, w.H) * (touch ? 0.3 : 0.12))
      layer.width = Math.round((w.W + margin * 2) * w.dpr)
      layer.height = Math.round((w.H + margin * 2) * w.dpr)
      layerKey = ''
      w.baseZoom = homeCam().zoom
      if (atHome || !w.ready) w.cam = homeCam()
      w.needs = true
    }

    const stopAnim = () => {
      if (w.anim) cancelAnimationFrame(w.anim)
      w.anim = null
    }
    /** Vol de caméra en échelle log ; `dip` : léger recul à mi-chemin. */
    const flyTo = (target: Cam, ms: number, dip = 0, onEnd?: () => void) => {
      stopAnim()
      const start = { ...w.cam }
      const t0 = performance.now()
      const step = (now: number) => {
        const k = reduced ? 1 : Math.min(1, (now - t0) / ms)
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        const zoom = Math.exp(Math.log(start.zoom) + (Math.log(target.zoom) - Math.log(start.zoom)) * e - dip * Math.sin(Math.PI * k))
        setCam({ x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e, zoom })
        if (k < 1) w.anim = requestAnimationFrame(step)
        else {
          w.anim = null
          onEnd?.()
        }
      }
      w.anim = requestAnimationFrame(step)
    }

    // ── Sélection, la pièce occupe la moitié de l'écran ──
    const zoomTo = (id: string, openSheet: boolean) => {
      const tile = w.tiles.get(id)
      if (!tile) return
      const zoom = clamp((Math.min(w.W, w.H) * 0.5) / (tile.equivRadius * 2), w.baseZoom, w.baseZoom * MAX_ZOOM)
      // Panneau à droite (ordinateur) : la pièce se décale vers la gauche ; feuille (téléphone) : vers le haut
      const offX = !w.mobile ? 160 : 0
      const offY = w.mobile && openSheet ? w.H * 0.22 : 0
      const [x, y] = tile.labelCenter
      flyTo({ x: x + offX / zoom, y: y + offY / zoom, zoom }, 900, Math.abs(Math.log(zoom / w.cam.zoom)) > 1.5 ? 0.25 : 0)
    }
    const select = (id: string | null, openSheet = !w.mobile) => {
      endIntro(true)
      w.selected = id
      w.spot = null
      setSelected(id)
      setSheetOpen(!!id && openSheet)
      layerKey = ''
      w.needs = true
      if (id) zoomTo(id, openSheet)
    }
    const home = () => {
      w.selected = null
      setSelected(null)
      setSheetOpen(false)
      layerKey = ''
      flyTo(homeCam(), 800)
    }
    // Navigation par rang (1 = le plus grand)
    const step = (dir: 1 | -1) => {
      const n = w.ranked.length
      if (!n) return
      const cur = w.selected ? w.byId.get(w.selected)?.rank ?? 0 : 0
      const next = dir > 0 ? (cur <= 0 || cur >= n ? 1 : cur + 1) : cur <= 1 ? n : cur - 1
      const p = w.ranked[next - 1]
      if (p) select(p.id, w.mobile ? w.sheetOpen : true)
    }
    // « Rencontrer quelqu'un » : de préférence avec une photo ou un message, jamais les derniers vus
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
      if (p) select(p.id, w.mobile ? w.sheetOpen : true)
    }
    const zoomBy = (f: number) => {
      stopAnim()
      setCam(clampCam({ ...w.cam, zoom: w.cam.zoom * f }))
    }
    const panTo = (x: number, y: number) => {
      stopAnim()
      endIntro(true)
      w.lastInput = Date.now()
      setCam(clampCam({ ...w.cam, x, y }))
    }

    // ── Pavage : les morceaux, et le morceau d'aperçu pendant un don ──
    const applyTiles = (tiles: Map<string, Tile>, pieces: Piece[]) => {
      w.tiles = tiles
      w.pieces = pieceMap(pieces)
      w.version++
      layerKey = ''
      w.needs = true
      const colorOf = (t: Tile): GlassColors => glassColors(w.pieces.get(t.id)?.color ?? '#E0657F', t.id)
      ambience.rebuild(tiles.values(), colorOf, UNIVERSE_RADIUS, (x, y) => {
        const t = hitTile(tiles.values(), x, y)
        return t ? colorOf(t) : null
      })
      setTilesMap(tiles)
    }

    // Cadrage de l'aperçu : la place dans le vitrail, ou un gros plan
    const frameFor = (closeUp: boolean) => {
      const tile = w.tiles.get(PREVIEW_ID)
      if (!tile) return
      framing = closeUp ? 'detail' : 'place'
      const panel = claimPanelRef.current
      const free = w.mobile ? { left: 0, right: 0, top: 0, bottom: (panel?.offsetHeight ?? w.H * 0.5) + 12 } : { left: 260, right: (panel?.offsetWidth ?? 400) + 24, top: 0, bottom: 0 }
      const freeW = Math.max(120, w.W - free.left - free.right)
      const freeH = Math.max(120, w.H - free.top - free.bottom)
      const sx = (free.left - free.right) / 2
      const sy = (free.top - free.bottom) / 2
      const fitZoom = (Math.min(freeW, freeH) * 0.9) / (2 * UNIVERSE_RADIUS)
      const targetZoom = Math.max(fitZoom, 12 / Math.max(tile.equivRadius, 1e-6))
      const t = Math.min(1, targetZoom / fitZoom - 1)
      let target: Cam = { x: tile.labelCenter[0] * t - sx / targetZoom, y: tile.labelCenter[1] * t - sy / targetZoom, zoom: targetZoom }
      if (closeUp) {
        const [x0, y0, x1, y1] = tile.bbox
        const fit = Math.min((freeW * 0.72) / Math.max(x1 - x0, 1e-6), (freeH * 0.72) / Math.max(y1 - y0, 1e-6))
        const z = Math.max(targetZoom, Math.min(w.baseZoom * MAX_ZOOM, fit))
        target = { x: (x0 + x1) / 2 - sx / z, y: (y0 + y1) / 2 - sy / z, zoom: z }
      }
      flyTo(target, 800)
    }
    const preview = async (draft: ClaimDraft, geometryChanged: boolean) => {
      const piece: Piece = { id: PREVIEW_ID, name: draft.name ?? fmtRef.current.anon, message: draft.message, photoUrl: draft.photoSrc, color: draft.color, amountCents: draft.amountCents }
      if (!geometryChanged && w.previewOn) {
        // Couleur, nom, photo : pas besoin de recalculer le pavage
        w.pieces.set(PREVIEW_ID, { color: piece.color, name: piece.name, message: piece.message, photoUrl: piece.photoUrl })
        w.version++
        w.needs = true
        if (draft.focus !== framing) frameFor(draft.focus === 'detail')
        return
      }
      const seq = ++previewSeq
      const items = [...w.base, piece]
      const tiles = await tilePieces(items)
      if (seq !== previewSeq || !w.claim) return
      applyTiles(tiles, items)
      w.previewOn = true
      w.selected = PREVIEW_ID
      setSelected(PREVIEW_ID)
      frameFor(draft.focus === 'detail')
    }
    const openClaim = () => {
      if (closedRef.current) {
        setClosedNotice(true)
        return
      }
      endIntro(true)
      w.selected = null
      setSelected(null)
      setSheetOpen(false)
      w.claim = true
      w.spot = null
      setClaimOpen(true)
    }
    const closeClaim = async () => {
      w.claim = false
      setClaimOpen(false)
      previewSeq++
      w.previewOn = false
      w.selected = null
      setSelected(null)
      framing = 'place'
      const tiles = await tilePieces(w.base)
      applyTiles(tiles, w.base)
      flyTo(homeCam(), 800)
    }

    api.current = { select, home, step, meet, zoomBy, panTo, preview: (d, g) => void preview(d, g), openClaim, closeClaim: () => void closeClaim() }

    // ── Ouverture : travelling arrière d'un morceau moyen jusqu'au vitrail entier ──
    const endIntro = (hide: boolean) => {
      if (w.intro === 'running') {
        cancelAnimationFrame(introRaf)
        w.intro = 'done'
        setIntro('done')
        setTimeout(() => setIntroCta(true), reduced ? 0 : 900)
      }
      if (hide && w.intro === 'done') {
        w.intro = 'off'
        setIntro('off')
      }
    }
    const startIntro = () => {
      const tiles = [...w.tiles.values()].sort((a, b) => a.area - b.area)
      if (tiles.length < 2) return false
      const target = homeCam()
      const start = tiles[Math.floor(tiles.length * (0.3 + Math.random() * 0.2))]
      const z0 = Math.min(target.zoom * MAX_ZOOM, (Math.min(w.W, w.H) * 0.42) / Math.sqrt(start.area))
      const z1 = target.zoom
      const [sx, sy] = start.labelCenter
      const t0 = performance.now()
      w.intro = 'running'
      setIntro('running')
      setIntroCta(false)
      const frame = (now: number) => {
        const k = Math.min(1, (now - t0) / INTRO_MS)
        const e = 0.5 - Math.cos(Math.PI * k) / 2
        const z = Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * e)
        const f = (Math.log(z0) - Math.log(z)) / (Math.log(z0) - Math.log(z1) || 1)
        setCam({ x: sx + (target.x - sx) * f, y: sy + (target.y - sy) * f, zoom: z })
        if (introCountRef.current) {
          const hw = w.W / 2 / z
          const hh = w.H / 2 / z
          let n = 0
          for (const t of w.tiles.values()) {
            const bb = t.bbox
            if (bb[2] >= w.cam.x - hw && bb[0] <= w.cam.x + hw && bb[3] >= w.cam.y - hh && bb[1] <= w.cam.y + hh) n++
          }
          introCountRef.current.textContent = fmtRef.current.count(n)
        }
        if (k < 1) introRaf = requestAnimationFrame(frame)
        else endIntro(false)
      }
      w.cam = { x: sx, y: sy, zoom: z0 }
      introRaf = requestAnimationFrame(frame)
      return true
    }
    w.onFirstTiles = focus => {
      w.ready = true
      w.cam = homeCam()
      const sp = new URLSearchParams(window.location.search)
      let seen = false
      try {
        seen = sessionStorage.getItem('vitrail:intro') === '1'
      } catch {}
      if (arrivalRef.current) {
        // le panneau de bienvenue s'occupe du cadrage
      } else if (focus && w.tiles.has(focus)) setTimeout(() => select(focus, true), 300)
      else if (sp.has('don')) setTimeout(openClaim, 200)
      else if (!reduced && (!seen || sp.has('intro')) && startIntro()) {
        try {
          sessionStorage.setItem('vitrail:intro', '1')
        } catch {}
      }
      w.needs = true
    }

    // ── Rendu ──
    const ambientLevel = () => clamp(1 - (w.cam.zoom / w.baseZoom - 1) / 3, 0, 1)
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
        text: fmtRef.current.text,
      })
      layerCam = { ...cam }
    }
    const hexA = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`
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
        ctx.shadowBlur = strong ? 12 * (1.5 + pulse * 1.5) : 26
        ctx.strokeStyle = hexA(color, strong ? 0.35 + pulse * 0.3 : 0.55)
        ctx.lineWidth = 8 / z
        ctx.stroke(tile.path)
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = color
        ctx.lineWidth = 3 / z
        ctx.stroke(tile.path)
        if (strong && tile.equivRadius * z < 14) {
          ctx.beginPath()
          ctx.arc(tile.labelCenter[0], tile.labelCenter[1], (16 + pulse * 8) / z, 0, Math.PI * 2)
          ctx.strokeStyle = hexA(color, 0.9 - pulse * 0.5)
          ctx.lineWidth = 2 / z
          ctx.stroke()
        }
      }
      if (w.hovered && w.hovered !== w.selected) {
        const tile = w.tiles.get(w.hovered)
        if (tile?.path) {
          ctx.fillStyle = 'rgba(255,255,255,0.13)'
          ctx.fill(tile.path)
        }
      }
      if (w.spot && !w.selected) glow(w.spot, false)
      if (w.selected) glow(w.selected, true)
      ctx.setTransform(w.dpr, 0, 0, w.dpr, 0, 0)
    }

    let bg: CanvasGradient | null = null
    let lastView = ''
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
      if (level > 0.01) {
        ctx.globalAlpha = level
        ambience.drawFront(ctx, cx, cy, r, now, reduced)
        ctx.globalAlpha = 1
      }

      // Cadre de la vue dans les mini-cartes (sans rendu React)
      const vk = `${cam.x.toFixed(1)}|${cam.y.toFixed(1)}|${cam.zoom.toFixed(6)}|${w.W}|${w.H}`
      if (vk !== lastView) {
        lastView = vk
        for (const rect of viewRects.current) {
          if (!rect.isConnected) {
            viewRects.current.delete(rect)
            continue
          }
          const mw = Number(rect.dataset.w)
          const mh = Number(rect.dataset.h)
          const s = Math.min(mw, mh) / (BOUNDS * 2)
          rect.setAttribute('x', String(mw / 2 + (cam.x - w.W / 2 / cam.zoom) * s))
          rect.setAttribute('y', String(mh / 2 + (cam.y - w.H / 2 / cam.zoom) * s))
          rect.setAttribute('width', String(Math.max(8, (w.W / cam.zoom) * s)))
          rect.setAttribute('height', String(Math.max(8, (w.H / cam.zoom) * s)))
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

    // ── Gestes ──
    const pts = new Map<number, { x: number; y: number }>()
    let moved = 0
    let lastTap = 0
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const p = toWorld(sx, sy)
      const zoom = clamp(w.cam.zoom * factor, w.baseZoom * 0.5, w.baseZoom * MAX_ZOOM)
      setCam(clampCam({ x: p.x - (sx - w.W / 2) / zoom, y: p.y - (sy - w.H / 2) / zoom, zoom }))
    }
    const hit = (sx: number, sy: number) => {
      const p = toWorld(sx, sy)
      return hitTile(w.tiles.values(), p.x, p.y)
    }
    const down = (e: PointerEvent) => {
      endIntro(true)
      stopAnim()
      canvas.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, local(e))
      if (pts.size === 1) moved = 0
      if (!w.mobile) canvas.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId)
      const p = local(e)
      if (!prev) {
        if (e.pointerType === 'mouse' && w.ready && !w.claim) {
          const id = hit(p.x, p.y)?.id ?? null
          const real = id === PREVIEW_ID ? null : id
          if (real !== w.hovered) {
            w.hovered = real
            setHovered(real)
            canvas.style.cursor = real ? 'pointer' : 'grab'
            w.needs = true
          }
        }
        return
      }
      if (pts.size === 1) {
        const dx = p.x - prev.x
        const dy = p.y - prev.y
        moved += Math.abs(dx) + Math.abs(dy)
        setCam(clampCam({ ...w.cam, x: w.cam.x - dx / w.cam.zoom, y: w.cam.y - dy / w.cam.zoom }))
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const other = a === prev ? b : a
        const before = Math.hypot(prev.x - other.x, prev.y - other.y)
        const after = Math.hypot(p.x - other.x, p.y - other.y)
        moved += 20
        if (before > 0) zoomAt((p.x + other.x) / 2, (p.y + other.y) / 2, after / before)
        setCam(clampCam({ ...w.cam, x: w.cam.x - (p.x - prev.x) / 2 / w.cam.zoom, y: w.cam.y - (p.y - prev.y) / 2 / w.cam.zoom }))
      }
      prev.x = p.x
      prev.y = p.y
    }
    const up = (e: PointerEvent) => {
      const single = pts.size === 1
      pts.delete(e.pointerId)
      if (!w.mobile) canvas.style.cursor = w.hovered ? 'pointer' : 'grab'
      if (!single || moved > 8) return
      const p = local(e)
      const now = performance.now()
      if (now - lastTap < 280) {
        zoomAt(p.x, p.y, 2) // double toucher : on s'approche
        lastTap = 0
        return
      }
      lastTap = now
      if (w.claim) return // pendant un don, le vitrail montre l'aperçu ; on ne choisit pas d'autre morceau
      const t = hit(p.x, p.y)
      if (!t) {
        if (w.selected) {
          w.selected = null
          setSelected(null)
          setSheetOpen(false)
          layerKey = ''
          w.needs = true
        }
        return
      }
      // Téléphone : un premier toucher choisit et s'approche, un second ouvre la fiche
      if (w.mobile) {
        if (w.selected === t.id) setSheetOpen(true)
        else select(t.id, false)
      } else select(t.id, true)
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
      endIntro(true)
      stopAnim()
      const p = local(e)
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015))
    }
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || w.claim) return
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'Escape') home()
    }

    // ── Dérive au repos : sans interaction, la caméra glisse d'un morceau à l'autre ──
    let drifting = false
    let lastHop = 0
    const idle = setInterval(() => {
      const calm = !document.hidden && !w.claim && w.intro === 'off' && !w.selected && w.ranked.length > 2 && pts.size === 0
      if (!calm) {
        drifting = false
        return
      }
      const now = Date.now()
      if (now - w.lastInput < IDLE_DRIFT_AFTER_MS) return
      if (drifting && now - lastHop < IDLE_DRIFT_EVERY_MS) return
      drifting = true
      lastHop = now
      const p = pickSomeone()
      const tile = p ? w.tiles.get(p.id) : null
      if (!p || !tile) return
      w.spot = null
      const [x0, y0, x1, y1] = tile.bbox
      const zoom = Math.min(w.baseZoom * MAX_ZOOM, (Math.min(w.W, w.H) * 0.38) / Math.max(x1 - x0, y1 - y0, 1e-6))
      flyTo({ x: tile.labelCenter[0], y: tile.labelCenter[1], zoom }, 2600, 0.55, () => {
        if (drifting) {
          w.spot = p.id
          w.needs = true
        }
      })
    }, 1000)
    const stopDrift = () => {
      w.lastInput = Date.now()
      if (drifting) {
        drifting = false
        stopAnim()
        w.spot = null
        w.needs = true
      }
    }
    const inputEvents = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const

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
    inputEvents.forEach(ev => window.addEventListener(ev, stopDrift, { capture: true, passive: true }))
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
      inputEvents.forEach(ev => window.removeEventListener(ev, stopDrift, { capture: true }))
    }
  }, [images, ambience, setSheetOpen])

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
        closedRef.current = s.mode === 'off'
        const fresh = s.recent.filter(d => !seen.has(d.id))
        s.recent.forEach(d => seen.add(d.id))
        if (!first && fresh.length) {
          const d = fresh[0]
          setToast({ id: d.id, donorId: d.donorId, text: fmtRef.current.toast(d.name) })
        }
        if (s.version === version) return
        version = s.version
        const sorted = [...s.pieces].sort((a, b) => b.amountCents - a.amountCents || (a.id < b.id ? -1 : 1))
        const rankedList: RankedPiece[] = sorted.map((p, i) => ({ ...p, rank: i + 1 }))
        w.base = s.pieces
        w.ranked = rankedList
        w.byId = new Map(rankedList.map(p => [p.id, p]))
        setRanked(rankedList)
        // Pendant un don, l'aperçu garde la main : le nouveau pavage attend la fermeture du panneau
        if (w.claim) return
        const tiles = await tilePieces(s.pieces)
        if (stop || w.claim) return
        w.tiles = tiles
        w.pieces = pieceMap(s.pieces)
        w.version++
        w.needs = true
        const colorOf = (t: Tile): GlassColors => glassColors(w.pieces.get(t.id)?.color ?? '#E0657F', t.id)
        ambience.rebuild(tiles.values(), colorOf, UNIVERSE_RADIUS, (x, y) => {
          const t = hitTile(tiles.values(), x, y)
          return t ? colorOf(t) : null
        })
        setTilesMap(tiles)
        if (first) {
          first = false
          w.onFirstTiles?.(focusParam)
        }
      } catch {}
    }
    reloadRef.current = load
    void load()
    const id = setInterval(load, 10_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [ambience, focusParam])

  // Provenance (?src= du code QR de l'écran, d'une affiche, d'un partage) : retenue pour le don, visite comptée une fois
  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get('src')
    let counted = false
    try {
      if (src) sessionStorage.setItem('vitrail:src', src)
      counted = sessionStorage.getItem('vitrail:visit') === '1'
      sessionStorage.setItem('vitrail:visit', '1')
    } catch {}
    if (!counted) void fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: src ?? 'vitrail' }) }).catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const me = localStorage.getItem('vitrail:me')
      if (me) Promise.resolve().then(() => setMyId(me))
    } catch {}
  }, [])

  // ── Retour de paiement : on attend la confirmation (webhook Stripe), puis on vole jusqu'au nouveau morceau ──
  useEffect(() => {
    const ref = arrivalRef.current
    if (!ref) return
    let stop = false
    window.history.replaceState({}, '', '/vitrail')
    try {
      sessionStorage.removeItem('vitrail:claim') // payé : le brouillon ne sert plus
    } catch {}
    Promise.resolve().then(() => setWelcome({ state: 'wait' }))
    let tries = 0
    const showPiece = async (donorId: string) => {
      // Le pavage doit contenir le morceau : on recharge l'instantané jusqu'à le voir apparaître (~20 s au plus)
      for (let i = 0; i < 20 && !stop; i++) {
        const w = wRef.current
        if (w.ready && w.tiles.has(donorId)) {
          api.current.select(donorId, true)
          return
        }
        if (i % 3 === 0) await reloadRef.current()
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    const poll = async () => {
      if (stop) return
      try {
        const res = await fetch('/api/merci', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }) })
        const data = await res.json()
        if (res.ok && data.pending === false && data.donorId) {
          try {
            localStorage.setItem('vitrail:me', data.donorId)
          } catch {}
          setMyId(data.donorId)
          setWelcome({ state: 'ok', donorId: data.donorId, name: data.name ?? null, token: data.token, photoPending: !!data.photoPending, hasMessage: !!data.hasMessage, messagePending: !!data.messagePending })
          void showPiece(data.donorId)
          return
        }
      } catch {}
      // Stripe confirme le paiement quelques secondes après le retour : on patiente jusqu'à ~40 s
      if (++tries < 27) setTimeout(poll, 1500)
      else setWelcome({ state: 'lost' })
    }
    void poll()
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  const onDraftChange = useCallback((draft: ClaimDraft, geometryChanged: boolean) => {
    api.current.preview(draft, geometryChanged)
  }, [])

  // Mis à jour après les effets du moteur, qui lisent ces textes
  useEffect(() => {
    fmtRef.current = { count: n => ti('compteur', { count: n }), toast: name => tt('ajoute', { nom: name ?? tt('quelquun') }), anon: tc('anonyme'), text: sceneText }
    // Changement de langue en cours de visite : le verre est redessiné avec les nouveaux textes
    wRef.current.version++
    wRef.current.needs = true
  }, [ti, tt, tc, sceneText])

  const piece = selected && selected !== PREVIEW_ID ? ranked.find(p => p.id === selected) ?? null : null
  const hoveredPiece = hovered && hovered !== selected ? ranked.find(p => p.id === hovered) ?? null : null
  const mine = myId ? ranked.find(p => p.id === myId) ?? null : null
  const tile = piece ? tilesMap.get(piece.id) ?? null : null
  const totalCents = snap?.totalCents ?? 0
  const count = ranked.length
  const claimLabel = t('ajouter')
  const closed = snap?.mode === 'off'
  const showcase = !!snap?.showcase
  const atelier = useAtelier()
  const atelierBar = !!atelier
  const atelierEditing = !!atelier?.editing
  const atelierBarHeight = atelier?.barHeight ?? 0
  // Téléphone, atelier : la barre de l'atelier (fixe, 62 px du haut) occupe le haut de l'écran ; tout ce qui s'ancre
  // sous l'en-tête (annonce d'un don, carte de bienvenue) descend d'autant, et le bouton d'ajout passe sous le titre
  // (qu'il ne doit pas couvrir : on le modifie d'un toucher).
  const barOffset = mobile && atelierBar && atelierBarHeight ? 62 + atelierBarHeight + 6 - HEADER_HEIGHT : 0
  // Bas du titre du vitrail (en haut à gauche) : les dons récents se rangent juste dessous
  const titleRef = useRef<HTMLHeadingElement>(null)
  const hasSnap = snap !== null
  const [titleBottom, setTitleBottom] = useState(HEADER_HEIGHT + 60)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const measure = () => setTitleBottom(Math.round(el.getBoundingClientRect().bottom))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [hasSnap, mobile, atelierBar, atelierBarHeight])
  const colorById = useMemo(() => new Map(ranked.map(p => [p.id, p.color])), [ranked])

  // Mini-cartes : polygones des morceaux (SVG) ; le cadre de la vue est mis à jour par le moteur
  const registerRect = useCallback((el: SVGRectElement | null) => {
    if (el) viewRects.current.add(el)
  }, [])
  const polygons = [...tilesMap.values()].map(t => (
    <polygon key={t.id} points={t.svgPoints} fill={colorById.get(t.id) ?? (t.id === PREVIEW_ID ? GOLD : '#E0657F')} opacity={selected === t.id ? 1 : 0.5} />
  ))

  return (
    <div className="h-screen overflow-hidden" style={{ background: '#0B0A12' }}>
      <Header
        mobile={mobile}
        count={count}
        totalCents={totalCents}
        goalCents={snap?.event?.goalCents ?? 0}
        eventCents={snap?.event?.totalCents ?? 0}
        onAbout={() => {
          setAboutOpen(true)
          setMenuOpen(false)
          api.current.select(null)
        }}
        claimLabel={closed ? '' : claimLabel}
        onClaim={() => {
          setAboutOpen(false)
          api.current.openClaim()
        }}
        onHome={() => api.current.home()}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        ranked={ranked}
        onPick={id => api.current.select(id, true)}
      />

      <div className="fixed left-0 right-0" style={{ top: HEADER_HEIGHT, bottom: 0 }}>
        <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: 'none', cursor: mobile ? 'default' : 'grab' }} aria-label={t('canvasAria')} />
      </div>

      {/* ── Téléphone ── */}
      {mobile && (
        <>
          {count > 0 && !claimOpen && <MobileMinimap registerRect={registerRect} polygons={polygons} onZoomIn={() => api.current.zoomBy(1.5)} onZoomOut={() => api.current.zoomBy(1 / 1.5)} />}
          {piece && sheetOpen && (
            <BottomSheet
              piece={piece}
              tile={tile}
              own={piece.id === mine?.id}
              sheetRef={sheetRef}
              onClose={() => setSheetOpen(false)}
              onPrev={() => api.current.step(-1)}
              onNext={() => api.current.step(1)}
              onRandom={() => api.current.meet()}
            />
          )}
          {piece && !sheetOpen && (
            <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: piece.color, padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontFamily: MONO, zIndex: 90, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {t('touchez')}
            </div>
          )}
          {!claimOpen && !closed && intro === 'off' && count > 0 && (
            <button onClick={() => api.current.openClaim()} style={{ ...goldButtonStyle, position: 'fixed', top: `${barOffset ? titleBottom + 10 : HEADER_HEIGHT + 16}px`, right: '16px', zIndex: 120 }}>
              {claimLabel}
            </button>
          )}
          {!claimOpen && intro === 'off' && count > 1 && !sheetOpen && !piece && (
            <button
              onClick={() => api.current.meet()}
              style={{ position: 'fixed', left: '16px', bottom: 'calc(20px + env(safe-area-inset-bottom))', zIndex: 120, padding: '11px 16px', borderRadius: '999px', border: '1px solid rgba(240,178,74,0.5)', background: 'rgba(12,10,18,0.85)', backdropFilter: 'blur(6px)', color: GOLD, fontFamily: MONO, fontSize: '13px', fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              {t('rencontrer')}
            </button>
          )}
        </>
      )}

      {/* ── Ordinateur ── */}
      {!mobile && count > 0 && (
        <>
          <DesktopSearch ranked={ranked} bottom={mine ? 348 : 302} onPick={id => api.current.select(id, true)} />
          <SideButton bottom={mine ? 302 : 256} gold onClick={() => api.current.meet()} title={t('rencontrerTitre')}>
            {t('rencontrer')}
          </SideButton>
          {mine && (
            <SideButton bottom={256} color={mine.color} onClick={() => api.current.select(mine.id, true)}>
              <span>◎</span>
              <span>{t('trouver')}</span>
            </SideButton>
          )}
          <NavigationPanel
            registerRect={registerRect}
            polygons={polygons}
            onPanTo={(x, y) => api.current.panTo(x, y)}
            getCam={() => wRef.current.cam}
            onReset={() => api.current.home()}
            onZoomIn={() => api.current.zoomBy(1.5)}
            onZoomOut={() => api.current.zoomBy(1 / 1.5)}
            onPrev={() => api.current.step(-1)}
            onNext={() => api.current.step(1)}
          />
          {piece && <DetailPanel piece={piece} tile={tile} count={count} totalCents={totalCents} own={piece.id === mine?.id} onClose={() => api.current.home()} />}
        </>
      )}

      {/* ── Ouverture : compteur pendant le travelling, puis la question et l'appel à l'action ── */}
      {intro !== 'off' && count > 0 && (
        <div style={{ position: 'fixed', left: '50%', bottom: mobile ? '110px' : '56px', transform: 'translateX(-50%)', width: 'min(560px, calc(100% - 32px))', display: 'grid', justifyItems: 'center', gap: '14px', textAlign: 'center', zIndex: 150, pointerEvents: 'none' }}>
          {intro === 'running' ? (
            <div key="intro-count" ref={introCountRef} style={introTitleStyle} />
          ) : (
            <>
              <div key="intro-final" style={{ fontFamily: MONO, fontSize: '14px', fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.85)', textShadow: '0 0 3px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.95), 0 1px 18px rgba(0,0,0,0.9)', fontVariantNumeric: 'tabular-nums' }}>
                {ti('ligne', { org: org.name, count })}
              </div>
              <div style={{ ...introTitleStyle, fontSize: 'clamp(26px, 4.2vw, 42px)', lineHeight: 1.12, marginTop: '-6px' }}>{ti('phrase')}</div>
              <button
                onClick={() => api.current.openClaim()}
                style={{ ...goldButtonStyle, padding: '13px 22px', fontSize: '15px', pointerEvents: introCta ? 'auto' : 'none', opacity: introCta ? 1 : 0, transition: 'opacity 0.8s ease' }}
              >
                {claimLabel}
              </button>
            </>
          )}
        </div>
      )}

      {!mobile && !claimOpen && <HoverCard piece={hoveredPiece} />}

      {/* ── Derniers dons  ── */}
      {closedNotice && (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 200, maxWidth: 'calc(100% - 32px)', background: '#14121D', border: '1px solid rgba(240,178,74,0.5)', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', color: '#F4EFE6', fontSize: 15 }}>
          <span>{showcase ? t('demoNotice') : t('ferme')}</span>
          <button onClick={() => setClosedNotice(false)} aria-label={tc('fermer')} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>
      )}
      <Ticker top={titleBottom + 12} recent={snap?.recent ?? []} totalCents={totalCents} isMobile={mobile} hidden={intro !== 'off' || count === 0 || claimOpen || (mobile && sheetOpen)} onVisit={id => api.current.select(id, true)} />

      {/* ── À propos de la collecte ── */}
      {aboutOpen && (
        <AboutPanel
          isMobile={mobile}
          totalCents={snap?.event?.goalCents ? snap.event.totalCents : totalCents}
          goalCents={snap?.event?.goalCents ?? 0}
          donors={count}
          onClaim={() => {
            setAboutOpen(false)
            api.current.openClaim()
          }}
          onClose={() => setAboutOpen(false)}
        />
      )}

      {/* ── Don sur place ── */}
      {claimOpen && (
        <ClaimPanel amounts={ranked.map(p => p.amountCents)} typicalCents={snap?.typicalCents ?? null} demo={snap?.mode === 'demo'} isMobile={mobile} panelRef={claimPanelRef} onDraftChange={onDraftChange} onClose={() => api.current.closeClaim()} />
      )}

      <ScaleBadge style={{ left: '50%', bottom: 16, transform: 'translateX(-50%)' }} />

      {/* ── Retour de paiement ── */}
      {welcome && !claimOpen && <WelcomeCard welcome={welcome} isMobile={mobile} topOffset={barOffset} onClose={() => setWelcome(null)} onPublished={() => void reloadRef.current()} />}

      {/* ── Nouveau don pendant la visite ── */}
      {toast && !claimOpen && !welcome && (
        <div style={{ position: 'fixed', left: '50%', top: HEADER_HEIGHT + 72 + barOffset, transform: 'translateX(-50%)', zIndex: 400, width: 'min(92vw, 420px)' }}>
          <div className="tv-banner-in" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: 'rgba(20,18,29,0.95)', border: '1px solid rgba(240,178,74,0.45)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <span style={{ flex: 1, fontSize: 13 }}>{toast.text}</span>
            <button
              onClick={() => {
                api.current.select(toast.donorId, true)
                setToast(null)
              }}
              style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(240,178,74,0.5)', background: 'transparent', color: GOLD, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}
            >
              {tt('voir')}
            </button>
          </div>
        </div>
      )}

      {/* Titre du vitrail, en haut à gauche comme sur le grand écran (sous la barre de l'atelier sur téléphone) */}
      {snap && (
        <>
          <div aria-hidden style={{ position: 'fixed', left: 0, top: HEADER_HEIGHT, width: mobile ? '75vw' : '38em', height: mobile ? '9em' : '14em', background: 'radial-gradient(ellipse at top left, rgba(11,10,18,0.85) 0%, rgba(11,10,18,0.55) 45%, rgba(11,10,18,0) 72%)', pointerEvents: 'none', zIndex: 105 }} />
          <h1
            ref={titleRef}
            className="font-display"
            style={{
              position: 'fixed',
              left: mobile ? 16 : 24,
              // sous la barre de l'atelier sur téléphone, qui passe parfois sur deux lignes (62 = haut de la barre)
              top: mobile ? (atelierBar ? 62 + atelierBarHeight + 12 : HEADER_HEIGHT + 14) : HEADER_HEIGHT + 20,
              maxWidth: mobile ? 'calc(100% - 32px)' : 'min(30em, 40vw)',
              margin: 0,
              fontSize: mobile ? '20px' : 'clamp(24px, 2.4vw, 34px)',
              lineHeight: 1.1,
              color: '#F4EFE6',
              textShadow: '0 1px 12px rgba(0,0,0,0.8)',
              zIndex: 110,
              pointerEvents: atelierEditing ? 'auto' : 'none',
            }}
          >
            <Editable field="vitrailTitle">{org.vitrailTitle}</Editable>
            {showcase && (
              <span className="font-sans" style={{ display: 'block', marginTop: 8, fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', color: '#F0B24A' }}>
                {t('demoBadge')}
              </span>
            )}
          </h1>
        </>
      )}

      {/* Vitrail vide : invitation au premier don ; fermé (brouillon) : « ouvrira bientôt », sans bouton. Caché pendant un don */}
      {snap && count === 0 && !claimOpen && (
        <div style={{ position: 'fixed', inset: `${HEADER_HEIGHT}px 0 0 0`, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, zIndex: 100, pointerEvents: 'none' }}>
          {closed ? (
            <div>
              <div style={introTitleStyle}>{t('bientot')}</div>
              <div style={{ marginTop: 12, color: 'rgba(244,239,230,0.75)', fontSize: 15 }}>{t('bientotTexte')}</div>
            </div>
          ) : (
            <div>
              <div style={introTitleStyle}>{t('vide')}</div>
              <button onClick={() => api.current.openClaim()} style={{ ...goldButtonStyle, marginTop: 20, pointerEvents: 'auto' }}>
                {claimLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════ En-tête  ═════════════════════════════════
type Welcome =
  | { state: 'wait' }
  | { state: 'lost' }
  | { state: 'ok'; donorId: string; name: string | null; token: string; photoPending: boolean; hasMessage: boolean; messagePending: boolean }

/**
 * Bienvenue après le paiement, en haut du vitrail (le morceau s'ouvre dans sa fiche habituelle). C'est le moment
 * d'inviter au témoignage : le don est fait, on regarde son morceau. « Plus tard » donne le lien pour y revenir.
 */
function WelcomeCard({ welcome, isMobile, topOffset = 0, onClose, onPublished }: { welcome: Welcome; isMobile: boolean; topOffset?: number; onClose: () => void; onPublished: () => void }) {
  const t = useTranslations('vitrail.bienvenue')
  const tm = useTranslations('merci')
  const tc = useTranslations('commun')
  const ta = useTranslations('atelier')
  const atelier = useAtelier()
  const org = useOrg()
  const [step, setStep] = useState<'ask' | 'later' | 'done'>('ask')
  const [text, setText] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const token = welcome.state === 'ok' ? welcome.token : ''
  const editUrl = typeof window !== 'undefined' && token ? `${window.location.origin}/m/${token}` : ''

  const publish = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'testimonial', message: text, quoteConsent: consent }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : t('erreur'))
      setPending(!!data.pending)
      setStep('done')
      onPublished()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const copy = () => {
    void navigator.clipboard?.writeText(editUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  const asking = welcome.state === 'ok' && !welcome.hasMessage && step === 'ask'

  return (
    <div style={{ position: 'fixed', left: isMobile ? 12 : '50%', right: isMobile ? 12 : 'auto', top: HEADER_HEIGHT + 14 + topOffset, transform: isMobile ? 'none' : 'translateX(-50%)', zIndex: 420, width: isMobile ? 'auto' : 'min(92vw, 480px)' }}>
      <div
        className="tv-banner-in"
        style={{ position: 'relative', display: 'grid', gap: 8, padding: '16px 18px', borderRadius: 14, background: 'rgba(20,18,29,0.97)', border: '1px solid rgba(240,178,74,0.55)', boxShadow: '0 0 40px rgba(240,178,74,0.18), 0 14px 40px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', fontFamily: "'DM Sans', sans-serif", maxHeight: isMobile ? '62vh' : 'calc(100vh - 120px)', overflowY: 'auto' }}
      >
        {welcome.state !== 'wait' && (
          <button onClick={onClose} aria-label={tc('fermer')} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        )}
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: GOLD }}>{welcome.state === 'ok' && welcome.name ? t('merciNom', { nom: welcome.name }) : t('merci')}</div>
        {welcome.state === 'wait' && <p style={welcomeText}>{t('attente')}</p>}
        {welcome.state === 'lost' && <p style={welcomeText}>{t('perdu')}</p>}

        {welcome.state === 'ok' && (
          <>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{t('fait')}</p>
            {/* Modération : ce qui attend l'approbation de l'équipe (photo, témoignage envoyé avec le don) */}
            {(welcome.photoPending || welcome.messagePending) && (
              <p style={welcomeMuted}>
                {welcome.photoPending && welcome.messagePending ? t('attenteTout', { org: org.name }) : welcome.photoPending ? tm('photoAttente') : t('attenteTemoignage', { org: org.name })}
              </p>
            )}
            {/* Dans l'atelier, c'est le propriétaire qui modère : on l'envoie à la console, le vitrail se mettra à jour seul */}
            {atelier && (welcome.photoPending || welcome.messagePending) && (
              <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: 'rgba(240,178,74,0.1)', border: '1px solid rgba(240,178,74,0.55)' }}>
                <p style={{ ...welcomeText, color: '#F4EFE6' }}>
                  <b style={{ color: GOLD }}>{ta('moderationTitre')}</b> {ta('moderationTexte')}
                </p>
                <a href="/admin#moderation" target="_blank" rel="noopener" style={{ ...goldButtonStyle, textAlign: 'center', textDecoration: 'none' }}>
                  {ta('modererMaintenant')} ↗
                </a>
              </div>
            )}

            {asking && (
              <>
                <p style={{ ...welcomeText, marginTop: 4 }}>
                  <b style={{ color: '#F4EFE6' }}>{org.testimonial.question}</b> <span style={{ color: GOLD }}>{org.testimonial.cta}</span> {org.testimonial.lead}
                </p>
                <TestimonialField value={text} onChange={setText} consent={consent} onConsent={setConsent} rows={isMobile ? 3 : 4} />
                {error && <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button onClick={publish} disabled={!text.trim() || busy} style={{ ...goldButtonStyle, flex: 1, opacity: text.trim() && !busy ? 1 : 0.45, cursor: text.trim() && !busy ? 'pointer' : 'not-allowed' }}>
                    {busy ? t('instant') : t('publier')}
                  </button>
                  <button onClick={() => setStep('later')} style={laterButtonStyle}>
                    {t('plusTard')}
                  </button>
                </div>
              </>
            )}

            {step === 'done' && (
              <p style={welcomeText}>{pending ? t('temoignageAttente') : t('temoignagePublie')}</p>
            )}

            {!asking && (
              <div style={{ display: 'grid', gap: 6, marginTop: 2 }}>
                <p style={welcomeMuted}>
                  {step === 'later' ? t('lienPlusTard') : t('lien')}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, padding: '8px 10px', borderRadius: 8, background: '#0B0A12', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>{editUrl}</code>
                  <button onClick={copy} style={laterButtonStyle}>
                    {copied ? t('copie') : t('copier')}
                  </button>
                </div>
                <a href={`/m/${token}`} style={{ fontSize: 13, color: GOLD, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  {t('ouvrir')}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const welcomeText: React.CSSProperties = { margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.45 }
const welcomeMuted: React.CSSProperties = { margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45 }
const laterButtonStyle: React.CSSProperties = { padding: '10px 14px', background: 'rgba(255,255,255,0.08)', color: '#F4EFE6', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: 'pointer', flexShrink: 0 }

function Header({
  mobile,
  count,
  totalCents,
  goalCents,
  eventCents,
  onAbout,
  claimLabel,
  onClaim,
  onHome,
  searchOpen,
  setSearchOpen,
  menuOpen,
  setMenuOpen,
  ranked,
  onPick,
}: {
  mobile: boolean
  count: number
  totalCents: number
  goalCents: number
  eventCents: number
  onAbout: () => void
  claimLabel: string
  onClaim: () => void
  onHome: () => void
  searchOpen: boolean
  setSearchOpen: (v: boolean) => void
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
  ranked: RankedPiece[]
  onPick: (id: string) => void
}) {
  const t = useTranslations('vitrail.entete')
  const tc = useTranslations('commun')
  const org = useOrg()
  const money = useMoney()
  const ordinal = useOrdinal()
  const tag = INTL_TAG[useLocale() as Locale]
  const [query, setQuery] = useState('')
  const q = query.trim().toLocaleLowerCase(tag)
  const results = q ? ranked.filter(p => p.name?.toLocaleLowerCase(tag).includes(q)).slice(0, 8) : []
  // L'organisme d'abord : son emblème et son nom ; Donivers, discret, dessous
  const brand = (
    <button onClick={onHome} style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#F4EFE6', background: 'none', border: 0, cursor: 'pointer', padding: 0, minWidth: 0, textAlign: 'left' }}>
      <Editable field="icon">
        <OrgMark size={32} />
      </Editable>
      <span style={{ display: 'grid', minWidth: 0, lineHeight: 1.1 }}>
        <Editable field="name">
          <span className="font-display" style={{ fontSize: mobile ? '16px' : '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name}</span>
        </Editable>
        <span style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{CONFIG.brand.name}</span>
      </span>
    </button>
  )
  // Où en est la collecte : objectif de l'événement en cours s'il y en a un, sinon le total
  const raised = goalCents > 0 ? eventCents : totalCents
  const pct = goalCents > 0 ? Math.min(100, (eventCents / goalCents) * 100) : 0
  const base: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, height: `${HEADER_HEIGHT}px`, background: 'rgba(6,6,10,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1000 }

  if (mobile) {
    return (
      <>
        <header style={{ ...base, padding: '0 16px', gap: 8 }}>
          {brand}
          <button onClick={onAbout} style={{ fontFamily: MONO, fontSize: '13px', whiteSpace: 'nowrap', background: 'none', border: 0, color: '#F4EFE6', padding: 0, display: 'grid', justifyItems: 'center', gap: 3 }}>
            <span style={{ fontWeight: 700, color: GOLD }}>{money(raised)}</span>
            {goalCents > 0 && (
              <span style={{ width: 64, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: GOLD }} />
              </span>
            )}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {count > 0 && (
              <button onClick={() => setSearchOpen(true)} aria-label={t('rechercher')} style={{ width: 40, height: 40, background: 'none', border: 0, color: '#F4EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label={t('menu')} style={{ width: 40, height: 40, background: 'none', border: 0, color: '#F4EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? (
                  <>
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </header>
        {menuOpen && (
          <>
            {/* au-dessus de la barre de l'atelier (z 1200) tant que le menu est ouvert */}
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1290 }} />
            <nav style={{ position: 'fixed', top: HEADER_HEIGHT, right: 0, left: 0, zIndex: 1300, background: 'rgba(6,6,10,0.98)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '8px 16px 16px', display: 'grid', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 0' }}>{org.name}</span>
              <button onClick={onAbout} style={{ ...menuLink, background: 'none', border: 0, borderBottom: menuLink.borderBottom, textAlign: 'left' }}>
                {t('apropos')}
              </button>
              {org.url && (
                <a href={org.url} target="_blank" rel="noreferrer" style={menuLink}>
                  {t('siteWeb')}
                </a>
              )}
              <Link href="/don?src=vitrail" style={menuLink}>
                {t('pageDon')}
              </Link>
              <Link href="/confidentialite" style={menuLink}>
                {tc('confidentialiteCourt')}
              </Link>
              <Link href="/conditions" style={menuLink}>
                {tc('conditionsCourt')}
              </Link>
              <LanguageSwitch style={{ ...menuLink, display: 'block', width: '100%', textAlign: 'left', borderBottom: 0 }} />
            </nav>
          </>
        )}
        {searchOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(6,6,10,0.97)', padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t('chercher')} style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: '#0B0A12', color: '#F4EFE6', fontSize: 16, fontFamily: MONO }} />
              <button
                onClick={() => {
                  setSearchOpen(false)
                  setQuery('')
                }}
                style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.7)', fontSize: 14 }}
              >
                {t('annuler')}
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSearchOpen(false)
                    setQuery('')
                    onPick(p.id)
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', background: 'none', border: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#F4EFE6', textAlign: 'left', fontSize: 15 }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{ordinal(p.rank)}</span>
                </button>
              ))}
              {q && results.length === 0 && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 4px' }}>{t('personne')}</p>}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <header style={{ ...base, padding: '0 24px' }}>
      <div style={{ flex: '1 1 0', minWidth: 'max-content', display: 'flex' }}>{brand}</div>
      <button onClick={onAbout} title={t('apropos')} style={{ flex: 'none', padding: '0 16px', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: '14px', letterSpacing: '0.02em', background: 'none', border: 0, color: '#F4EFE6', cursor: 'pointer', display: 'grid', justifyItems: 'center', gap: 5 }}>
        <span>
          <span style={{ fontWeight: 700, fontSize: '20px', color: GOLD }}>{money(raised)}</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', marginLeft: '8px' }}>{goalCents > 0 ? t('amassesSur', { montant: money(goalCents) }) : t('amasses')}</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', margin: '0 8px' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{t('donateurs', { count })}</span>
        </span>
        {goalCents > 0 && (
          <span style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: GOLD }} />
          </span>
        )}
      </button>
      <nav style={{ flex: '1 1 0', minWidth: 'max-content', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
        <button onClick={onAbout} style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', background: 'none', border: 0, cursor: 'pointer', marginRight: 16 }}>
          {t('apropos')}
        </button>
        {org.url && (
          <a href={org.url} target="_blank" rel="noreferrer" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>
            {org.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
          </a>
        )}
        <LanguageSwitch style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginLeft: 16 }} />
        {claimLabel && (
          <button
            type="button"
            onClick={onClaim}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '9px 18px', marginLeft: '12px', background: GOLD, color: '#1A1208', border: 0, borderRadius: '999px', fontFamily: "'DM Sans', sans-serif", fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 6px 24px rgba(240,178,74,0.22)' }}
          >
            {claimLabel}
          </button>
        )}
      </nav>
    </header>
  )
}
const menuLink: React.CSSProperties = { padding: '12px 0', color: '#F4EFE6', textDecoration: 'none', fontSize: 15, borderBottom: '1px solid rgba(255,255,255,0.06)' }

// ═════════════════════════════════ Colonne de gauche (ordinateur) ═════════════════════════════════
function SideButton({ bottom, gold, color, onClick, title, children }: { bottom: number; gold?: boolean; color?: string; onClick: () => void; title?: string; children: React.ReactNode }) {
  const c = gold ? GOLD : color ?? '#fff'
  const bg = gold ? 'rgba(30, 24, 8, 0.92)' : 'rgba(6,6,10,0.9)'
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ position: 'fixed', bottom: `${bottom}px`, left: '24px', width: '220px', padding: '10px 16px', background: bg, border: `1px solid ${gold ? 'rgba(240,178,74,0.55)' : c}`, borderRadius: '8px', color: c, fontSize: gold ? '12.5px' : '12px', fontWeight: gold ? 700 : 400, fontFamily: MONO, cursor: 'pointer', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)', transition: 'background 0.2s' }}
      onMouseOver={e => (e.currentTarget.style.background = gold ? 'rgba(240,178,74,0.18)' : 'rgba(255,255,255,0.12)')}
      onMouseOut={e => (e.currentTarget.style.background = bg)}
    >
      {children}
    </button>
  )
}

function DesktopSearch({ ranked, bottom, onPick }: { ranked: RankedPiece[]; bottom: number; onPick: (id: string) => void }) {
  const t = useTranslations('vitrail.entete')
  const ordinal = useOrdinal()
  const tag = INTL_TAG[useLocale() as Locale]
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const needle = q.trim().toLocaleLowerCase(tag)
  const results = needle ? ranked.filter(p => p.name?.toLocaleLowerCase(tag).includes(needle)).slice(0, 5) : []
  const pick = (id: string) => {
    onPick(id)
    setQ('')
    setFocused(false)
    ref.current?.blur()
  }
  return (
    <div className="focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#F0B24A]" style={{ position: 'fixed', bottom: `${bottom}px`, left: '24px', width: '220px', background: 'rgba(6,6,10,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', zIndex: 100, boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={ref}
          type="text"
          placeholder={t('chercher')}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setQ('')
              ref.current?.blur()
            }
            if (e.key === 'Enter' && results.length > 0) pick(results[0].id)
          }}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#F4EFE6', fontSize: '12px', fontFamily: MONO }}
        />
      </div>
      {focused && results.length > 0 && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px', background: 'rgba(15,15,25,0.98)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 -4px 20px rgba(0,0,0,0.5)' }}>
          {results.map(p => (
            <button
              key={p.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(p.id)}
              style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#F4EFE6', fontSize: '12px', fontFamily: MONO, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{ordinal(p.rank)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '8px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '6px',
  color: 'rgba(255,255,255,0.7)',
  fontSize: '11px',
  fontFamily: MONO,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  transition: 'all 0.2s',
}
const hoverBtn = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => {
  e.currentTarget.style.background = on ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'
  e.currentTarget.style.color = on ? '#fff' : 'rgba(255,255,255,0.7)'
}
const ZoomOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
)
const ZoomInIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
)

/** Mini-carte de navigation (ordinateur) : on clique pour y aller, on fait glisser le cadre de la vue. */
function NavigationPanel({
  registerRect,
  polygons,
  onPanTo,
  getCam,
  onReset,
  onZoomIn,
  onZoomOut,
  onPrev,
  onNext,
}: {
  registerRect: (el: SVGRectElement | null) => void
  polygons: React.ReactNode
  onPanTo: (x: number, y: number) => void
  getCam: () => Cam
  onReset: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const tn = useTranslations('vitrail.nav')
  const mapW = 200
  const mapH = 120
  const scale = Math.min(mapW, mapH) / (BOUNDS * 2)
  const toWorld = (mx: number, my: number) => ({ x: (mx - mapW / 2) / scale, y: (my - mapH / 2) / scale })

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const cam = getCam()
    const start = { mx: e.clientX, my: e.clientY, camX: cam.x, camY: cam.y }
    // Clic hors du cadre : on y va tout de suite, puis on peut faire glisser
    const vw = (window.innerWidth / cam.zoom) * scale
    const vh = ((window.innerHeight - HEADER_HEIGHT) / cam.zoom) * scale
    const vx = mapW / 2 + cam.x * scale - vw / 2
    const vy = mapH / 2 + cam.y * scale - vh / 2
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    if (!(mx >= vx && mx <= vx + vw && my >= vy && my <= vy + vh)) {
      const p = toWorld(mx, my)
      onPanTo(p.x, p.y)
      start.camX = p.x
      start.camY = p.y
    }
    const move = (ev: MouseEvent) => onPanTo(start.camX + (ev.clientX - start.mx) / scale, start.camY + (ev.clientY - start.my) / scale)
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: 'rgba(6,6,10,0.9)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', zIndex: 100, boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ padding: '10px' }}>
        <svg width={mapW} height={mapH} style={{ cursor: 'grab', display: 'block', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }} onMouseDown={onMouseDown}>
          <g transform={`translate(${mapW / 2} ${mapH / 2}) scale(${scale})`}>{polygons}</g>
          <rect ref={registerRect} data-w={mapW} data-h={mapH} fill="rgba(255,255,255,0.15)" stroke="#fff" strokeWidth={1.5} rx={2} />
        </svg>
      </div>
      <div style={{ padding: '0 10px 6px 10px', display: 'flex', gap: '6px' }}>
        <button onClick={onReset} style={{ ...navBtn, flex: 1 }} onMouseOver={e => hoverBtn(e, true)} onMouseOut={e => hoverBtn(e, false)}>
          <span>⌂</span>
          <span>{tn('toutVoir')}</span>
        </button>
        <button onClick={onZoomOut} style={{ ...navBtn, width: '36px', padding: '8px 0' }} onMouseOver={e => hoverBtn(e, true)} onMouseOut={e => hoverBtn(e, false)} title={tn('dezoomer')}>
          <ZoomOutIcon />
        </button>
        <button onClick={onZoomIn} style={{ ...navBtn, width: '36px', padding: '8px 0' }} onMouseOver={e => hoverBtn(e, true)} onMouseOut={e => hoverBtn(e, false)} title={tn('zoomer')}>
          <ZoomInIcon />
        </button>
      </div>
      <div style={{ padding: '0 10px 10px 10px', display: 'flex', gap: '6px' }}>
        <button onClick={onPrev} style={{ ...navBtn, flex: 1 }} onMouseOver={e => hoverBtn(e, true)} onMouseOut={e => hoverBtn(e, false)} title={tn('plusGrand')}>
          <span>{tn('prec')}</span>
        </button>
        <button onClick={onNext} style={{ ...navBtn, flex: 1 }} onMouseOver={e => hoverBtn(e, true)} onMouseOut={e => hoverBtn(e, false)} title={tn('plusPetit')}>
          <span>{tn('suiv')}</span>
        </button>
      </div>
    </div>
  )
}

/** Mini-carte du téléphone : visuelle, avec les boutons de zoom au-dessus (en bas à droite). */
function MobileMinimap({ registerRect, polygons, onZoomIn, onZoomOut }: { registerRect: (el: SVGRectElement | null) => void; polygons: React.ReactNode; onZoomIn: () => void; onZoomOut: () => void }) {
  const tn = useTranslations('vitrail.nav')
  const mapW = 80
  const mapH = 60
  const scale = Math.min(mapW, mapH) / (BOUNDS * 2)
  const btn: React.CSSProperties = { width: '36px', height: '36px', background: 'rgba(6,6,10,0.9)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  return (
    <div style={{ position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom))', right: '16px', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px', width: `${mapW}px` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onZoomOut} style={btn} aria-label={tn('dezoomer')}>
          <ZoomOutIcon />
        </button>
        <button onClick={onZoomIn} style={btn} aria-label={tn('zoomer')}>
          <ZoomInIcon />
        </button>
      </div>
      <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <svg width={mapW} height={mapH} style={{ background: 'rgba(6,6,10,0.9)', display: 'block' }}>
          <g transform={`translate(${mapW / 2} ${mapH / 2}) scale(${scale})`}>{polygons}</g>
          <rect ref={registerRect} data-w={mapW} data-h={mapH} fill="rgba(255,255,255,0.15)" stroke="#fff" strokeWidth={1} rx={1} />
        </svg>
      </div>
    </div>
  )
}
