'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import MiniGlass from '@/components/MiniGlass'
import { GLASS_COLORS } from '@/lib/config'
import type { Piece } from '@/lib/types'

// Le vrai rendu du vitrail (le même que sur la page d'un organisme), avec des morceaux fictifs et anonymes :
// un nouveau morceau s'ajoute toutes les quelques secondes. Le vitrail de démonstration complet (noms, témoignages,
// photos) le remplacera plus tard.

const AMOUNTS = [1000, 1500, 2000, 2500, 2500, 3000, 4000, 5000, 5000, 7500, 10000, 15000, 25000, 50000]

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

const START = 48
const MAX = 120

export default function HeroGlass() {
  const t = useTranslations('plateforme.hero')
  const [pieces, setPieces] = useState<Piece[]>(() => makePieces(START))
  const [size, setSize] = useState(420)

  useEffect(() => {
    const fit = () => setSize(Math.max(260, Math.min(460, window.innerWidth - 48)))
    fit()
    window.addEventListener('resize', fit)
    // Respecter « réduire les animations » : le vitrail reste fixe
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => window.removeEventListener('resize', fit)
    const id = setInterval(() => {
      if (document.hidden) return
      setPieces(p => (p.length >= MAX ? makePieces(START) : [...p, ...makePieces(1, p.length)]))
    }, 3200)
    return () => {
      clearInterval(id)
      window.removeEventListener('resize', fit)
    }
  }, [])

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
