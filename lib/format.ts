import { DEFAULT_LOCALE, INTL_TAG, type Locale } from '@/i18n/config'

// Formats selon la langue : fr-CA « 4 944 $ », en-CA « $4,944 ». Sans langue précisée, français (comportement d'avant).
const formatters = new Map<string, Intl.NumberFormat>()

function money(locale: Locale, whole: boolean): Intl.NumberFormat {
  const key = `${locale}:${whole ? 'whole' : 'exact'}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(INTL_TAG[locale], { style: 'currency', currency: 'CAD', ...(whole ? { maximumFractionDigits: 0 } : {}) })
    formatters.set(key, f)
  }
  return f
}

/** 2500 → « 25 $ » (fr) ou « $25 » (en) ; 1250 → « 12,50 $ » ou « $12.50 ». */
export function formatMoney(cents: number, locale: Locale = DEFAULT_LOCALE): string {
  return money(locale, cents % 100 === 0).format(cents / 100)
}

/** Nombre entier groupé selon la langue : 4944 → « 4 944 » ou « 4,944 ». */
export function formatCount(n: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(INTL_TAG[locale]).format(n)
}
