import { headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale } from './config'
import { clampLocale, requestIdentity } from '@/lib/identity'

// Langue de la requête : écrite par proxy.ts. Sans proxy (chemin exclu), français.
// Sur les pages publiques d'un organisme, limitée aux langues qu'il offre (un organisme anglophone reste en anglais).
export default getRequestConfig(async () => {
  const value = (await headers()).get(LOCALE_HEADER)
  let locale = isLocale(value) ? value : DEFAULT_LOCALE
  const { identity, surface } = await requestIdentity().catch(() => ({ identity: null, surface: 'org' as const }))
  if (identity && surface === 'org') locale = clampLocale(identity.locales, locale)
  return { locale, messages: (await import(`../messages/${locale}.json`)).default }
})
