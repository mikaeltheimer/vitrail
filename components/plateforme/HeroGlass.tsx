'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import MiniGlass from '@/components/MiniGlass'
import { GLASS_COLORS } from '@/lib/config'
import type { Piece } from '@/lib/types'

// Le vitrail de l'accueil : le rendu réel (le même que sur la page d'un organisme).
// Avec la démo (Fondation Pleine Lumière), sur un grand écran : l'écran de projection de la démo lui-même, intégré
// (/ecran?embed : le même cycle, sans encart d'appel ni QR). Sur téléphone, ou si le visiteur demande moins
// d'animations : le vitrail de la démo, dont les derniers dons sont rejoués un par un. Un clic ouvre la démo.
// Sans démo (base neuve) : des morceaux anonymes générés ici.

export interface HeroDemo {
  pieces: Piece[]
  /** Donateurs des derniers dons, du plus ancien au plus récent : ce sont eux qu'on rejoue. */
  replay: string[]
  url: string
  /** L'écran de projection de la démo (sans ?embed). */
  screenUrl: string
  name: string
}

/** Assez de place pour l'écran intégré (en dessous, le vitrail fixe suffit et ménage la batterie). */
const WIDE = '(min-width: 900px) and (prefers-reduced-motion: no-preference)'

/** Ajoute ?embed (ou &embed) à une adresse qui a peut-être déjà ?org= (prévisualisation). */
const embedUrl = (u: string) => `${u}${u.includes('?') ? '&' : '?'}embed`

const AMOUNTS = [1000, 1500, 2000, 2500, 2500, 3000, 4000, 5000, 5000, 7500, 10000, 15000, 25000, 50000]
const STEP_MS = 3200
const REST_MS = 9000

/** Suite pseudo-aléatoire fixe : le même vitrail à chaque visite (et au rendu serveur). */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function makePieces(n: number, start = 0): Piece[] {
  const rand = seeded(42 + start)
  return Array.from({ length: n }, (_, i) => ({
    id: `p${start + i}`,
    name: null,
    message: null,
    photoUrl: null,
    color: GLASS_COLORS[Math.floor(rand() * GLASS_COLORS.length)].value,
    amountCents: AMOUNTS[Math.floor(rand() * AMOUNTS.length)],
  }))
}

/** Les morceaux visibles après `shown` dons rejoués (les autres morceaux à rejouer sont retirés). */
function demoFrame(demo: HeroDemo, shown: number): Piece[] {
  const hidden = new Set(demo.replay.slice(shown))
  return demo.pieces.filter(p => !hidden.has(p.id))
}

export default function HeroGlass({ demo }: { demo?: HeroDemo | null }) {
  const t = useTranslations('plateforme.hero')
  const total = demo ? demo.replay.length : 0
  // Premier rendu : la démo sans ses derniers dons, qui s'ajoutent ensuite un par un
  const [pieces, setPieces] = useState<Piece[]>(() => (demo ? demoFrame(demo, 0) : makePieces(48)))
  const [size, setSize] = useState(420)
  const [wide, setWide] = useState(false)

  // Grand écran : l'écran intégré remplace le vitrail fixe (décidé après le premier rendu, côté navigateur)
  useEffect(() => {
    if (!demo) return
    const mq = window.matchMedia(WIDE)
    const update = () => setWide(mq.matches)
    const first = setTimeout(update, 0)
    mq.addEventListener('change', update)
    return () => {
      clearTimeout(first)
      mq.removeEventListener('change', update)
    }
  }, [demo])

  useEffect(() => {
    const fit = () => setSize(Math.max(260, Math.min(460, window.innerWidth - 48)))
    fit()
    window.addEventListener('resize', fit)
    // Respecter « réduire les animations » : le vitrail reste fixe et complet
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const full = setTimeout(() => demo && setPieces(demo.pieces), 0)
      return () => {
        clearTimeout(full)
        window.removeEventListener('resize', fit)
      }
    }
    let shown = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (document.hidden) {
        timer = setTimeout(tick, STEP_MS)
        return
      }
      if (demo) {
        if (shown >= total) {
          // Tout est rejoué : un temps de repos, puis on recommence
          shown = 0
          timer = setTimeout(() => {
            setPieces(demoFrame(demo, 0))
            timer = setTimeout(tick, STEP_MS)
          }, REST_MS)
          return
        }
        shown++
        setPieces(demoFrame(demo, shown))
      } else {
        setPieces(p => (p.length >= 120 ? makePieces(48) : [...p, ...makePieces(1, p.length)]))
      }
      timer = setTimeout(tick, STEP_MS)
    }
    timer = setTimeout(tick, STEP_MS)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', fit)
    }
  }, [demo, total])

  if (!demo) {
    return (
      <figure className="m-0 flex flex-col items-center gap-3" aria-label={t('illustration')}>
        <MiniGlass pieces={pieces} size={size} />
        <figcaption className="muted inline-flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: '#3DB5A6' }} aria-hidden="true" />
          {t('direct')}
        </figcaption>
      </figure>
    )
  }
  return (
    <figure className="m-0 flex w-full flex-col items-center gap-3">
      {wide ? (
        <div className="relative w-full max-w-[600px] overflow-hidden rounded-[20px] border" style={{ aspectRatio: '3 / 2', borderColor: 'rgba(244,239,230,0.12)', background: '#0B0A12' }}>
          <iframe src={embedUrl(demo.screenUrl)} title={t('demoEcran', { org: demo.name })} loading="lazy" className="pointer-events-none absolute inset-0 h-full w-full border-0" tabIndex={-1} />
          {/* Le cadre ne reçoit pas les clics : un clic ouvre la démo */}
          <a href={demo.url} target="_blank" rel="noreferrer" className="absolute inset-0" aria-label={t('demoOuvrir', { org: demo.name })} />
        </div>
      ) : (
        <a href={demo.url} target="_blank" rel="noreferrer" className="block rounded-full no-underline transition-transform hover:scale-[1.015]" aria-label={t('demoOuvrir', { org: demo.name })}>
          <MiniGlass pieces={pieces} size={size} />
        </a>
      )}
      <figcaption className="flex flex-col items-center gap-1 text-center text-sm">
        <span className="muted">
          <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: '#3DB5A6' }} aria-hidden="true" />
          {t('demoLegende', { org: demo.name })}
        </span>
        <a href={demo.url} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: '#F0B24A' }}>
          {t('demoExplorer')}
        </a>
      </figcaption>
    </figure>
  )
}
