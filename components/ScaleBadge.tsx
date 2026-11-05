'use client'

// Pastille d'essai quand une page est ouverte avec ?echelle=… ou ?noms=… (comparaison), invisible sinon.

import { useEffect, useState } from 'react'
import { CONFIG } from '@/lib/config'
import { sizeExponentOverride } from '@/lib/render'

export default function ScaleBadge({ style }: { style?: React.CSSProperties }) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const e = sizeExponentOverride()
    const noms = new URLSearchParams(window.location.search).get('noms')
    const fmt = (x: number) => x.toLocaleString('fr-CA', { maximumFractionDigits: 2 })
    const parts: string[] = []
    if (e !== null) parts.push(`Échelle ${fmt(e)} (réglage ${fmt(CONFIG.sizeExponent)})`)
    if (noms === 'fraunces' || noms === 'dmsans') parts.push(`Noms en ${noms === 'fraunces' ? 'Fraunces' : 'DM Sans'}`)
    Promise.resolve().then(() => setLabel(parts.length ? parts.join(' · ') : null))
  }, [])
  if (!label) return null
  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 900,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'rgba(11,10,18,0.9)',
        border: '1px dashed rgba(240,178,74,0.6)',
        color: '#FFE2A8',
        fontSize: 13,
        pointerEvents: 'none',
        ...style,
      }}
    >
      {label}
    </div>
  )
}
