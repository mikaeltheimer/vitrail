'use client'

// Contenu de la fiche d'un morceau, commun au panneau (ordinateur) et à la feuille (téléphone).

import { useState } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/format'
import type { Tile } from '@/lib/tiling'
import { PiecePortrait } from './PiecePortrait'
import { ReportDialog } from './ReportDialog'
import { ShareDialog } from './ShareDialog'
import { ordinal, type RankedPiece } from './types'

export function PieceDetails({
  piece,
  tile,
  count,
  totalCents,
  own,
  compact,
}: {
  piece: RankedPiece
  tile: Tile | null
  count: number
  totalCents: number
  own: boolean
  compact: boolean
}) {
  const [share, setShare] = useState(false)
  const [report, setReport] = useState(false)
  const share100 = totalCents > 0 ? (piece.amountCents / totalCents) * 100 : 0
  const color = piece.color

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <div className={compact ? 'flex items-center gap-3' : 'flex flex-col items-center gap-4 text-center'}>
        <PiecePortrait id={piece.id} color={color} photoUrl={piece.photoUrl} tile={tile} size={compact ? 76 : piece.photoUrl ? 260 : 170} />
        <div className="min-w-0">
          <h2 className={`${compact ? 'text-lg' : 'text-2xl'} truncate font-bold`}>{piece.name ?? 'Donateur anonyme'}</h2>
          <span
            className="mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-medium"
            style={{ background: `${color}22`, border: `1px solid ${color}55`, color }}
          >
            {ordinal(piece.rank)} sur {count}
            {own ? ' · votre morceau' : ''}
          </span>
        </div>
      </div>

      {piece.message && (
        <p
          className={`${compact ? 'text-[0.95rem]' : 'text-lg'} leading-relaxed ${compact ? '' : 'text-center'}`}
          style={{ color, textShadow: `0 0 20px ${color}55` }}
        >
          « {piece.message} »
        </p>
      )}

      <div className={`${compact ? 'flex items-baseline justify-between' : 'text-center'} border-t pt-4`} style={{ borderColor: 'var(--line)' }}>
        <div>
          <div className="muted text-xs">A donné</div>
          <div className="text-2xl font-bold" style={{ color: '#ffe7a0' }}>
            {formatMoney(piece.amountCents)}
          </div>
        </div>
        <div className="muted text-xs">{share100 >= 0.1 ? `${share100.toLocaleString('fr-CA', { maximumFractionDigits: 1 })} % du vitrail` : 'moins de 0,1 % du vitrail'}</div>
      </div>

      <div className="flex gap-2">
        <button className="btn btn-ghost !py-3 text-sm" onClick={() => setShare(true)}>
          {own ? 'Partager mon morceau' : 'Partager'}
        </button>
        {own ? (
          <Link href="/?src=vitrail" className="btn !py-3 text-sm">
            L&apos;agrandir
          </Link>
        ) : (
          <button className="muted shrink-0 px-2 text-xs underline" onClick={() => setReport(true)}>
            Signaler
          </button>
        )}
      </div>

      {share && <ShareDialog id={piece.id} name={piece.name} own={own} onClose={() => setShare(false)} />}
      {report && <ReportDialog donorId={piece.id} onClose={() => setReport(false)} />}
    </div>
  )
}
