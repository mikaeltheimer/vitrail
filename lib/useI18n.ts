import { useLocale, useTranslations } from 'next-intl'
import { formatCount, formatMoney } from './format'
import type { Locale } from '@/i18n/config'

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

/** Nom d'un verre de la palette dans la langue de la page : glassName(GLASS_COLORS[0]) → « Ambre » ou « Amber ». */
export function useGlassName(): (glass: { id: 'ambre' | 'rose' | 'turquoise' | 'indigo' | 'violet' }) => string {
  const t = useTranslations('commun.verres')
  return glass => t(glass.id)
}
