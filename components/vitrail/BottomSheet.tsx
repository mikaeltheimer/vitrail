'use client'

// Fiche d'un morceau sur téléphone : feuille en bas, à glisser vers le bas pour la fermer .

import { useRef, useState } from 'react'
import type { Tile } from '@/lib/tiling'
import { PiecePortrait } from './PiecePortrait'
import { ReportDialog } from './ReportDialog'
import { ShareDialog } from './ShareDialog'
import { ordinal, type RankedPiece } from './types'
import { donorNameFamily } from '@/lib/fonts'

const MONO = "'DM Sans', sans-serif"

export default function BottomSheet({
  piece,
  tile,
  own,
  sheetRef,
  onClose,
  onPrev,
  onNext,
  onRandom,
}: {
  piece: RankedPiece
  tile: Tile | null
  own: boolean
  sheetRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onRandom: () => void
}) {
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
        aria-label="Fermer"
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
            <h2 style={{ fontFamily: donorNameFamily(), fontSize: '18px', fontWeight: 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{piece.name ?? 'Anonyme'}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Morceau du vitrail</span>
              <span style={{ padding: '2px 8px', background: `${c}22`, border: `1px solid ${c}44`, borderRadius: '12px', fontFamily: MONO, fontSize: '11px', color: c }}>{ordinal(piece.rank)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 20px 20px' }}>
        {piece.message && (
          <div style={{ fontStyle: piece.message.length > 140 ? 'normal' : 'italic', color: piece.message.length > 140 ? 'rgba(255,248,235,0.92)' : c, fontSize: '15px', lineHeight: 1.6, marginBottom: '16px', padding: '12px', background: `${c}11`, borderRadius: '8px', borderLeft: `3px solid ${c}` }}>« {piece.message} »</div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button onClick={onPrev} style={btn}>
            ← Préc.
          </button>
          <button onClick={onRandom} style={btn}>
            ✦ Au hasard
          </button>
          <button onClick={onNext} style={btn}>
            Suiv. →
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShare(true)} style={btn}>
            <span>🔗</span>
            <span>{own ? 'Partager mon morceau' : 'Partager'}</span>
          </button>
          {!own && (
            <button onClick={() => setReport(true)} aria-label="Signaler" style={{ ...btn, flex: '0 0 auto', padding: '12px 16px', background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'rgba(239, 68, 68, 0.7)', fontSize: '16px' }}>
              ⚑
            </button>
          )}
        </div>
      </div>
      {share && <ShareDialog id={piece.id} name={piece.name} own={own} onClose={() => setShare(false)} />}
      {report && <ReportDialog donorId={piece.id} onClose={() => setReport(false)} />}
    </div>
  )
}
