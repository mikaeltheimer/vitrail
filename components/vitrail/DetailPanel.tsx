'use client'

// Fiche d'un morceau sur ordinateur : panneau à droite, sous l'en-tête (mise en page de Pay to Exist).

import { useState } from 'react'
import { formatMoney } from '@/lib/format'
import type { Tile } from '@/lib/tiling'
import { PiecePortrait } from './PiecePortrait'
import { ReportDialog } from './ReportDialog'
import { ShareDialog } from './ShareDialog'
import { ordinal, type RankedPiece } from './types'

const MONO = "'Space Mono', monospace"
const divider = { height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)', margin: '24px 0' }

export default function DetailPanel({ piece, tile, count, totalCents, own, onClose }: { piece: RankedPiece; tile: Tile | null; count: number; totalCents: number; own: boolean; onClose: () => void }) {
  const [share, setShare] = useState(false)
  const [report, setReport] = useState(false)
  const c = piece.color
  return (
    <div
      style={{
        position: 'fixed',
        top: '56px',
        right: 0,
        width: '320px',
        height: 'calc(100% - 56px)',
        background: 'rgba(15,15,25,0.95)',
        backdropFilter: 'blur(30px)',
        borderLeft: `1px solid ${c}33`,
        boxShadow: `0 0 40px ${c}22, inset 0 0 80px rgba(0,0,0,0.5)`,
        zIndex: 500,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Détails du morceau</span>
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '24px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <PiecePortrait id={piece.id} color={c} photoUrl={piece.photoUrl} tile={tile} size={piece.photoUrl ? 272 : 180} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>{piece.name ?? 'Donateur anonyme'}</h2>
          <span style={{ display: 'inline-block', padding: '4px 12px', background: `${c}22`, border: `1px solid ${c}44`, borderRadius: '20px', fontFamily: MONO, fontSize: '12px', color: c }}>
            {ordinal(piece.rank)} sur {count}
            {own ? ' · votre morceau' : ''}
          </span>
        </div>

        {piece.message && (
          <>
            <div style={divider} />
            <div style={{ fontStyle: 'italic', color: c, lineHeight: 1.7, fontSize: '18px', fontWeight: 500, textAlign: 'center', padding: '0 8px', textShadow: `0 0 20px ${c}66` }}>« {piece.message} »</div>
          </>
        )}

        <div style={divider} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>A donné</p>
          <p style={{ fontFamily: MONO, fontSize: '28px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{formatMoney(piece.amountCents)}</p>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
            {totalCents > 0 ? `${((piece.amountCents / totalCents) * 100).toLocaleString('fr-CA', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} % du vitrail` : ''}
          </p>

          <button onClick={() => setShare(true)} style={{ ...actionStyle, marginTop: '16px' }}>
            <span>🔗</span>
            <span>{own ? 'Partager mon morceau' : 'Partager ce morceau'}</span>
          </button>
          {!own && (
            <button onClick={() => setReport(true)} style={{ ...actionStyle, marginTop: '8px', background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'rgba(239, 68, 68, 0.7)' }}>
              <span>⚑</span>
              <span>Signaler</span>
            </button>
          )}
        </div>
      </div>
      {share && <ShareDialog id={piece.id} name={piece.name} own={own} onClose={() => setShare(false)} />}
      {report && <ReportDialog donorId={piece.id} onClose={() => setReport(false)} />}
    </div>
  )
}

const actionStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '6px',
  color: 'rgba(255,255,255,0.7)',
  fontSize: '12px',
  fontFamily: MONO,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
}
