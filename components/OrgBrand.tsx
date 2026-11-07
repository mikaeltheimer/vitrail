'use client'

/* eslint-disable @next/next/no-img-element -- logos téléversés par l'organisme (bucket public), tailles libres */
import type { CSSProperties } from 'react'
import { useIdentity, useOrg } from '@/lib/useOrg'

/** Logo de l'organisme ; sans logo, son nom en titre. */
export function OrgLogo({ style, className, nameStyle }: { style?: CSSProperties; className?: string; nameStyle?: CSSProperties }) {
  const identity = useIdentity()
  const org = useOrg()
  if (identity?.logoUrl) return <img src={identity.logoUrl} alt={org.name} className={className} style={{ height: 'auto', ...style }} />
  return (
    <div className={`font-display ${className ?? ''}`} style={{ fontSize: '1.4em', lineHeight: 1.15, ...nameStyle }}>
      {org.name}
    </div>
  )
}

/** Initiales d'un nom d'organisme : « École d'art de Sutton » → « ÉS » (mots courts et articles ignorés). */
export function orgInitials(name: string): string {
  const words = name
    .split(/[\s'’-]+/) // i18n-ok : séparateurs de mots
    .filter(w => w.length > 2 || /^[A-ZÀ-Ý]/.test(w)) // i18n-ok : majuscule accentuée
    .filter(w => !/^(de|des|du|la|le|les|the|of|and|et)$/i.test(w)) // i18n-ok : mots vides ignorés
  const letters = (words.length ? words : [name]).map(w => w[0]).join('')
  return (letters.length > 2 ? letters[0] + letters[letters.length - 1] : letters).toLocaleUpperCase()
}

/** Petite icône carrée de l'organisme (en-tête) ; sans icône, ses initiales dans une pastille. */
export function OrgMark({ size = 32 }: { size?: number }) {
  const identity = useIdentity()
  const org = useOrg()
  if (identity?.iconUrl) return <img src={identity.iconUrl} alt="" style={{ height: size, width: 'auto', maxWidth: size * 1.6, flexShrink: 0 }} />
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: '50%', border: '1.5px solid rgba(240,178,74,0.7)', color: '#F0B24A', display: 'inline-grid', placeItems: 'center', fontSize: size * 0.38, fontWeight: 700, letterSpacing: '0.02em', flexShrink: 0 }}
    >
      {orgInitials(org.name)}
    </span>
  )
}
