import { headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale } from './config'

// Langue de la requête : écrite par proxy.ts. Sans proxy (chemin exclu), français.
export default getRequestConfig(async () => {
  const value = (await headers()).get(LOCALE_HEADER)
  const locale = isLocale(value) ? value : DEFAULT_LOCALE
  return { locale, messages: (await import(`../messages/${locale}.json`)).default }
})
