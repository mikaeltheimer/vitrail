import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatCount, formatMoney } from './format'
import { QUOTES, type Locale } from '@/i18n/config'
import type { SceneText } from './render'
import type { GlassId } from './theme'

// Aides de composants : formats et noms selon la langue de la page.

/** (2500) → « 25 $ » ou « $25 ». */
export function useMoney(): (cents: number) => string {
  const locale = useLocale() as Locale
  return cents => formatMoney(cents, locale)
}

/** (4944) → « 4 944 » ou « 4,944 ». */
export function useCount(): (n: number) => string {
  const locale = useLocale() as Locale
  return n => formatCount(n, locale)
}

/** (3) → « 3e » ou « 3rd ». */
export function useOrdinal(): (n: number) => string {
  const t = useTranslations('commun')
  return n => t('ordinal', { n })
}

/** Nom d'un verre de la palette dans la langue de la page : glassName(GLASS_COLORS[0]) → « Ambre » ou « Amber ». */
export function useGlassName(): (glass: { id: GlassId }) => string {
  const t = useTranslations('commun.verres')
  return glass => t(glass.id)
}

/** Textes dessinés sur le canevas (« Anonyme », guillemets), stables tant que la langue ne change pas. */
export function useSceneText(): SceneText {
  const locale = useLocale() as Locale
  const anon = useTranslations('commun')('anonyme')
  return useMemo(() => ({ anon, quotes: QUOTES[locale] }), [anon, locale])
}
