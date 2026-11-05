// Langues de Donivers. Voir docs/i18n.md pour le périmètre, le glossaire et l'ordre de résolution.
// Ce module est pur (aucune dépendance à Next) : il sert au proxy, au serveur et au navigateur.

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'fr'

/** Cookie posé par ?lang= et par le sélecteur de langue. */
export const LOCALE_COOKIE = 'donivers_lang'

/** En-tête interne : le proxy y écrit la langue résolue (toujours écrasé, jamais repris du client). */
export const LOCALE_HEADER = 'x-donivers-locale'

/** Étiquette BCP 47 pour Intl (montants, dates, majuscules) et pour <html lang>. */
export const INTL_TAG: Record<Locale, string> = { fr: 'fr-CA', en: 'en-CA' }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * L'anglais s'active par NEXT_PUBLIC_ENGLISH=1 (prévisualisation, essais). Tant qu'il est coupé, tout reste en français,
 * quels que soient le paramètre, le cookie ou le navigateur : on peut fusionner les étapes intermédiaires sans rien changer en ligne.
 * Lu dans le serveur comme dans le navigateur (variable NEXT_PUBLIC_, remplacée au build).
 */
export function englishEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENGLISH === '1'
}

/** Première langue prise en charge dans un en-tête Accept-Language, selon les poids q. Null si aucune. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      const weight = q ? Number(q.slice(2)) : 1
      return { primary: tag.trim().toLowerCase().split('-')[0], weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter(x => x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  for (const { primary } of ranked) if (isLocale(primary)) return primary
  return null
}

export interface LocaleSignals {
  /** Valeur de ?lang=. */
  param?: string | null
  cookie?: string | null
  acceptLanguage?: string | null
}

/** ?lang= → cookie → Accept-Language → français. */
export function resolveLocale({ param, cookie, acceptLanguage }: LocaleSignals): Locale {
  if (!englishEnabled()) return DEFAULT_LOCALE
  if (isLocale(param)) return param
  if (isLocale(cookie)) return cookie
  return fromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE
}
