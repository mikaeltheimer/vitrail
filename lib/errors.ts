import { createTranslator } from 'next-intl'
import { NextRequest, NextResponse } from 'next/server'
import fr from '@/messages/fr.json'
import en from '@/messages/en.json'
import type { Locale } from '@/i18n/config'
import { formatMoney } from './format'
import { localeOf } from './i18n'

// Erreurs destinées au visiteur : le code (la validation, les routes) ne porte jamais de texte, seulement une clé de
// messages/*.json (espace « erreurs ») et ses paramètres. La route traduit selon la langue de la requête.

export type ErrorKey = keyof typeof fr.erreurs

/** Un montant à insérer dans un message : formaté selon la langue (« 5 $ » ou « $5 »). */
export interface MoneyParam {
  cents: number
}
export const money = (cents: number): MoneyParam => ({ cents })

export interface AppError {
  key: ErrorKey
  params?: Record<string, string | number | MoneyParam>
}

export const err = (key: ErrorKey, params?: AppError['params']): AppError => ({ key, params })

const MESSAGES = { fr, en } as const

export function errorMessage(locale: Locale, e: AppError): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'erreurs' })
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(e.params ?? {})) params[name] = typeof value === 'object' ? formatMoney(value.cents, locale) : value
  return t(e.key, params)
}

/** Réponse JSON d'erreur dans la langue de la requête : { error: « texte », code: « cle » }. */
export function errorResponse(request: NextRequest, e: AppError, status = 400): NextResponse {
  return NextResponse.json({ error: errorMessage(localeOf(request), e), code: e.key }, { status })
}
