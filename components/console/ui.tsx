'use client'

import { useLocale } from 'next-intl'
import { INTL_TAG, type Locale } from '@/i18n/config'

// Petits éléments partagés par les onglets de la console : icônes (traits, sans émoji), cartes, dates.

const PATHS: Record<string, React.ReactNode> = {
  accueil: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  dons: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 12 5a5.5 5.5 0 0 0-10 3.5c0 2.3 1.5 4 3 5.5l7 7z" />,
  moderation: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  diffuser: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </>
  ),
  plus: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  alerte: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  drapeau: (
    <>
      <path d="M4 21V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </>
  ),
  courriel: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  ecran: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),
  partager: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4" />
      <path d="m15.4 6.5-6.8 4" />
    </>
  ),
  billet: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01" />
      <path d="M18 12h.01" />
    </>
  ),
  carte: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  fermer: <path d="M18 6 6 18M6 6l12 12" />,
}

export function Icon({ name, size = 22, color = 'currentColor', className }: { name: keyof typeof PATHS; size?: number; color?: string; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flex: 'none' }}>
      {PATHS[name]}
    </svg>
  )
}

/** Date courte dans la langue de la console (« 5 nov., 21 h 14 »). */
export function useTime() {
  const locale = useLocale() as Locale
  return (iso: string) => new Date(iso).toLocaleString(INTL_TAG[locale], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export function useDay() {
  const locale = useLocale() as Locale
  return (iso: string) => new Date(iso).toLocaleDateString(INTL_TAG[locale], { day: 'numeric', month: 'long' })
}

/** « il y a 3 min » */
export function useAgo() {
  const locale = useLocale() as Locale
  const rtf = new Intl.RelativeTimeFormat(INTL_TAG[locale], { numeric: 'auto' })
  return (iso: string) => {
    const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
    if (s > -60) return rtf.format(Math.min(0, s), 'second')
    if (s > -3600) return rtf.format(Math.round(s / 60), 'minute')
    if (s > -86400) return rtf.format(Math.round(s / 3600), 'hour')
    return rtf.format(Math.round(s / 86400), 'day')
  }
}

export const RED = '#F58FA3'
export const GREEN = '#3DB5A6'

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Fenêtre par-dessus la console (fiche donateur, don comptant) : plein écran sur téléphone. */
export function Sheet({ title, onClose, children, closeLabel }: { title: string; onClose: () => void; children: React.ReactNode; closeLabel: string }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex justify-center overflow-y-auto" style={{ background: 'rgba(5,4,8,0.75)' }}>
      <div className="min-h-full w-full max-w-lg p-4 sm:py-10" style={{ background: 'var(--bg)' }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="chip flex h-11 w-11 items-center justify-center !p-0" aria-label={closeLabel} onClick={onClose}>
            <Icon name="fermer" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
