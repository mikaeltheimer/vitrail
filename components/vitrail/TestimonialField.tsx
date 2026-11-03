'use client'

// Champ « témoignage » (souvenir, anecdote) : une question d'amorce qui change à chaque fois, un compteur,
// et le consentement à la citation, qui n'apparaît qu'une fois le texte commencé. Utilisé au don et après.

import { useEffect, useState, type CSSProperties } from 'react'
import { CONFIG } from '@/lib/config'

const PROMPTS = CONFIG.testimonial.prompts

interface Props {
  value: string
  onChange: (v: string) => void
  consent: boolean
  onConsent: (v: boolean) => void
  rows?: number
  autoFocus?: boolean
}

export default function TestimonialField({ value, onChange, consent, onConsent, rows = 4, autoFocus }: Props) {
  const [i, setI] = useState(0)
  // Amorce tirée au hasard après le montage (le serveur ne peut pas faire le même tirage)
  useEffect(() => {
    Promise.resolve().then(() => setI(Math.floor(Math.random() * PROMPTS.length)))
  }, [])
  const left = CONFIG.messageMax - value.length

  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#fde68a' }}>{PROMPTS[i]}</span>
        <button type="button" onClick={() => setI(n => (n + 1) % PROMPTS.length)} style={linkStyle}>
          ↻ Une autre idée
        </button>
      </div>
      <textarea
        value={value}
        maxLength={CONFIG.messageMax}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={CONFIG.testimonial.lead}
        onChange={e => onChange(e.target.value)}
        style={textareaStyle}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
        <span>Le début s&apos;affiche sur votre morceau, le texte entier sur le grand écran et dans votre fiche.</span>
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
const linkStyle: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'rgba(255,255,255,0.55)',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '12px',
  cursor: 'pointer',
  flexShrink: 0,
}
