'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, LOCALES, englishEnabled, type Locale } from '@/i18n/config'

// Langue de la console : une bascule FR | EN, toujours visible dans le menu latéral sur ordinateur, dans le menu du
// compte sur téléphone et tablette (Mika, 17 nov. : pas besoin de l'avoir toujours à l'écran sur téléphone).
// C'est un choix personnel (cookie), indépendant des langues que l'organisme offre sur son vitrail : la console a sa
// propre surface, que i18n/request.ts ne limite pas. Rien quand l'anglais est coupé sur la plateforme.
function rememberLocale(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
}

export default function LanguageToggle({ className = '' }: { className?: string }) {
  const locale = useLocale() as Locale
  const t = useTranslations('console.langue')
  const tl = useTranslations('commun.langue')
  const router = useRouter()
  if (!englishEnabled()) return null
  const pick = (l: Locale) => {
    if (l === locale) return
    rememberLocale(l)
    router.refresh()
  }
  return (
    <div role="group" aria-label={t('titre')} className={`inline-flex rounded-xl border p-0.5 ${className}`} style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,0.03)' }}>
      {LOCALES.map(l => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          aria-label={tl(l)}
          title={tl(l)}
          onClick={() => pick(l)}
          className="min-h-[36px] min-w-[44px] rounded-[10px] px-2.5 text-[13px] font-bold"
          style={l === locale ? { background: 'var(--accent)', color: 'var(--on-accent)' } : { background: 'transparent', color: 'var(--muted)' }}
        >
          {t(l)}
        </button>
      ))}
    </div>
  )
}
