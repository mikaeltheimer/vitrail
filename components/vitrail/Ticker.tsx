'use client'

// « Derniers dons » : en haut à gauche (en haut à gauche, sous l'en-tête),
// une pastille repliée ou un panneau ouvert ; chaque don mène à son morceau. L'état ouvert/fermé est retenu.

import { useEffect, useState } from 'react'
import { formatMoney } from '@/lib/format'
import type { RecentDonation } from '@/lib/types'

const MONO = "'DM Sans', sans-serif"
const GOLD = '#F0B24A'
const STORE_KEY = 'vitrail:recent-open'

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'à l’instant'
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} j`
}

export default function Ticker({ recent, totalCents, isMobile, hidden, onVisit }: { recent: RecentDonation[]; totalCents: number; isMobile: boolean; hidden: boolean; onVisit: (donorId: string) => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      if (!isMobile && localStorage.getItem(STORE_KEY) === '1') Promise.resolve().then(() => setOpen(true))
    } catch {}
  }, [isMobile])
  const setStored = (v: boolean) => {
    setOpen(v)
    try {
      localStorage.setItem(STORE_KEY, v ? '1' : '0')
    } catch {}
  }
  if (hidden || recent.length === 0) return null
  const last = recent[0]

  if (!open) {
    return (
      <button
        onClick={() => setStored(true)}
        style={{
          position: 'fixed',
          zIndex: 120,
          left: isMobile ? 16 : 24,
          top: 72,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 14px',
          borderRadius: 999,
          border: '1px solid rgba(240,178,74,0.35)',
          background: 'rgba(12,10,18,0.88)',
          backdropFilter: 'blur(8px)',
          color: '#F4EFE6',
          fontFamily: MONO,
          fontSize: 12,
          cursor: 'pointer',
          maxWidth: isMobile ? 'calc(100% - 32px - 170px)' : 360,
        }}
      >
        <span style={{ color: GOLD, fontWeight: 700 }}>{formatMoney(totalCents)}</span>
        {!isMobile && (
          <span style={{ color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            · {last.name ?? 'Anonyme'} vient d&apos;ajouter son morceau
          </span>
        )}
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>▾</span>
      </button>
    )
  }

  const list = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Derniers dons</span>
        <button onClick={() => setStored(false)} aria-label="Replier" style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>
          ×
        </button>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(totalCents)}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>amassés pour l&apos;école</div>
      <div style={{ display: 'grid', gap: 2 }}>
        {recent.slice(0, 8).map(d => (
          <button
            key={d.id}
            onClick={() => {
              onVisit(d.donorId)
              if (isMobile) setStored(false)
            }}
            style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'baseline', padding: '7px 8px', borderRadius: 6, background: 'transparent', border: 0, color: '#F4EFE6', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name ?? 'Anonyme'}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(255,255,255,0.4)', width: 52, textAlign: 'right' }}>{ago(d.at)}</span>
          </button>
        ))}
      </div>
    </>
  )

  if (isMobile) {
    return (
      <>
        <div onClick={() => setStored(false)} style={{ position: 'fixed', inset: 0, zIndex: 590, background: 'rgba(0,0,0,0.35)' }} />
        <section
          aria-label="Derniers dons"
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 600, maxHeight: 'calc(100dvh - 72px)', overflowY: 'auto', background: 'rgba(20,18,29,0.98)', borderRadius: '16px 16px 0 0', border: '1px solid rgba(255,255,255,0.12)', padding: '16px 16px calc(16px + env(safe-area-inset-bottom))' }}
        >
          {list}
        </section>
      </>
    )
  }
  return (
    <section
      aria-label="Derniers dons"
      style={{ position: 'fixed', left: 24, top: 72, zIndex: 120, width: 340, maxHeight: 'calc(100dvh - 72px - 24px)', overflowY: 'auto', boxSizing: 'border-box', background: 'rgba(12,10,18,0.94)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 16, backdropFilter: 'blur(10px)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
    >
      {list}
    </section>
  )
}
