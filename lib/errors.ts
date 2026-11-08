import { createTranslator } from 'next-intl'
import { NextResponse } from 'next/server'
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
export function errorResponse(request: Request, e: AppError, status = 400): NextResponse {
  return NextResponse.json({ error: errorMessage(localeOf(request), e), code: e.key }, { status })
}

/**
 * Pour une route : `const fail = failer(request)`, puis `fail('cle')`, `fail('cle', 404)` ou `fail(err('cle', { max }))`.
 * Le texte part toujours dans la langue de la requête (celle de la console, de la page…).
 */
export function failer(request: Request) {
  return (e: ErrorKey | AppError, status = 400): NextResponse => errorResponse(request, typeof e === 'string' ? err(e) : e, status)
}

/**
 * Erreur imprévue (base, réseau) : le détail technique va au journal, jamais à l'écran (il est en anglais, et il peut
 * révéler la structure de la base). La personne voit un message neutre dans sa langue.
 */
export function internalError(request: Request, where: string, cause: unknown): NextResponse {
  console.error(`${where} :`, cause)
  return errorResponse(request, err('erreurInterne'), 500)
}
