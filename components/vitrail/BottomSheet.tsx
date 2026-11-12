'use client'

// Fiche d'un morceau sur téléphone : feuille en bas, à glisser vers le bas pour la fermer .

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Tile } from '@/lib/tiling'
import { PiecePortrait } from './PiecePortrait'
import { ReportDialog } from './ReportDialog'
import { ShareDialog } from './ShareDialog'
import type { RankedPiece } from './types'
import { donorNameFamily } from '@/lib/fonts'
import { ArrivalBadge, useSinceDate } from './Arrival'
import { reportStyle } from './DetailPanel'
import { ShareIcon } from './icons'

const MONO = "'DM Sans', sans-serif"

export default function BottomSheet({
  piece,
  tile,
  own,
  local = false,
  sheetRef,
  onClose,
  onPrev,
  onNext,
  onRandom,
}: {
  piece: RankedPiece
  tile: Tile | null
  own: boolean
  /** Morceau d'essai de la démonstration (n'existe que dans l'onglet) : rien à partager ni à signaler. */
  local?: boolean
  sheetRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onRandom: () => void
}) {
  const t = useTranslations('vitrail.fiche')
  const tn = useTranslations('vitrail.nav')
  const tc = useTranslations('commun')
  const sinceDate = useSinceDate()
  const [share, setShare] = useState(false)
  const [report, setReport] = useState(false)
  const drag = useRef<{ y: number; dy: number } | null>(null)
  const c = piece.color

  const btn: React.CSSProperties = {
    flex: 1,
    padding: '12px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: '#F4EFE6',
    fontSize: '13px',
    fontFamily: MONO,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    WebkitTapHighlightColor: 'transparent',
  }

  return (
    <div
      ref={sheetRef}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '70%',
        background: 'rgba(15,15,25,0.98)',
        borderTop: `1px solid ${c}33`,
        borderRadius: '20px 20px 0 0',
        boxShadow: `0 -4px 40px ${c}22`,
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.3s ease',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <button
        onClick={onClose}
        aria-label={tc('fermer')}
        style={{ position: 'absolute', top: '12px', right: '16px', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
      >
        ×
      </button>

      {/* Zone à glisser : poignée + en-tête */}
      <div
        style={{ touchAction: 'none', flexShrink: 0 }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, dy: 0 }
          if (sheetRef.current) sheetRef.current.style.transition = 'none'
        }}
        onPointerMove={e => {
          if (!drag.current || !sheetRef.current) return
          drag.current.dy = Math.max(0, e.clientY - drag.current.y)
          sheetRef.current.style.transform = `translateY(${drag.current.dy}px)`
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (!sheetRef.current) return
          sheetRef.current.style.transition = 'transform 0.3s ease'
          if (d && d.dy > 80) onClose()
          else sheetRef.current.style.transform = 'translateY(0)'
        }}
      >
        <div style={{ width: '100%', padding: '12px 0 8px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '0 20px 16px' }}>
          <PiecePortrait id={piece.id} color={c} photoUrl={piece.photoUrl} tile={tile} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontFamily: donorNameFamily(), fontSize: '18px', fontWeight: 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{piece.name ?? tc('anonyme')}</h2>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', minWidth: 0 }}>
              <ArrivalBadge piece={piece} own={own} small />
              {piece.since && <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{t('depuisCourt', { date: sinceDate(piece.since) })}</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 20px 20px' }}>
        {piece.message && piece.question && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.5, color: 'rgba(244,239,230,0.5)', marginBottom: '6px' }}>{piece.question}</div>
        )}
        {piece.message && (
          <div style={{ fontStyle: piece.message.length > 140 ? 'normal' : 'italic', color: piece.message.length > 140 ? 'rgba(255,248,235,0.92)' : c, fontSize: '15px', lineHeight: 1.6, marginBottom: '16px', padding: '12px', background: `${c}11`, borderRadius: '8px', borderLeft: `3px solid ${c}` }}>« {piece.message} »</div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button onClick={onPrev} style={btn}>
            {tn('prec')}
          </button>
          <button onClick={onRandom} style={btn}>
            {tn('hasard')}
          </button>
          <button onClick={onNext} style={btn}>
            {tn('suiv')}
          </button>
        </div>
        {!local && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <button onClick={() => setShare(true)} style={btn}>
            <ShareIcon />
            <span>{own ? t('partagerMien') : t('partager')}</span>
          </button>
          {!own && (
            <button onClick={() => setReport(true)} style={{ ...reportStyle, marginTop: '10px', alignSelf: 'center' }}>
              {t('signalerCe')}
            </button>
          )}
        </div>
        )}
      </div>
      {share && <ShareDialog id={piece.id} name={piece.name} own={own} onClose={() => setShare(false)} />}
      {report && <ReportDialog donorId={piece.id} onClose={() => setReport(false)} />}
    </div>
  )
}
