'use client'

// Champ « témoignage » : la question est posée par le conteneur ; ici, le texte (un exemple en placeholder pour
// inspirer), un compteur et le consentement à la citation, qui n'apparaît qu'une fois le texte commencé.

import { type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { useOrg } from '@/lib/useOrg'
import Editable from '@/components/atelier/Editable'

interface Props {
  value: string
  onChange: (v: string) => void
  consent: boolean
  onConsent: (v: boolean) => void
  rows?: number
  autoFocus?: boolean
}

export default function TestimonialField({ value, onChange, consent, onConsent, rows = 4, autoFocus }: Props) {
  const t = useTranslations('temoignage')
  const org = useOrg()
  const left = CONFIG.messageMax - value.length

  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <Editable field="placeholder" block>
      <textarea
        value={value}
        maxLength={CONFIG.messageMax}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={org.testimonial.placeholder}
        onChange={e => onChange(e.target.value)}
        style={textareaStyle}
      />
      </Editable>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '15px', color: 'rgba(255,255,255,0.82)' }}>
        <span>{t('aide')}</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", color: left < 40 ? '#F0B24A' : undefined, flexShrink: 0 }}>{left}</span>
      </div>
      {value.trim() && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '15px', color: 'rgba(255,255,255,0.82)', cursor: 'pointer', lineHeight: 1.45 }}>
          <input type="checkbox" checked={consent} onChange={e => onConsent(e.target.checked)} style={{ accentColor: '#F0B24A', marginTop: '2px' }} />
          <span>{org.testimonial.consent}</span>
        </label>
      )}
    </div>
  )
}

const textareaStyle: CSSProperties = {
  font: "400 16px/1.5 'DM Sans', sans-serif", // 16 px minimum : sinon Safari (iPhone) agrandit la page au toucher du champ
  color: '#F4EFE6',
  background: '#0B0A12',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  padding: '10px 12px',
  width: '100%',
  boxSizing: 'border-box',
  resize: 'vertical',
}
