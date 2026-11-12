'use client'

// L'arrivée d'un morceau dans le vitrail : « 123e morceau », « Dans le vitrail depuis le 4 décembre 2026 ».
// Paliers (1er, 10e, 50e, 100e…) : pastille ambre avec ✦. Jamais de rang par montant.

import { useLocale, useTranslations } from 'next-intl'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { isMilestone } from '@/lib/arrival'
import { useOrdinal } from '@/lib/useI18n'
import type { RankedPiece } from './types'

export const AMBRE = '#F0B24A'
const MONO = "'DM Sans', sans-serif"

/** « 4 décembre 2026 » (« 1er décembre » en français) / « December 4, 2026 », à l'heure du Québec. */
export function useSinceDate(): (iso: string) => string {
  const locale = useLocale() as Locale
  return iso => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const parts = new Intl.DateTimeFormat(INTL_TAG[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' }).formatToParts(d)
    return parts.map(p => (locale === 'fr' && p.type === 'day' && p.value === '1' ? '1er' : p.value)).join('')
  }
}

/** Le texte de la pastille : « 123e morceau », « Premier morceau du vitrail », « Votre morceau · 123e ». */
export function useArrivalLabel(): (piece: RankedPiece, own: boolean) => { text: string; milestone: boolean } {
  const t = useTranslations('vitrail.fiche')
  const ordinal = useOrdinal()
  return (piece, own) => {
    const n = piece.arrival
    const milestone = isMilestone(n)
    if (own) return { text: t('arriveeVotre', { rang: ordinal(n) }), milestone }
    if (n === 1) return { text: t('arriveePremier'), milestone }
    return { text: t(milestone ? 'arriveePalier' : 'arrivee', { rang: ordinal(n) }), milestone }
  }
}

/** La pastille d'arrivée, à la couleur du morceau (ambre et ✦ pour un palier). */
export function ArrivalBadge({ piece, own, small = false }: { piece: RankedPiece; own: boolean; small?: boolean }) {
  const label = useArrivalLabel()(piece, own)
  const c = label.milestone ? AMBRE : piece.color
  return (
    <span
      style={{
        display: 'inline-block',
        padding: small ? '2px 8px' : '4px 12px',
        background: `${c}22`,
        border: `1px solid ${c}${label.milestone ? '88' : '44'}`,
        borderRadius: '20px',
        fontFamily: MONO,
        fontSize: small ? '11px' : '12px',
        color: c,
        fontWeight: label.milestone ? 700 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {label.milestone && <span aria-hidden="true">✦ </span>}
      {label.text}
    </span>
  )
}
