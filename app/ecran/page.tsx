'use client'

// Écran de projection : la rosace du vitrail en ligne, en visite automatique.
// La caméra va d'un morceau à l'autre (au hasard, sans répétition avant que tous soient passés), le met en lumière,
// et une carte montre son contenu : photo, nom, message. Jamais de montant : la taille du verre en dit assez.
// Seuls les morceaux qui ont quelque chose à montrer (nom, photo ou message) entrent dans la visite (lib/stageDeck.ts).
// Un nouveau don passe en premier, quel que soit son contenu (un don anonyme sans rien d'autre : cette fois seulement).
// Grand écran (Mika, 25 nov. 2026) : un seul élément permanent, le code QR et la signature en bas à droite ; le reste
// alterne en trois temps, qui ne parlent chacun que d'une chose :
//   1. le vitrail entier et sa présentation (organisme, collecte, « chaque fragment est une personne qui a donné ») ;
//   2. « pourquoi donner » : le texte de l'organisme seul, en grand, le vitrail flouté derrière, le QR agrandi ;
//   3. les donateurs : une bande à gauche (grande photo, nom, témoignage) reste en place pendant toute la série, la
//      scène vit dans la partie droite ; d'un fragment au suivant, la caméra repasse par le vitrail entier sans s'y arrêter.
// Robuste pour un événement : dernier état gardé en mémoire, reprise après coupure, écran toujours allumé,
// rechargement périodique, plein écran au clic ou avec F, curseur caché.
// ?embed (l'aperçu de la démo sur l'accueil de la plateforme) : une miniature du grand écran, rendue à 1500 × 1000 px puis
// réduite par la page qui l'intègre, réduite au temps des donateurs : l'accueil montre que le vitrail est fait de
// donateurs, sans la présentation de la collecte ni « pourquoi donner » (Mika, 25 nov.). Sans code QR (signature seule
// dans le coin), interrogation lente, rien en mémoire locale, ni plein écran, ni écran tenu allumé.

import { publicLink } from '@/lib/links'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { useLocale, useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { DEFAULT_GLASSES, FALLBACK_GLASS } from '@/lib/theme'
import Signature from '@/components/Signature'
import EmptyVitrail from '@/components/vitrail/EmptyVitrail'
import { QUOTES, type Locale } from '@/i18n/config'
import { useOrg } from '@/lib/useOrg'
import { useMoney, useOrdinal, useSceneText } from '@/lib/useI18n'
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
import { useSinceDate } from '@/components/vitrail/Arrival'
import { isMilestone } from '@/lib/arrival'

const CACHE_KEY = 'vitrail:last-snapshot'
const RELOAD_MS = 6 * 60 * 60 * 1000
const FLY_MS = 2800
const HOLD_MS = 8000 // morceau avec nom, photo ou message
const HOLD_BARE_MS = 4500 // morceau anonyme
const READ_MS_PER_CHAR = 45 // témoignage : le temps de le lire (≈ 22 caractères par seconde, à 3 m de l'écran)
const READ_MAX_MS = 20000
/** Grand écran : largeur de la bande des donateurs (temps 3) ; la scène se cadre dans le reste, à droite. */
const BAND_W_EM = 36
// Pause du grand écran (temps 1 et 2 ; l'écran intégré n'en a pas) : à l'ouverture de l'écran, puis dès que
// CTA_EVERY_MS se sont écoulées depuis la dernière (mesuré en temps, pas en morceaux : un morceau dure de 5 à 30 s selon
// son témoignage), ou plus tôt quand un petit vitrail a déjà montré tous ses morceaux.
const CTA_EVERY_MS = 60_000
const PRES_MS = 9000 // grand écran, temps 1 : le vitrail et sa présentation
/** Grand écran, temps 2 : le temps de lire « pourquoi donner », 12 à 24 s selon sa longueur. */
const whyMs = (length: number) => Math.min(24_000, Math.max(12_000, 6000 + length * READ_MS_PER_CHAR))
// D'un morceau au suivant, la caméra repasse TOUJOURS par le vitrail entier, en un seul mouvement continu qui le
// traverse sans s'y arrêter (Mika, 25 nov.) ; au début d'une série, la plongée seule.
const IN_MS = 2600
const HOP_MS = 4400
const MAX_ZOOM = 40
// Mode intégré : interrogation espacée (rien ne change dans une démo)
const EMBED_POLL_MS = 60_000
/** Lu une fois côté navigateur, pour le moteur (hors rendu React). */
const isEmbed = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed')
const GOLD = '#F0B24A'
// Le code QR posé sur un éclat de verre : un quadrilatère un peu de travers, liseré des cinq verres de la palette, fond
// crème (le blanc pur faisait tache sur l'écran sombre). Le code (79 % de l'éclat, en 12 % / 10 %) tient entièrement dans
// le verre crème, à 3 % au moins de chaque bord du liseré : vérifié par le calcul, coin par coin (Mika, 25 nov.).
const QR_LIGHT = '#F4EFE6'
const QR_DARK = '#17141F'
const QR_SHARD = 'polygon(7% 0%, 100% 4.5%, 96.5% 100%, 0% 94%)'
const QR_RIM = `conic-gradient(from 210deg, ${['rose', 'ambre', 'jade', 'ciel', 'violet', 'rose'].map(id => DEFAULT_GLASSES.find(g => g.id === id)!.value).join(', ')})`
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
type Phase = 'vitrail' | 'pourquoi' | 'donateurs'
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
  /** Numéro et date d'arrivée : ce que la bande montre d'un donateur sans témoignage. */
  arrival: number | null
  since: string | null
}

export default function Ecran() {
  const embed = useSearchParams().has('embed')
  const t = useTranslations('ecran')
  const tf = useTranslations('vitrail.fiche')
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
  /** Le temps en cours (au départ, le vitrail : l'écran s'ouvre sur sa présentation ; l'aperçu, sur les donateurs, son seul temps). */
  const [phase, setPhase] = useState<Phase>(embed ? 'donateurs' : 'vitrail')
  const whyLength = useRef(0)
  useEffect(() => {
    whyLength.current = org.why.length
  }, [org.why])
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
    /** Arrivée sur le morceau en scène (performance.now) : il sort alors doucement du vitrail. */
    let spotAt = 0
    /** Grand écran, temps des donateurs : la scène se cadre à droite de la bande (sinon : centrée). */
    let besideBand = isEmbed()
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

    // La scène : tout l'écran ; au temps des donateurs du grand écran, la partie à droite de la bande
    const screenEm = () => Math.min(W * 0.011, H * 0.0195) // taille de police de l'écran (classe .tv)
    /** Bords gauche et droit de la scène, en px. */
    const sceneX = (): [number, number] => (besideBand ? [screenEm() * BAND_W_EM, W] : [0, W])
    const homeCam = (): Cam => {
      const [l, r] = sceneX()
      const zoom = Math.min(H * 0.88, (r - l) * (besideBand ? 0.86 : 0.62)) / 2 / UNIVERSE_RADIUS
      return { x: -((l + r) / 2 - W / 2) / zoom, y: 0, zoom }
    }
    const atHome = () => {
      const home = homeCam()
      return Math.abs(cam.zoom - home.zoom) < home.zoom * 1e-3 && Math.hypot(cam.x - home.x, cam.y - home.y) * cam.zoom < 1
    }

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

    /** Grand écran : la scène passe à côté de la bande des donateurs, ou revient au centre. */
    const frameBesideBand = (on: boolean) => {
      besideBand = on
      base = homeCam().zoom
    }

    /**
     * D'un morceau à l'autre en un seul mouvement qui traverse le vitrail entier (`via`) sans s'y arrêter : position et
     * zoom (en logarithme) suivent chacun une courbe qui passe par le vitrail entier à mi-parcours ; la vitesse y est au
     * plus haut, jamais nulle. `onMid` : au passage.
     */
    const flyVia = (via: Cam, to: Cam, ms: number, onMid: () => void, onEnd: () => void) => {
      cancelAnimationFrame(anim)
      const from = { ...cam }
      // Point de contrôle d'une courbe de Bézier quadratique qui passe exactement par `via` à mi-parcours
      const ctl = (a: number, m: number, b: number) => 2 * m - (a + b) / 2
      const lz = [Math.log(from.zoom), Math.log(via.zoom), Math.log(to.zoom)]
      const c = { x: ctl(from.x, via.x, to.x), y: ctl(from.y, via.y, to.y), z: ctl(lz[0], lz[1], lz[2]) }
      const bez = (a: number, m: number, b: number, e: number) => (1 - e) * (1 - e) * a + 2 * (1 - e) * e * m + e * e * b
      const t0 = performance.now()
      let midDone = false
      const step = (now: number) => {
        if (disposed) return
        const k = Math.min(1, (now - t0) / ms)
        const e = 0.5 - Math.cos(Math.PI * k) / 2
        cam = { x: bez(from.x, c.x, to.x, e), y: bez(from.y, c.y, to.y, e), zoom: Math.exp(bez(lz[0], c.z, lz[2], e)) }
        needs = true
        if (!midDone && k >= 0.5) {
          midDone = true
          onMid()
        }
        if (k < 1) anim = requestAnimationFrame(step)
        else onEnd()
      }
      anim = requestAnimationFrame(step)
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
     * Mise en scène d'un morceau : il se pose au milieu de la scène, à droite de la bande des donateurs (qui porte les
     * mots ; le morceau porte la photo), un peu moins haut que l'écran pour laisser respirer le coin du QR.
     */
    const stageLayout = (tile: Tile): Cam => {
      const em = screenEm()
      const regionL = sceneX()[0] + em * 3
      const regionR = W - em * 4
      const sx = (regionL + regionR) / 2
      const halfW = Math.max(W * 0.08, (regionR - regionL) / 2)
      const halfH = H * 0.34
      const [x0, y0, x1, y1] = tile.bbox
      const [lx, ly] = tile.labelCenter
      const ex = Math.max(lx - x0, x1 - lx, 1e-6)
      const ey = Math.max(ly - y0, y1 - ly, 1e-6)
      const zoom = Math.min(base * MAX_ZOOM, Math.max(base * 1.2, Math.min((halfW * 0.92) / ex, (halfH * 0.92) / ey)))
      return { x: lx - (sx - W / 2) / zoom, y: ly, zoom }
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
      spotAt = 0
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
      // La légende reste jusqu'au passage par le vitrail entier (la bande ne se vide pas d'un coup)
      if (!besideBand) hideCard()
      spot = null
      spotAt = 0
      needs = true
      // Pause d'appel : retour au vitrail entier (les nouveaux dons passent avant). Elle vient après CTA_EVERY morceaux,
      // ou plus tôt quand tous les morceaux ont déjà été montrés dans ce cycle (petit vitrail)
      // Seuls les morceaux admissibles comptent : un petit vitrail revient à la pause dès qu'il les a tous montrés,
      // et un vitrail sans aucun morceau à montrer reste sur la pause
      const unseen = [...tiles.keys()].some(id => eligible(id) && !cycleSeen.has(id))
      const pending = priority.some(id => tiles.has(id))
      const nothing = !pending && !unseen && eligibleCount() === 0
      const due = performance.now() - lastCtaAt >= CTA_EVERY_MS || nothing
      // Aperçu de l'accueil : jamais de pause, les donateurs seulement ; quand tout a été vu, un nouveau tour commence
      // (rien à montrer : le vitrail entier, puis on réessaie)
      if (isEmbed()) {
        if (nothing) {
          hideCard()
          stage = null
          flyTo(homeCam(), atHome() ? 1 : FLY_MS, 0, () => {
            timer = setTimeout(next, 5000)
          })
          return
        }
        if (hops > 0 && !unseen) {
          hops = 0
          cycleSeen.clear()
        }
      } else if ((due || (hops > 0 && !unseen)) && !pending) {
        hops = 0
        cycleSeen.clear()
        // Fin de la série : la bande s'en va, la scène revient au centre ; temps 1 (le vitrail) puis temps 2 (pourquoi)
        hideCard()
        stage = null
        frameBesideBand(false)
        setPhase('vitrail')
        flyTo(homeCam(), atHome() ? 1 : FLY_MS, 0, () => {
          timer = setTimeout(() => {
            if (disposed) return
            setPhase('pourquoi')
            timer = setTimeout(() => {
              if (disposed) return
              lastCtaAt = performance.now()
              frameBesideBand(true)
              setPhase('donateurs')
              next()
            }, whyMs(whyLength.current))
          }, PRES_MS)
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
      const lay = stageLayout(tile)
      const color = p?.color ?? FALLBACK_GLASS
      // Plongée vers le morceau ; dès son départ, le morceau visé perd ses étiquettes : il arrive « nu », sa légende prend le relais
      const dive = (after: () => void) => {
        stage = id
        needs = true
        flyTo(lay, IN_MS, 0, after)
      }
      // Un seul mouvement à travers le vitrail entier ; au passage, l'ancienne légende s'efface et le morceau visé perd ses
      // étiquettes (au début d'une série, depuis le vitrail entier : la plongée seule)
      const go = (after: () => void) => {
        if (atHome()) return dive(after)
        stage = null
        flyVia(homeCam(), lay, HOP_MS, () => {
          hideCard()
          stage = id
        }, after)
      }
      go(() => {
        spot = id
        spotAt = performance.now()
        needs = true
        setCardOut(false)
        setCard({ key: `${id}-${Date.now()}`, id, fresh: isFresh, name: p?.name ?? null, message, question: message ? p?.question ?? null : null, color, photoUrl: p?.photoUrl ?? null, arrival: p?.arrival ?? null, since: p?.since ?? null })
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
          timer = setTimeout(next, isEmbed() ? 1200 : 3000)
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
        const lift = spotAt ? 0.5 - Math.cos(Math.PI * Math.min(1, (now - spotAt) / 900)) / 2 : 0
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
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
    QRCode.toDataURL(url, { margin: 2, width: 640, errorCorrectionLevel: 'M', color: { dark: QR_DARK, light: QR_LIGHT } })
      .then(d => {
        setQr(d)
        setTarget(base.replace(/^https?:\/\//, ''))
      })
      .catch(() => setQr(null))
  }, [showcase])

  // ── Écran toujours allumé, curseur caché, plein écran ──
  useEffect(() => {
    // Aperçu de l'accueil : ni écran tenu allumé, ni curseur caché, ni plein écran (c'est la page du visiteur)
    if (isEmbed()) return
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

  const ordinal = useOrdinal()
  const sinceDate = useSinceDate()
  /** Ce que la bande montre d'un donateur sans témoignage : « 142e fragment », « Dans le vitrail depuis le … ». */
  const arrivalText = (n: number) => (n === 1 ? tf('arriveePremier') : tf(isMilestone(n) ? 'arriveePalier' : 'arrivee', { rang: ordinal(n) }))
  const big = phase === 'pourquoi'
  const band = phase === 'donateurs'
  const empty = !!snap && count === 0

  return (
    <main
      className={`tv fixed inset-0 overflow-hidden ${idle && !embed ? 'tv-hide-cursor' : ''}`}
      onClick={toggleFullscreen}
      style={{ background: '#0B0A12' }}
    >
      {/* Temps 2 : le vitrail flouté et assombri derrière « pourquoi donner » */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ filter: big ? 'blur(10px) brightness(0.38)' : 'none', transform: big ? 'scale(1.03)' : 'none', transition: 'filter 1.4s ease, transform 1.4s ease' }}
      />

      {/* Vitrail vide : le même disque que la page (verre clair, fragment lumineux) ; le texte est dans la présentation,
          en haut à gauche */}
      {empty && (
        <div className="absolute" style={{ inset: '2em 0', zIndex: 0 }}>
          <EmptyVitrail disc={0.86} />
        </div>
      )}
      {/* Temps 1 : le vitrail et sa présentation, en haut à gauche, sur un voile sombre (le verre clair peut passer
          dessous). Vitrail vide : le titre dit qu'il attend son premier don, en permanence. */}
      {(phase === 'vitrail' || empty) && (
        <div className="tv-banner-in pointer-events-none absolute inset-0">
          <div className="absolute left-0 top-0" style={{ width: '48em', height: '36em', background: 'radial-gradient(ellipse at top left, rgba(11,10,18,0.95) 0%, rgba(11,10,18,0.8) 45%, rgba(11,10,18,0) 75%)' }} />
          <div className="absolute" style={{ left: '2.4em', top: '2em', width: '24em' }}>
            <OrgLogo style={{ width: '12em', display: 'block' }} nameStyle={{ fontSize: '1.6em' }} />
            <div className="font-display" style={{ fontSize: '2.6em', marginTop: '0.4em', lineHeight: 1.05 }}>{org.vitrailTitle}</div>
            {/* Compteur masqué tant qu'il n'y a aucun don (Mika, 17 nov.) ; montant masqué par l'organisme : le nombre de donateurs seul */}
            {count > 0 && (
              <div style={{ marginTop: '0.9em', fontFamily: MONO, fontSize: '1.2em', color: 'rgba(255,255,255,0.7)' }}>
                {snap?.showTotal !== false && (
                  <>
                    <span style={{ fontWeight: 700, color: GOLD }}>{money(raised)}</span> {event && event.goalCents > 0 ? t('sur', { montant: money(event.goalCents) }) : t('amasses')} ·{' '}
                  </>
                )}
                {t('donateurs', { count })}
              </div>
            )}
            {pct > 0 && (
              <div style={{ height: '0.35em', borderRadius: '1em', background: 'rgba(255,255,255,0.12)', marginTop: '0.6em', overflow: 'hidden', width: '18em' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: GOLD, transition: 'width 1.5s ease' }} />
              </div>
            )}
            {/* Vitrail vide : « chaque fragment est une personne qui a donné » serait faux */}
            <div className="font-display" style={{ fontSize: '1.7em', lineHeight: 1.2, marginTop: '1.3em', color: 'rgba(244,239,230,0.92)' }}>{empty ? t('vide') : t('bandeauTitre')}</div>
            {empty && <div style={{ fontSize: '1.25em', lineHeight: 1.4, marginTop: '0.5em', color: GOLD, fontWeight: 600 }}>{t('videTexte')}</div>}
          </div>
        </div>
      )}

      {/* Temps 2 : « pourquoi donner », seul et en grand ; l'appel pointe vers le QR, agrandi */}
      {big && !empty && (
        <div className="tv-banner-in absolute" style={{ left: '5em', right: '24em', top: '50%', transform: 'translateY(-50%)' }}>
          <div style={{ fontSize: '1.15em', letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD }}>{t('pourquoiSurtitre', { nom: org.name })}</div>
          <div style={{ fontSize: org.why.length > 420 ? '1.6em' : org.why.length > 260 ? '1.95em' : '2.35em', lineHeight: 1.38, marginTop: '0.6em', fontWeight: 500, color: '#F4EFE6', whiteSpace: 'pre-line' }}>{org.why}</div>
          {/* L'appel pointe vers le QR : pas dans l'aperçu de l'accueil, qui n'en a pas */}
          {!embed && <div style={{ fontSize: '1.8em', fontWeight: 600, marginTop: '1em', color: GOLD }}>{showcase ? t('pourquoiAppelDemo') : t('pourquoiAppel')} →</div>}
        </div>
      )}

      {/* Temps 3 : la bande des donateurs, en place pendant toute la série ; d'un donateur à l'autre, seul son contenu
          change (il s'efface au passage par le vitrail entier, le suivant apparaît à l'arrivée sur son fragment).
          Jamais de montant ; la photo entière, en grand (dans le verre, elle est rognée par la forme). */}
      {band && (
        <div className="tv-banner-in absolute left-0 top-0 bottom-0" style={{ width: `${BAND_W_EM}em`, background: 'linear-gradient(90deg, #0B0A12 86%, rgba(11,10,18,0))', padding: '2.4em 3.6em 2.4em 2.8em', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {card && (
            <div key={card.key} className={cardOut ? 'tv-banner-out' : 'tv-banner-in'}>
              {card.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.photoUrl}
                  alt=""
                  style={{ width: (card.message?.length ?? 0) > 200 ? '13em' : '21em', aspectRatio: '1', objectFit: 'cover', borderRadius: '1em', display: 'block', marginBottom: '1.4em', boxShadow: `0 0 0 0.18em ${card.color}aa, 0 1em 2.4em rgba(0,0,0,0.55)` }}
                />
              )}
              {/* « Merci à » seulement devant un nom ; un don anonyme se présente seul (« Un don anonyme ») */}
              {(card.fresh || card.name) && (
                <div style={{ fontSize: '1em', letterSpacing: '0.2em', textTransform: 'uppercase', color: card.fresh ? GOLD : 'rgba(244,239,230,0.6)', marginBottom: '0.25em' }}>{card.fresh ? t('vientDeDonner') : t('merciA')}</div>
              )}
              <div style={{ fontFamily: donorNameFamily(), fontSize: card.name ? '3em' : '2.6em', fontWeight: donorNamesSerif() ? 500 : 600, lineHeight: 1.08, ...(card.photoUrl ? {} : { borderLeft: `0.12em solid ${card.color}`, paddingLeft: '0.35em' }) }}>
                {card.name ?? t('donAnonyme')}
              </div>
              {card.message ? (
                <>
                  {card.question && <div style={{ marginTop: '1.3em', fontSize: '1em', letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1.35, color: 'rgba(244,239,230,0.6)', textWrap: 'balance' }}>{card.question}</div>}
                  <div style={{ marginTop: card.question ? '0.4em' : '1.1em', fontSize: card.message.length > 340 ? '1.3em' : card.message.length > 140 ? '1.65em' : '2.1em', lineHeight: 1.36, color: 'rgba(244,239,230,0.96)' }}>
                    {`${QUOTES[locale][0]}${card.message}${QUOTES[locale][1]}`}
                  </div>
                </>
              ) : (
                // Sans témoignage (don anonyme, nom seul) : son numéro et sa date d'arrivée, comme sur sa fiche
                card.arrival && (
                  <div style={{ marginTop: '1.2em', fontSize: '1.4em', lineHeight: 1.45, color: 'rgba(244,239,230,0.75)' }}>
                    <div style={{ color: isMilestone(card.arrival) ? GOLD : undefined, fontWeight: isMilestone(card.arrival) ? 600 : 400 }}>
                      {isMilestone(card.arrival) && <span aria-hidden="true">✦ </span>}
                      {arrivalText(card.arrival)}
                    </div>
                    {card.since && <div>{tf('depuis', { date: sinceDate(card.since) })}</div>}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Le seul élément permanent, en bas à droite : le code QR posé sur un éclat de verre (agrandi et illuminé au temps
          2), sa légende, l'adresse et la signature de Donivers, centrées dessous (toujours plus petite que l'organisme ; pas
          de lien : c'est un écran). L'état (démonstration, connexion perdue) se range au-dessus, dans le même coin.
          Le code reste en carrés foncés sur fond clair, avec sa marge : les points ronds et le code inversé (clair sur
          sombre) se lisaient mal à l'essai (Mika, 25 nov.). */}
      {/* Aperçu de l'accueil : rien dans ce coin, ni QR, ni voile, ni signature (Mika, 25 nov. ; un clic sur l'aperçu
          ouvre la démo) */}
      {!embed && (
        <>
      {/* Voile sombre derrière le coin : la légende reste lisible quand du verre clair et des noms passent dessous */}
      <div className="pointer-events-none absolute right-0 bottom-0" style={{ width: '30em', height: '24em', background: 'radial-gradient(ellipse at 75% 100%, rgba(11,10,18,0.9) 0%, rgba(11,10,18,0.7) 40%, rgba(11,10,18,0) 72%)' }} />
      <div className="absolute" style={{ right: '2.4em', bottom: '1.8em', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7em', textAlign: 'center' }}>
        {snap?.showcase && <div style={{ background: GOLD, color: '#1A1208', fontWeight: 700, padding: '0.3em 0.8em', borderRadius: '0.6em', fontSize: '0.85em', maxWidth: '17em' }}>{t('demonstration')}</div>}
        {snap?.mode === 'demo' && <div style={{ background: GOLD, color: '#1A1208', fontWeight: 700, padding: '0.3em 0.8em', borderRadius: '0.6em', fontSize: '0.85em', maxWidth: '17em' }}>{t('demo')}</div>}
        {!online && <div className="muted" style={{ fontSize: '0.85em', maxWidth: '17em' }}>{t('horsLigne')}</div>}
        <div style={{ position: 'relative', width: big ? '18.4em' : '14.7em', aspectRatio: '1', transition: 'width 1s ease', filter: big ? 'drop-shadow(0 0 1.6em rgba(240,178,74,0.55))' : 'drop-shadow(0 0 1em rgba(240,178,74,0.22)) drop-shadow(0 1em 2em rgba(0,0,0,0.5))' }}>
          <div style={{ position: 'absolute', inset: 0, clipPath: QR_SHARD, background: QR_RIM }} />
          <div style={{ position: 'absolute', inset: '2.5%', clipPath: QR_SHARD, background: QR_LIGHT }} />
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t('qrAlt')} style={{ position: 'absolute', left: '12%', top: '10%', width: '79%', display: 'block' }} />
          ) : null}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: big ? '1.35em' : '1.15em', lineHeight: 1.2, color: '#F4EFE6', transition: 'font-size 1s ease' }}>{t('qrLegende')}</div>
          <div style={{ fontSize: '0.8em', opacity: 0.55, marginTop: '0.25em', wordBreak: 'break-all' }}>{target}</div>
        </div>
        <Signature height="1.4em" link={false} opacity={0.55} />
      </div>
        </>
      )}
      {!embed && <ScaleBadge style={{ left: '50%', top: 16, transform: 'translateX(-50%)' }} />}
    </main>
  )
}

/** Portrait de la carte : la photo si le donateur en a mis une, sinon sa pièce de verre telle qu'elle est dans le vitrail. */
