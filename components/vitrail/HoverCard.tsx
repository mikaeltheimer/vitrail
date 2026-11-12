'use client'

// Aperçu au survol (ordinateur) : nom, photo, arrivée et message d'un morceau, sans cliquer.
// La position suit la souris directement dans le DOM : aucun rendu React à chaque mouvement.

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RankedPiece } from './types'
import { AMBRE, useArrivalLabel, useSinceDate } from './Arrival'
import { donorNameFamily } from '@/lib/fonts'

export function HoverCard({ piece }: { piece: RankedPiece | null }) {
  const t = useTranslations('vitrail.fiche')
  const tc = useTranslations('commun')
  const arrivalLabel = useArrivalLabel()
  const sinceDate = useSinceDate()
  const ref = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: -1000, y: -1000 })
  const [ready, setReady] = useState<RankedPiece | null>(null)
  // Petit délai : pas de carte qui clignote quand la souris traverse le vitrail
  useEffect(() => {
    if (!piece) return
    const id = setTimeout(() => setReady(piece), 200)
    return () => clearTimeout(id)
  }, [piece])
  const shown = piece && ready?.id === piece.id ? ready : null

  useEffect(() => {
    const place = () => {
      const el = ref.current
      if (!el) return
      const { x, y } = pos.current
      const w = el.offsetWidth
      const h = el.offsetHeight
      const left = x + 18 + w > window.innerWidth - 8 ? x - 18 - w : x + 18
      const top = Math.min(window.innerHeight - h - 8, Math.max(64, y + 14))
      el.style.transform = `translate(${left}px, ${top}px)`
    }
    const move = (e: MouseEvent) => {
      pos.current = { x: e.clientX, y: e.clientY }
      place()
    }
    window.addEventListener('mousemove', move, { passive: true })
    place()
    return () => window.removeEventListener('mousemove', move)
  }, [shown])

  if (!shown) return null
  const color = shown.color
  const label = arrivalLabel(shown, false)
  const milestone = label.milestone
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[160] flex gap-2.5 rounded-xl p-2.5"
      style={{ width: 260, background: 'rgba(12,10,18,0.93)', border: `1px solid ${color}55`, boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 18px ${color}22`, backdropFilter: 'blur(6px)' }}
    >
      {shown.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded-lg" style={{ background: `radial-gradient(circle at 45% 40%, #fff 0%, ${color} 28%, #0B0A12 100%)` }} />
      )}
      <div className="grid min-w-0 content-start gap-0.5">
        <div className="truncate text-sm font-bold" style={{ fontFamily: donorNameFamily() }}>{shown.name ?? tc('anonyme')}</div>
        <div className="text-xs" style={{ color: milestone ? AMBRE : 'rgba(255,255,255,0.6)' }}>
          {milestone && <span aria-hidden="true">✦ </span>}
          {label.text}
          {shown.since && ` · ${t('depuisCourt', { date: sinceDate(shown.since) })}`}
        </div>
        {shown.message && (
          <div className="text-xs italic" style={{ color: 'rgba(255,255,255,0.82)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            « {shown.message} »
          </div>
        )}
      </div>
    </div>
  )
}
