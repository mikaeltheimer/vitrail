'use client'

// Champ « témoignage » : la question est posée par le conteneur ; ici, le texte (un exemple en placeholder pour
// inspirer), un compteur et le consentement à la citation, qui n'apparaît qu'une fois le texte commencé.

import { type CSSProperties } from 'react'
import { CONFIG } from '@/lib/config'

interface Props {
  value: string
  onChange: (v: string) => void
  consent: boolean
  onConsent: (v: boolean) => void
  rows?: number
  autoFocus?: boolean
}

export default function TestimonialField({ value, onChange, consent, onConsent, rows = 4, autoFocus }: Props) {
  const left = CONFIG.messageMax - value.length

  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <textarea
        value={value}
        maxLength={CONFIG.messageMax}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={CONFIG.testimonial.placeholder}
        onChange={e => onChange(e.target.value)}
        style={textareaStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
        <span>Affiché avec votre morceau, ici et sur le grand écran.</span>
        <span style={{ fontFamily: "'Space Mono', monospace", color: left < 40 ? '#fbbf24' : undefined, flexShrink: 0 }}>{left}</span>
      </div>
      {value.trim() && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', lineHeight: 1.45 }}>
          <input type="checkbox" checked={consent} onChange={e => onConsent(e.target.checked)} style={{ accentColor: '#fbbf24', marginTop: '2px' }} />
          <span>{CONFIG.testimonial.consent}</span>
        </label>
      )}
    </div>
  )
}

const textareaStyle: CSSProperties = {
  font: "400 15px/1.5 'Space Grotesk', sans-serif",
  color: '#fff',
  background: '#0d0b13',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  padding: '10px 12px',
  width: '100%',
  boxSizing: 'border-box',
  resize: 'vertical',
}
