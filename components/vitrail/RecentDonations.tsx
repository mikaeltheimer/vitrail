'use client'

// « Derniers dons » : les dons les plus récents, chacun mène à son morceau. Repliable (le choix est retenu).

import { useEffect, useState } from 'react'
import { formatMoney } from '@/lib/format'
import type { RecentDonation } from '@/lib/types'

const STORE_KEY = 'vitrail:recent-open'

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return "à l'instant"
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  return `il y a ${Math.round(s / 86400)} j`
}

export function RecentDonations({ recent, isMobile, onVisit }: { recent: RecentDonation[]; isMobile: boolean; onVisit: (donorId: string) => void }) {
  const [open, setOpen] = useState(!isMobile)
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORE_KEY)
      if (v !== null) Promise.resolve().then(() => setOpen(v === '1'))
    } catch {}
  }, [])
  const toggle = () => {
    setOpen(o => {
      try {
        localStorage.setItem(STORE_KEY, o ? '0' : '1')
      } catch {}
      return !o
    })
  }
  if (recent.length === 0) return null
  const list = recent.slice(0, isMobile ? 4 : 6)

  return (
    <div className="rounded-2xl text-sm" style={{ width: isMobile ? 'auto' : 280, background: 'rgba(12,10,18,0.88)', border: '1px solid var(--line)', backdropFilter: 'blur(10px)' }}>
      <button className="flex w-full items-center justify-between px-3 py-2" onClick={toggle} aria-expanded={open}>
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.18em]" style={{ color: '#ffe7a0' }}>
          Derniers dons
        </span>
        <span className="muted text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="px-1 pb-2">
          {list.map(d => (
            <li key={d.id}>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10" onClick={() => onVisit(d.donorId)}>
                <span className="min-w-0 flex-1 truncate">{d.name ?? 'Anonyme'}</span>
                <b style={{ color: '#ffe7a0' }}>{formatMoney(d.amountCents)}</b>
                <span className="muted w-20 shrink-0 text-right text-xs">{ago(d.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
