'use client'

// Écran de projection : la rosace du vitrail en ligne, en visite automatique.
// La caméra va d'un morceau à l'autre (au hasard, sans répétition avant que tous soient passés), le met en lumière,
// et une carte montre son contenu : photo, nom, message. Jamais de montant : la taille du verre en dit assez.
// Seuls les morceaux qui ont quelque chose à montrer (nom, photo ou message) entrent dans la visite (lib/stageDeck.ts).
// Un nouveau don passe en premier, quel que soit son contenu (un don anonyme sans rien d'autre : cette fois seulement) ; toutes les quelques visites, retour au vitrail entier avec un appel à donner.
// Robuste pour un événement : dernier état gardé en mémoire, reprise après coupure, écran toujours allumé,
// rechargement périodique, plein écran au clic ou avec F, curseur caché.
// ?embed (la démo dans la vitrine) : le même cycle dans un cadre, sans encart d'appel, sans QR ni en-tête, texte agrandi
// pour un petit cadre, interrogation lente, rien en mémoire locale ni plein écran.

import { publicLink } from '@/lib/links'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { useLocale, useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { FALLBACK_GLASS } from '@/lib/theme'
import Signature from '@/components/Signature'
import { QUOTES, type Locale } from '@/i18n/config'
import { useOrg } from '@/lib/useOrg'
import { useMoney, useSceneText } from '@/lib/useI18n'
import { donorNameFamily, donorNamesSerif } from '@/lib/fonts'
import { ensureFonts } from '@/lib/fonts'
import { Ambience, drawGlassTile, glassColors, type GlassColors } from '@/lib/glass'
import { ImageCache } from '@/lib/images'
import { drawScene, paintInitials, pieceMap, tilePieces, UNIVERSE_RADIUS, type PieceMap } from '@/lib/render'
import { hitTile, type Tile } from '@/lib/tiling'
import type { Piece, Snapshot } from '@/lib/types'
import { newScreenCode, SCREEN_CODE_RE, withDemoPieces, type ScreenPiece } from '@/lib/demoPieces'
import { buildTour, stageTier } from '@/lib/stageDeck'
import ScaleBadge from '@/components/ScaleBadge'
import { OrgLogo } from '@/components/OrgBrand'

const CACHE_KEY = 'vitrail:last-snapshot'
const RELOAD_MS = 6 * 60 * 60 * 1000
const FLY_MS = 2800
const HOLD_MS = 8000 // morceau avec nom, photo ou message
const HOLD_BARE_MS = 4500 // morceau anonyme
const READ_MS_PER_CHAR = 45 // témoignage : le temps de le lire (≈ 22 caractères par seconde, à 3 m de l'écran)
const READ_MAX_MS = 20000
const LONG_TEXT = 140 // au-delà, la carte s'élargit et le texte passe en mise en page « témoignage »
const CARD_EM = 28 // légende du morceau en scène (nom, témoignage)
const CARD_WIDE_EM = 34 // … pour un long témoignage
const isLong = (message: string | null | undefined) => (message?.length ?? 0) > LONG_TEXT
// Pause « Faites partie du vitrail » : à l'ouverture de l'écran, puis dès que CTA_EVERY_MS se sont écoulées depuis la
// dernière (mesuré en temps, pas en morceaux : un morceau dure de 5 à 30 s selon son témoignage), ou plus tôt quand un
// petit vitrail a déjà montré tous ses morceaux.
const CTA_EVERY_MS = 50_000
const CTA_MS = 11000
// D'un morceau au suivant, la caméra repasse TOUJOURS par le vitrail entier : recul, court arrêt, puis plongée
const OUT_MS = 1900
const HOME_PAUSE_MS = 700
const IN_MS = 2600
const MAX_ZOOM = 40
// Mode intégré : texte agrandi (le cadre est petit), interrogation espacée (rien ne change dans une démo)
const EMBED_SCALE = 1.6
const EMBED_POLL_MS = 60_000
/** Lu une fois côté navigateur, pour le moteur (hors rendu React). */
const isEmbed = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed')
const GOLD = '#F0B24A'
// Démonstration : code de séance de cet écran (écran jumelé, lib/demo-screen.ts). Les dons d'essai faits par son QR
// n'apparaissent que sur lui ; gardé dans l'onglet, il survit au rechargement périodique.
const SCREEN_KEY = 'vitrail:ecran-seance'
function screenCode(): string | null {
  if (isEmbed()) return null
  try {
    const kept = sessionStorage.getItem(SCREEN_KEY)
    if (kept && SCREEN_CODE_RE.test(kept)) return kept
    const code = newScreenCode()
    sessionStorage.setItem(SCREEN_KEY, code)
    return code
  } catch {
    return null
  }
}
/** Les dons d'essai de cet écran ; aucun si la lecture échoue (l'écran continue avec la démo seule). */
async function screenPieces(code: string): Promise<ScreenPiece[]> {
  try {
    const res = await fetch(`/api/demo/ecran?code=${code}`, { cache: 'no-store' })
    if (!res.ok) return []
    const { pieces } = (await res.json()) as { pieces?: ScreenPiece[] }
    return Array.isArray(pieces) ? pieces : []
  } catch {
    return []
  }
}
const MONO = "'DM Sans', sans-serif"

type Cam = { x: number; y: number; zoom: number }
interface Card {
  key: string
  id: string
  fresh: boolean
  name: string | null
  message: string | null
  /** La question à laquelle répond le témoignage (surtitre au-dessus des guillemets). */
  question: string | null
  color: string
  photoUrl: string | null
  /** Bord gauche de la légende, en px : juste à droite du morceau, qu'un fil relie à elle. */
  left: number
  wide: boolean
}

export default function Ecran() {
  const embed = useSearchParams().has('embed')
  const t = useTranslations('ecran')
  const tc = useTranslations('commun')
  const org = useOrg()
  const money = useMoney()
  const locale = useLocale() as Locale
  const sceneText = useSceneText()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const images = useMemo(() => new ImageCache(), [])
  const ambience = useMemo(() => new Ambience(), [])
  const engine = useRef<{ apply: (s: Snapshot) => void }>({ apply: () => {} })

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const showcase = !!snap?.showcase
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
    /** Morceau mis en scène (vraie photo, sans étiquette) : dès le départ du vol vers lui. */
    let stage: string | null = null
    /** Fil de lumière entre le morceau et sa légende, en px à l'écran (à la hauteur du centre de l'écran). */
    let link: { from: number; to: number; color: string; at: number; center: number } | null = null
    let liveScale = 1
    let ready = false
    // Moteur arrêté (démontage, double montage en développement) : plus aucune action, sinon deux visites
    // se disputeraient la carte et on verrait le nom d'un autre morceau pendant le vol
    let disposed = false

    // Visite
    const priority: string[] = []
    const fresh = new Set<string>() // morceaux d'un don tout neuf (annonce « vient de donner »)
    let deck: string[] = []
    let hops = 0
    /** Fin de la dernière pause d'appel (performance.now) ; -Infinity = jamais : l'écran s'ouvre sur elle. */
    let lastCtaAt = -Infinity
    // Les morceaux déjà montrés depuis la dernière pause d'appel : jamais deux fois le même dans un cycle
    // (un petit vitrail revient plus tôt à la pause, quand tous ses morceaux ont été vus)
    const cycleSeen = new Set<string>()
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
    const atHome = () => Math.abs(cam.zoom - base) < base * 1e-3 && Math.hypot(cam.x, cam.y) * cam.zoom < 1

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

    /**
     * Mise en scène d'un morceau : il se pose dans la partie gauche de l'écran, sa légende (nom, témoignage) juste à
     * droite, reliée à lui par un fil de lumière ; le code QR garde le coin en bas à droite. Le morceau porte la photo,
     * la légende porte les mots : rien n'est montré deux fois.
     */
    const stageLayout = (tile: Tile, wide: boolean): { cam: Cam; cardLeft: number; linkFrom: number; center: number } => {
      const embedded = isEmbed()
      const em = Math.min(W * 0.011, H * 0.0195) * (embedded ? EMBED_SCALE : 1) // taille de police de l'écran (classe .tv)
      const qrLeft = W - em * (2.4 + 14)
      const cardRight = embedded ? W - em * 1.6 : qrLeft - em * 1.5
      const cardLeft = cardRight - em * (wide ? CARD_WIDE_EM : CARD_EM)
      const regionL = em * 2.4
      const regionR = cardLeft - em * 4.5 // la place du fil
      const sx = (regionL + regionR) / 2
      const halfW = Math.max(W * 0.08, (regionR - regionL) / 2)
      const halfH = H * 0.4
      const [x0, y0, x1, y1] = tile.bbox
      const [lx, ly] = tile.labelCenter
      const ex = Math.max(lx - x0, x1 - lx, 1e-6)
      const ey = Math.max(ly - y0, y1 - ly, 1e-6)
      const zoom = Math.min(base * MAX_ZOOM, Math.max(base * 1.2, Math.min((halfW * 0.92) / ex, (halfH * 0.92) / ey)))
      const cam = { x: lx - (sx - W / 2) / zoom, y: ly, zoom }
      // Le fil part du bord droit du morceau, à la hauteur de son centre (là où il croise l'horizontale)
      let xi = -Infinity
      const poly = tile.poly
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i]
        const [bx, by] = poly[(i + 1) % poly.length]
        if ((ay - ly) * (by - ly) <= 0 && ay !== by) xi = Math.max(xi, ax + ((ly - ay) / (by - ay)) * (bx - ax))
      }
      if (!Number.isFinite(xi)) xi = x1
      return { cam, cardLeft, linkFrom: W / 2 + (xi - cam.x) * zoom, center: sx }
    }

    // Visite sans répétition : chaque morceau admissible passe une fois par tour, et jamais un morceau vu parmi les
    // derniers (même à la jointure de deux tours). Les rangs (photo et message, photo ou message, nom seul) sont
    // entrelacés régulièrement sur tout le tour ; les morceaux sans rien à montrer n'y entrent jamais.
    const recent: string[] = []
    /** Morceaux du vitrail qui ont quelque chose à montrer (nom, photo ou message). */
    const eligible = (id: string) => {
      const p = list.find(x => x.id === id)
      return !!p && tiles.has(id) && stageTier(p, CONFIG.showMessagesOnScreen) !== null
    }
    const eligibleCount = () => [...tiles.keys()].filter(eligible).length
    const remember = (id: string) => {
      recent.push(id)
      // La moitié du vitrail au plus : avec « tous sauf un », un petit vitrail rejouerait le tour précédent dans le même ordre
      const keep = Math.max(0, Math.min(12, Math.floor(eligibleCount() / 2)))
      while (recent.length > keep) recent.shift()
    }
    // pop() prend le dernier : le tour est rangé à l'envers
    const newDeck = (): string[] => buildTour(list.filter(p => tiles.has(p.id)), CONFIG.showMessagesOnScreen).reverse()
    const pickNext = (): string | null => {
      while (priority.length) {
        const id = priority.shift()!
        if (tiles.has(id)) {
          deck = deck.filter(d => d !== id) // un nouveau don passe en priorité, puis ne revient pas dans le même tour
          remember(id)
          return id
        }
      }
      deck = deck.filter(id => eligible(id) && !cycleSeen.has(id))
      if (!deck.length) deck = newDeck().filter(id => !cycleSeen.has(id))
      // Le prochain qui n'a pas été vu récemment (le début d'un nouveau tour peut retomber sur la fin du précédent)
      for (let i = deck.length - 1; i >= 0; i--) {
        if (!recent.includes(deck[i])) {
          const [id] = deck.splice(i, 1)
          remember(id)
          return id
        }
      }
      const id = deck.pop() ?? null
      if (id) remember(id)
      return id
    }

    const hideCard = () => {
      link = null
      needs = true
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
      stage = null
      needs = true
      // Pause d'appel : retour au vitrail entier (les nouveaux dons passent avant). Elle vient après CTA_EVERY morceaux,
      // ou plus tôt quand tous les morceaux ont déjà été montrés dans ce cycle (petit vitrail)
      // Seuls les morceaux admissibles comptent : un petit vitrail revient à la pause dès qu'il les a tous montrés,
      // et un vitrail sans aucun morceau à montrer reste sur la pause (ou, intégré, sur le vitrail entier)
      const unseen = [...tiles.keys()].some(id => eligible(id) && !cycleSeen.has(id))
      const pending = priority.some(id => tiles.has(id))
      const nothing = !pending && !unseen && eligibleCount() === 0
      const due = performance.now() - lastCtaAt >= CTA_EVERY_MS || nothing
      // Intégré : jamais d'encart d'appel ; quand tout a été vu, un nouveau tour commence simplement
      if (isEmbed() && nothing) {
        flyTo(homeCam(), atHome() ? 1 : FLY_MS, 0, () => {
          timer = setTimeout(next, 5000)
        })
        return
      }
      if (isEmbed() && hops > 0 && !unseen) {
        hops = 0
        cycleSeen.clear()
      } else if (!isEmbed() && (due || (hops > 0 && !unseen)) && !pending) {
        hops = 0
        cycleSeen.clear()
        flyTo(homeCam(), atHome() ? 1 : FLY_MS, 0, () => {
          setCta(true)
          timer = setTimeout(() => {
            setCta(false)
            lastCtaAt = performance.now()
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
      cycleSeen.add(id)
      const isFresh = fresh.has(id)
      fresh.delete(id)
      const p = list.find(x => x.id === id)
      const message = CONFIG.showMessagesOnScreen ? p?.message ?? null : null
      const wide = isLong(message)
      const lay = stageLayout(tile, wide)
      const color = p?.color ?? FALLBACK_GLASS
      // Plongée vers le morceau ; dès son départ, le morceau visé perd ses étiquettes : il arrive « nu », sa légende prend le relais
      const dive = (after: () => void) => {
        stage = id
        needs = true
        flyTo(lay.cam, IN_MS, 0, after)
      }
      // Recul jusqu'au vitrail entier, court arrêt (on le voit en entier), puis plongée
      const go = (after: () => void) =>
        atHome() ? dive(after) : flyTo(homeCam(), OUT_MS, 0, () => { timer = setTimeout(() => !disposed && dive(after), HOME_PAUSE_MS) })
      go(() => {
        spot = id
        needs = true
        setCardOut(false)
        setCard({ key: `${id}-${Date.now()}`, id, fresh: isFresh, name: p?.name ?? null, message, question: message ? p?.question ?? null : null, color, photoUrl: p?.photoUrl ?? null, left: lay.cardLeft, wide })
        link = { from: lay.linkFrom, to: lay.cardLeft, color, at: performance.now(), center: lay.center }
        const rich = !!(p?.name || p?.photoUrl || message)
        // Le temps de lire le témoignage en entier (et sa question)
        const question = message ? p?.question ?? '' : ''
        const reading = Math.min(READ_MAX_MS, ((message?.length ?? 0) + question.length) * READ_MS_PER_CHAR)
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
          const colorOf = (tile: Tile): GlassColors => glassColors(pieces.get(tile.id)?.color ?? FALLBACK_GLASS, tile.id)
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
          if (!isEmbed()) localStorage.setItem(CACHE_KEY, JSON.stringify(s))
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

      const key = [W, H, version, imageVersion, fontsVersion, stage].join('|')
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
          stageId: stage,
          text: sceneText,
        })
        layerCam = { ...cam }
        layerKey = key
        pl = placement()
      }
      ctx.drawImage(layer, pl.dx, pl.dy, lw * pl.k, lh * pl.k)

      // Lumière et cerclage de la rosace : sous le morceau en scène (qui sort du vitrail), jamais par-dessus
      if (level > 0.01) {
        ctx.globalAlpha = level
        ambience.drawFront(ctx, cx, cy, r, now, false)
        ctx.globalAlpha = 1
      }
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
        const info = pieces.get(tile.id)
        const color = info?.color ?? '#ffffff'
        const pulse = Math.sin(now / 420) * 0.5 + 0.5
        // Le morceau sort légèrement du vitrail et respire : il grandit et s'éclaire, puis revient, en boucle
        const breath = Math.sin(now / 700) * 0.5 + 0.5
        const lift = link ? 0.5 - Math.cos(Math.PI * Math.min(1, (now - link.at) / 900)) / 2 : 0
        const sc = 1 + lift * (0.045 + 0.04 * breath)
        const [gx, gy] = tile.labelCenter
        ctx.save()
        ctx.translate(gx, gy)
        ctx.scale(sc, sc)
        ctx.translate(-gx, -gy)
        if (lift > 0) {
          // Ombre portée : le morceau flotte au-dessus des autres
          ctx.save()
          ctx.shadowColor = 'rgba(0,0,0,0.75)'
          ctx.shadowBlur = (30 + 20 * lift) * dpr
          ctx.shadowOffsetY = 14 * lift * dpr
          ctx.fillStyle = '#050408'
          ctx.fill(tile.path)
          ctx.restore()
          const avatar = info?.photoUrl ? images.peek(info.photoUrl) : null
          drawGlassTile(ctx, tile, { colors: glassColors(color, tile.id), sizePx: tile.equivRadius * z * sc * 1.7725, zoom: z * sc, avatar, reveal: 1, dim: 1, hovered: false })
          if (!avatar) paintInitials(ctx, tile, info, z * sc)
        }
        {
          const gr = Math.max(tile.inRadius * 1.8, tile.equivRadius)
          const lightG = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr)
          lightG.addColorStop(0, hexA('#FFE2A8', 0.08 + 0.26 * breath))
          lightG.addColorStop(0.6, hexA(color, 0.04 + 0.14 * breath))
          lightG.addColorStop(1, hexA(color, 0))
          ctx.save()
          ctx.clip(tile.path)
          ctx.globalCompositeOperation = 'screen'
          ctx.fillStyle = lightG
          ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2)
          ctx.restore()
        }
        ctx.lineJoin = 'round'
        ctx.shadowColor = color
        ctx.shadowBlur = (24 + pulse * 22) * dpr
        ctx.strokeStyle = hexA(color, 0.4 + pulse * 0.3)
        ctx.lineWidth = 10 / (z * sc)
        ctx.stroke(tile.path)
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = GOLD
        ctx.lineWidth = 3 / (z * sc)
        ctx.stroke(tile.path)
        ctx.restore()
        liveScale = sc
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      // Le fil : du bord du morceau jusqu'à sa légende, dans la couleur du verre
      if (link && tile) {
        const a = Math.min(1, (now - link.at) / 700)
        const y = H / 2
        // Le fil suit le bord du morceau qui respire (agrandi autour de son centre, placé à l'écran en sx)
        const centerX = link.center
        const x0 = centerX + (link.from - centerX) * liveScale + 6
        const x1 = x0 + (link.to - x0) * (0.5 - Math.cos(Math.PI * a) / 2)
        const g = ctx.createLinearGradient(x0, y, link.to, y)
        g.addColorStop(0, hexA(link.color, 0.95))
        g.addColorStop(1, hexA(link.color, 0.35))
        ctx.save()
        ctx.shadowColor = link.color
        ctx.shadowBlur = 14
        ctx.strokeStyle = g
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x0, y)
        ctx.lineTo(x1, y)
        ctx.stroke()
        ctx.fillStyle = link.color
        ctx.beginPath()
        ctx.arc(x0, y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
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
     
  }, [images, ambience, sceneText])

  // ═════════════════════════════════ Données : toutes les 3 s, avec reprise ═════════════════════════════════
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let failures = 0
    try {
      const cached = isEmbed() ? null : localStorage.getItem(CACHE_KEY)
      if (cached) engine.current.apply(JSON.parse(cached) as Snapshot)
    } catch {}
    const tick = async () => {
      try {
        // Intégré en prévisualisation : l'organisme vient de l'adresse du cadre (?org), sans toucher au témoin du visiteur
        const org = new URLSearchParams(window.location.search).get('org')
        const res = await fetch(isEmbed() && org ? `/api/vitrail?org=${encodeURIComponent(org)}&embed` : '/api/vitrail', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        let s = (await res.json()) as Snapshot
        const code = s.showcase ? screenCode() : null
        if (code) s = withDemoPieces(s, await screenPieces(code))
        failures = 0
        if (!stopped) {
          setOnline(true)
          engine.current.apply(s)
        }
      } catch {
        failures++
        if (!stopped) setOnline(false)
      }
      const every = isEmbed() ? EMBED_POLL_MS : CONFIG.pollMs
      if (!stopped) timer = setTimeout(tick, failures ? Math.min(Math.max(30_000, every), every * 2 ** failures) : every)
    }
    void tick()
    const onOnline = () => {
      clearTimeout(timer)
      failures = 0
      void tick()
    }
    window.addEventListener('online', onOnline)
    const reload = isEmbed() ? undefined : setTimeout(() => window.location.reload(), RELOAD_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
      clearTimeout(reload)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // ── Code QR : le don sur place, dans le vitrail, provenance « ecran » ──
  useEffect(() => {
    // ?url= force une autre adresse (rare) ; sinon celle de l'organisme affiché
    const base = (new URLSearchParams(window.location.search).get('url') || window.location.origin).replace(/\/$/, '')
    // Démonstration : le QR porte le code de séance de cet écran, pour que les dons d'essai y apparaissent
    const code = showcase ? screenCode() : null
    const url = publicLink(`/vitrail?don&src=ecran${code ? `&ecran=${code}` : ''}`, new URLSearchParams(window.location.search).get('url'))
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#0b0a10', light: '#ffffff' } })
      .then(d => {
        setQr(d)
        setTarget(base.replace(/^https?:\/\//, ''))
      })
      .catch(() => setQr(null))
  }, [showcase])

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
    if (isEmbed()) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  const event = snap?.event ?? null
  const raised = event && event.goalCents > 0 ? event.totalCents : snap?.totalCents ?? 0
  const pct = event && event.goalCents > 0 ? Math.min(100, (event.totalCents / event.goalCents) * 100) : 0
  const count = snap?.pieces.length ?? 0

  const staged = !!card && !cta && !cardOut

  return (
    <main
      className={`tv fixed inset-0 overflow-hidden ${idle && !embed ? 'tv-hide-cursor' : ''}`}
      onClick={toggleFullscreen}
      style={{ background: '#0B0A12', ...(embed ? { fontSize: `min(${1.1 * EMBED_SCALE}vw, ${1.95 * EMBED_SCALE}vh)` } : {}) }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!embed && (
        <>
{/* Voile sombre derrière l'en-tête : il reste lisible même quand le verre clair passe dessous */}
      <div className="pointer-events-none absolute left-0 top-0" style={{ opacity: staged ? 0.35 : 1, transition: 'opacity 1.2s ease', width: '40em', height: '24em', background: 'radial-gradient(ellipse at top left, rgba(11,10,18,0.92) 0%, rgba(11,10,18,0.75) 40%, rgba(11,10,18,0) 72%)' }} />

      {/* École et collecte, en haut à gauche */}
      {/* Pendant une mise en scène, l'en-tête s'efface : le morceau peut passer dessous */}
      <div className="absolute" style={{ left: '2.4em', top: '2em', width: '22em', opacity: staged ? 0.25 : 1, transition: 'opacity 1.2s ease' }}>
        <OrgLogo style={{ width: '12em', display: 'block' }} nameStyle={{ fontSize: '1.6em' }} />
        <div className="font-display" style={{ fontSize: '2.3em', marginTop: '0.45em', lineHeight: 1.05 }}>{org.vitrailTitle}</div>
        <div style={{ marginTop: '0.9em', fontFamily: MONO }}>
          <span style={{ fontSize: '1.7em', fontWeight: 700, color: GOLD }}>{money(raised)}</span>
          <span style={{ fontSize: '1em', color: 'rgba(255,255,255,0.6)', marginLeft: '0.5em' }}>{event && event.goalCents > 0 ? t('sur', { montant: money(event.goalCents) }) : t('amasses')}</span>
        </div>
        {pct > 0 && (
          <div style={{ height: '0.35em', borderRadius: '1em', background: 'rgba(255,255,255,0.12)', marginTop: '0.5em', overflow: 'hidden', width: '18em' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: GOLD, transition: 'width 1.5s ease' }} />
          </div>
        )}
        <div style={{ fontFamily: MONO, fontSize: '0.95em', color: 'rgba(255,255,255,0.55)', marginTop: '0.5em' }}>
          {t('donateurs', { count })}
        </div>
      </div>

      {/* Signature de Donivers : en bas à gauche, en face du QR, sous le bloc de l'organisme (toujours plus petite que
          lui). Pas de lien : c'est un écran. S'efface comme l'en-tête pendant une mise en scène. */}
      <div className="absolute" style={{ left: '2.4em', bottom: '2.2em', opacity: staged ? 0.25 : 1, transition: 'opacity 1.2s ease' }}>
        <Signature height="1.6em" link={false} opacity={0.55} />
      </div>
        </>
      )}

      {/* La légende du morceau en scène : nom et témoignage, jamais de montant ; le morceau, lui, porte la photo */}
      {card && !cta && (
        <div key={card.key} style={{ position: 'absolute', left: card.left, top: '50%', transform: 'translateY(-50%)', width: `${card.wide ? CARD_WIDE_EM : CARD_EM}em`, maxHeight: '86vh' }}>
          <div
            className={cardOut ? 'tv-banner-out' : 'tv-banner-in'}
            style={{ padding: '1.7em 1.9em', borderRadius: '1.1em', background: 'rgba(11,10,18,0.94)', border: `1px solid ${card.color}55`, borderLeft: `0.3em solid ${card.color}`, boxShadow: `0 0 4em ${card.color}26, 0 1.5em 4em rgba(0,0,0,0.6)`, backdropFilter: 'blur(12px)' }}
          >
            {/* La photo entière, en vignette à côté du nom (dans le verre, elle est rognée par la forme) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.2em' }}>
              {card.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.photoUrl} alt="" style={{ width: card.wide ? '7em' : '8em', height: card.wide ? '7em' : '8em', objectFit: 'cover', borderRadius: '0.7em', flexShrink: 0, boxShadow: `0 0 0 0.15em ${card.color}88, 0 0.6em 1.6em rgba(0,0,0,0.5)` }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85em', letterSpacing: '0.18em', textTransform: 'uppercase', color: card.fresh ? GOLD : 'rgba(244,239,230,0.55)' }}>{card.fresh ? t('vientDeDonner') : t('merciA')}</div>
                <div style={{ fontFamily: donorNameFamily(), fontSize: card.wide ? '2.3em' : '2.6em', fontWeight: donorNamesSerif() ? 500 : 600, lineHeight: 1.08, marginTop: '0.3em' }}>{card.name ?? tc('anonyme')}</div>
              </div>
            </div>
            {/* La question à laquelle répond le témoignage : un surtitre, comme « Merci à » (la personne reste au premier plan) */}
            {card.message && card.question && (
              <div style={{ marginTop: '1.1em', fontSize: '0.85em', letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1.35, color: 'rgba(244,239,230,0.55)', textWrap: 'balance' }}>{card.question}</div>
            )}
            {card.message && (
              <div
                style={{
                  marginTop: card.question ? '0.35em' : '0.9em',
                  fontSize: card.message.length > 340 ? '1.12em' : card.wide ? '1.25em' : '1.45em',
                  lineHeight: 1.5,
                  color: 'rgba(244,239,230,0.95)',
                }}
              >
                {`${QUOTES[locale][0]}${card.message}${QUOTES[locale][1]}`}
              </div>
            )}
          </div>
        </div>
      )}

      {!embed && (
        <>
<ScaleBadge style={{ left: '50%', top: 16, transform: 'translateX(-50%)' }} />
        </>
      )}

      {/* Pause : appel à donner, au centre, le vitrail entier derrière */}
      {cta && (
        <div className="absolute" style={{ left: '50%', bottom: '3em', transform: 'translateX(-50%)', width: '40em', textAlign: 'center' }}>
          <div className="tv-banner-in" style={{ padding: '1.6em 2em', borderRadius: '1.4em', background: 'rgba(12,10,18,0.92)', border: '1px solid rgba(240,178,74,0.5)', boxShadow: '0 0 4em rgba(240,178,74,0.15)' }}>
            <div style={{ fontFamily: MONO, fontSize: '0.95em', letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD }}>{t('ctaSurtitre')}</div>
            <div className="font-display" style={{ fontSize: '2.5em', lineHeight: 1.1, marginTop: '0.35em' }}>{t('ctaTitre')}</div>
            {/* Le « pourquoi donner » de l'organisme, en entier : c'est lui qui prime (le même texte que sur le vitrail) */}
            <div style={{ fontSize: org.why.length > 240 ? '1.05em' : '1.25em', lineHeight: 1.45, marginTop: '0.6em', color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-line' }}>{org.why}</div>
            <div style={{ fontSize: '1.3em', fontWeight: 600, marginTop: '0.7em', color: GOLD }}>{t('ctaScan')}</div>
          </div>
        </div>
      )}

      {!embed && (
        <>
{/* Code QR, en bas à droite */}
      <div className="absolute text-center" style={{ right: '2.4em', bottom: '2.4em', width: '14em', background: '#fff', color: '#0b0a10', borderRadius: '1.2em', padding: '1em', boxShadow: cta ? '0 0 0 0.4em rgba(240,178,74,0.6)' : 'none', transition: 'box-shadow 0.6s' }}>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={t('qrAlt')} style={{ width: '100%', display: 'block' }} />
        ) : (
          <div style={{ aspectRatio: '1', background: '#eee' }} />
        )}
        <div style={{ fontWeight: 700, fontSize: '1.1em', marginTop: '0.5em', lineHeight: 1.2 }}>{snap?.showcase ? t('qrLegendeDemo') : t('qrLegende')}</div>
        <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '0.2em', wordBreak: 'break-all' }}>{target}</div>
      </div>

      {/* État */}
      <div className="absolute text-right" style={{ right: '2.4em', top: '2em', fontSize: '0.95em' }}>
        {snap?.showcase && <div style={{ background: GOLD, color: '#1A1208', fontWeight: 700, padding: '0.3em 0.8em', borderRadius: '0.6em', display: 'inline-block' }}>{t('demonstration')}</div>}
        {snap?.mode === 'demo' && <div style={{ background: GOLD, color: '#1A1208', fontWeight: 700, padding: '0.3em 0.8em', borderRadius: '0.6em', display: 'inline-block' }}>{t('demo')}</div>}
        {!online && <div className="muted" style={{ marginTop: '0.5em' }}>{t('horsLigne')}</div>}
      </div>
        </>
      )}

      {snap && count === 0 && (
        <div className="absolute text-center" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '24em' }}>
          <div style={{ fontSize: '1.9em', fontWeight: 600 }}>{t('vide')}</div>
          <div className="muted" style={{ fontSize: '1.2em', marginTop: '0.5em' }}>{t('videTexte')}</div>
        </div>
      )}
    </main>
  )
}

/** Portrait de la carte : la photo si le donateur en a mis une, sinon sa pièce de verre telle qu'elle est dans le vitrail. */
