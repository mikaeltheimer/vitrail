import { createTranslator } from 'next-intl'
import { NextRequest } from 'next/server'
import fr from '@/messages/fr.json'
import en from '@/messages/en.json'
import { DEFAULT_LOCALE, LOCALE_HEADER, isLocale, type Locale } from '@/i18n/config'

// Traduction hors rendu React : routes API, webhook, tâches planifiées, courriels.
// La langue est toujours passée explicitement (celle de la requête, ou celle enregistrée pour le donateur).

const MESSAGES = { fr, en } as const

export function translatorFor(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale] })
}

/** Langue d'une requête, telle que résolue par proxy.ts. */
export function localeOf(request: NextRequest): Locale {
  const value = request.headers.get(LOCALE_HEADER)
  return isLocale(value) ? value : DEFAULT_LOCALE
}
