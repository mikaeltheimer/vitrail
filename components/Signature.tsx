'use client'

import { useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { useBrandHref } from '@/lib/useOrg'

/**
 * Signature de la plateforme sur les pages d'un organisme : « propulsé par » + logo (petit symbole et mot).
 * Règle : Donivers signe, l'organisme parle. Toujours plus petite que l'organisme, sous lui ou après lui, au même endroit
 * d'une page à l'autre ; jamais dans le contenu (témoignages, appel à donner, remerciements).
 *
 * - `height` : hauteur du logo, en px ou en em (la ligne de texte « propulsé par » suit cette taille).
 * - `compact` : logo seul, sans « propulsé par » (en-tête sur téléphone).
 * - `link` : lien vers la vitrine de Donivers, avec la provenance (nouvel onglet). Pas de lien sur l'écran de projection.
 * - `tone` : 'light' (crème, fonds sombres, par défaut) ou 'dark' (encre, papier et fonds clairs : affiche).
 */
export default function Signature({
  height = 16,
  compact = false,
  link = true,
  opacity = 0.62,
  tone = 'light',
  style,
}: {
  height?: number | string
  compact?: boolean
  link?: boolean
  opacity?: number
  tone?: 'light' | 'dark'
  style?: React.CSSProperties
}) {
  const t = useTranslations('commun')
  const href = useBrandHref()
  const h = typeof height === 'number' ? `${height}px` : height
  const content = (
    <>
      {!compact && <span style={{ fontSize: `max(11px, calc(${h} * 0.62))`, color: tone === 'dark' ? `rgba(26,23,32,${opacity})` : `rgba(244,239,230,${opacity})`, whiteSpace: 'nowrap' }}>{t('propulsePar')}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique (public/brand, scripts/logo.py) */}
      <img src={tone === 'dark' ? '/brand/donivers-logo-encre-petit.svg' : '/brand/donivers-logo-creme-petit.svg'} alt={CONFIG.brand.name} style={{ height: h, width: 'auto', display: 'block', opacity: Math.min(1, opacity + 0.25) }} />
    </>
  )
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: `calc(${h} * 0.35)`, lineHeight: 1, textDecoration: 'none', ...style }
  if (!link || !href) return <span style={base}>{content}</span>
  return (
    <a href={href} target="_blank" rel="noopener" aria-label={t('signatureLien', { brand: CONFIG.brand.name })} style={base}>
      {content}
    </a>
  )
}
