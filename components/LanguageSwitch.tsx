'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, englishEnabled, type Locale } from '@/i18n/config'

/** Bascule FR ↔ EN : pose le cookie de langue puis recharge le rendu serveur. Invisible tant que l'anglais est coupé. */
export default function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale() as Locale
  const t = useTranslations('commun.langue')
  const router = useRouter()
  if (!englishEnabled()) return null

  const other: Locale = locale === 'fr' ? 'en' : 'fr'
  return (
    <button
      type="button"
      lang={other}
      className={className}
      title={t('label')}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; samesite=lax`
        router.refresh()
      }}
    >
      {t(other)}
    </button>
  )
}
