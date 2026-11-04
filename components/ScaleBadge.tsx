'use client'

// Pastille « Échelle 0,75 » quand une page est ouverte avec ?echelle=… (comparaison d'échelles), invisible sinon.

import { useEffect, useState } from 'react'
import { CONFIG } from '@/lib/config'
import { sizeExponentOverride } from '@/lib/render'

export default function ScaleBadge({ style }: { style?: React.CSSProperties }) {
  const [e, setE] = useState<number | null>(null)
  useEffect(() => {
    Promise.resolve().then(() => setE(sizeExponentOverride()))
  }, [])
  if (e === null) return null
  const label = (x: number) => x.toLocaleString('fr-CA', { maximumFractionDigits: 2 })
  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 900,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'rgba(12,10,18,0.9)',
        border: '1px dashed rgba(240,178,74,0.6)',
        color: '#FFE2A8',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        pointerEvents: 'none',
        ...style,
      }}
    >
      Échelle {label(e)} · réglage actuel {label(CONFIG.sizeExponent)}
    </div>
  )
}
