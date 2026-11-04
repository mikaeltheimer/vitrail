'use client'

// Fiche d'un morceau sur ordinateur : panneau à droite, sous l'en-tête .

import { useState } from 'react'
import type { Tile } from '@/lib/tiling'
import { PiecePortrait } from './PiecePortrait'
import { ReportDialog } from './ReportDialog'
import { ShareDialog } from './ShareDialog'
import { ordinal, type RankedPiece } from './types'

const MONO = "'DM Sans', sans-serif"
const divider = { height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)', margin: '24px 0' }

export default function DetailPanel({ piece, tile, count, own, onClose }: { piece: RankedPiece; tile: Tile | null; count: number; totalCents?: number; own: boolean; onClose: () => void }) {
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
          style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#F4EFE6', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '24px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <PiecePortrait id={piece.id} color={c} photoUrl={piece.photoUrl} tile={tile} size={piece.photoUrl ? 272 : 180} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px', color: '#F4EFE6' }}>{piece.name ?? 'Anonyme'}</h2>
          <span style={{ display: 'inline-block', padding: '4px 12px', background: `${c}22`, border: `1px solid ${c}44`, borderRadius: '20px', fontFamily: MONO, fontSize: '12px', color: c }}>
            {ordinal(piece.rank)} sur {count}
            {own ? ' · votre morceau' : ''}
          </span>
        </div>

        {piece.message && (
          <>
            <div style={divider} />
            {piece.message.length > 140 ? (
              // Témoignage : se lit comme un texte, aligné à gauche
              <div style={{ color: 'rgba(255,248,235,0.92)', lineHeight: 1.65, fontSize: '15px', padding: '2px 4px 2px 14px', borderLeft: `3px solid ${c}` }}>{piece.message}</div>
            ) : (
              <div style={{ fontStyle: 'italic', color: c, lineHeight: 1.7, fontSize: '18px', fontWeight: 500, textAlign: 'center', padding: '0 8px', textShadow: `0 0 20px ${c}66` }}>« {piece.message} »</div>
            )}
          </>
        )}

        <div style={divider} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Un morceau du vitrail de l&apos;école</p>
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
