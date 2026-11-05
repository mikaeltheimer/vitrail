'use client'

import type { CSSProperties } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, englishEnabled, type Locale } from '@/i18n/config'

/**
 * Bascule FR ↔ EN : pose le cookie de langue puis recharge le rendu serveur. N'affiche rien (pas même `prefix`) tant que l'anglais est coupé.
 * `prefix` : séparateur placé devant le bouton (« · » dans un pied de page), absent quand le bouton l'est.
 */
export default function LanguageSwitch({ className, style, prefix }: { className?: string; style?: CSSProperties; prefix?: string }) {
  const locale = useLocale() as Locale
  const t = useTranslations('commun.langue')
  const router = useRouter()
  if (!englishEnabled()) return null

  const other: Locale = locale === 'fr' ? 'en' : 'fr'
  return (
    <>
      {prefix}
      <button
        type="button"
        lang={other}
        className={className}
        style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', ...style }}
        title={t('label')}
        onClick={() => {
          document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; samesite=lax`
          router.refresh()
        }}
      >
        {t(other)}
      </button>
    </>
  )
}
