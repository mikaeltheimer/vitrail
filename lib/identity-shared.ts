// Identité d'un organisme, telle que l'affichent ses pages : types et règles pures (serveur ET navigateur).
// Le chargement depuis la base est dans lib/identity.ts ; le contexte React, dans components/OrgIdentity.tsx.

import { LOCALES, isLocale, type Locale } from '@/i18n/config'

/** Ce que l'organisme rédige lui-même, résolu pour une langue (champ vide → langue principale → texte neutre). */
export interface OrgTexts {
  name: string
  /** Site web de l'organisme ; '' s'il n'en a pas (le lien est alors masqué). */
  url: string
  /** Présentation ; '' si l'organisme ne l'a pas écrite (la section est alors masquée). */
  about: string
  why: string
  vitrailTitle: string
  /** `question` : la première ; `questions` : toutes (1 à 3), dans l'ordre, tirées au hasard au moment de collecter. */
  testimonial: { question: string; questions: string[]; cta: string; placeholder: string; lead: string; consent: string }
}

export const LEGAL_KEYS = ['entity', 'neq', 'address', 'officerName', 'officerEmail', 'officerPhone', 'retention'] as const
export type LegalKey = (typeof LEGAL_KEYS)[number]
/** Coordonnées juridiques (pages /confidentialite et /conditions). `updated` : date du dernier enregistrement (AAAA-MM-JJ). */
export type LegalInfo = Record<LegalKey | 'updated', string>

export interface Identity {
  /** L'organisme RÉEL dont c'est l'identité (pour un entraînement : son organisme réel). */
  orgId: string
  /** Langues offertes ; la première est la langue principale. */
  locales: Locale[]
  texts: Record<Locale, OrgTexts>
  logoUrl: string | null
  logoSize: [number, number] | null
  iconUrl: string | null
  legal: LegalInfo
  /** Nom affiché comme expéditeur des courriels. */
  senderName: string
  /** Adresse de réponse des courriels (à défaut, celle du responsable des renseignements personnels). */
  replyTo: string | null
  /** Vitrail de démonstration (organisme fictif, lecture seule). */
  showcase: boolean
}

/** Champs que l'organisme rédige, par langue. */
export const TEXT_FIELDS = ['name', 'about', 'why', 'vitrailTitle', 'question', 'question2', 'question3', 'placeholder'] as const
/** Les questions du témoignage : la première est exigée (sinon le texte neutre), les deux autres sont facultatives. */
export const QUESTION_FIELDS = ['question', 'question2', 'question3'] as const satisfies readonly TextField[]
export type TextField = (typeof TEXT_FIELDS)[number]
export type StoredTexts = Partial<Record<Locale, Partial<Record<TextField, string>>>>

/** Longueurs maximales (caractères). */
export const TEXT_MAX: Record<TextField, number> = { name: 80, about: 1200, why: 400, vitrailTitle: 60, question: 120, question2: 120, question3: 120, placeholder: 160 }
export const LEGAL_MAX: Record<LegalKey, number> = { entity: 200, neq: 40, address: 200, officerName: 120, officerEmail: 120, officerPhone: 40, retention: 1500 }

/** Une langue que l'organisme offre : celle demandée si elle l'est, sinon sa langue principale. */
export function clampLocale(locales: readonly Locale[], locale: Locale): Locale {
  return locales.includes(locale) ? locale : (locales[0] ?? 'fr')
}

/** Lit la colonne `locales` (tableau de la base) : au moins une langue connue, sans doublon. */
export function parseLocales(value: unknown): Locale[] {
  const list = Array.isArray(value) ? value.filter(isLocale) : []
  const out = [...new Set(list)] as Locale[]
  return out.length ? out : ['fr']
}

export const ALL_LOCALES = LOCALES

/** Textes neutres de la plateforme, dans une langue, pour un nom d'organisme donné. */
export type Defaults = (locale: Locale, org: string) => Omit<OrgTexts, 'name' | 'url' | 'testimonial'> & { testimonial: Omit<OrgTexts['testimonial'], 'questions'> }

/**
 * Les questions d'une langue : celles de cette langue si elle a sa propre première question, sinon celles de la langue
 * principale (jamais un mélange des deux), sinon la question neutre.
 */
export function resolveQuestions(stored: StoredTexts, locales: Locale[], locale: Locale, fallback: string): string[] {
  const primary = locales[0] ?? 'fr'
  const list = (l: Locale) => QUESTION_FIELDS.map(f => (stored[l]?.[f] ?? '').trim()).filter(Boolean)
  const own = (stored[locale]?.question ?? '').trim() ? list(locale) : []
  const out = own.length ? own : (stored[primary]?.question ?? '').trim() ? list(primary) : []
  return out.length ? [...new Set(out)] : [fallback]
}

/**
 * Textes d'une langue : le champ de cette langue, sinon celui de la langue principale, sinon le texte neutre.
 * `about` n'a pas de texte neutre : vide, la section est masquée. Jamais le texte d'un autre organisme.
 */
export function resolveTexts(stored: StoredTexts, locales: Locale[], fallbackName: string, websiteUrl: string | null, defaults: Defaults, locale: Locale): OrgTexts {
  const primary = locales[0] ?? 'fr'
  const pick = (f: TextField): string => (stored[locale]?.[f] || stored[primary]?.[f] || '').trim()
  const name = pick('name') || fallbackName
  const d = defaults(locale, name)
  return {
    name,
    url: websiteUrl ?? '',
    about: pick('about'),
    why: pick('why') || d.why,
    vitrailTitle: pick('vitrailTitle') || d.vitrailTitle,
    testimonial: (() => {
      const questions = resolveQuestions(stored, locales, locale, d.testimonial.question)
      return { ...d.testimonial, question: questions[0], questions, placeholder: pick('placeholder') || d.testimonial.placeholder }
    })(),
  }
}

/**
 * Exigées avant « Mettre en ligne » (Loi 25 : un responsable joignable). Facultatives : le NEQ ou numéro d'organisme de
 * bienfaisance, et la durée de conservation (vide : la phrase par défaut de la plateforme, voir confidentialite.retentionDefaut).
 */
export const LEGAL_REQUIRED: readonly LegalKey[] = ['entity', 'address', 'officerName', 'officerEmail', 'officerPhone']

/** Ce qui manque avant « Mettre en ligne » (le nom existe dès l'inscription). */
export function missingForLaunch(legal: Partial<LegalInfo>): LegalKey[] {
  return LEGAL_REQUIRED.filter(k => !legal[k]?.trim())
}

/**
 * Téléphone nord-américain mis en forme : « 5146667766 », « 514-666-7766 », « 1 514 666 7766 » → « +1 514 666 7766 ».
 * Un numéro d'ailleurs (ou incomplet) est laissé tel quel, espaces superflus retirés.
 */
export function formatPhone(raw: string): string {
  const s = raw.trim()
  const digits = s.replace(/\D/g, '')
  const ext = s.match(/(?:poste|ext\.?|x)\s*(\d+)\s*$/i)
  const main = ext ? s.slice(0, ext.index).replace(/\D/g, '') : digits
  const nanp = main.length === 10 ? main : main.length === 11 && main.startsWith('1') ? main.slice(1) : null
  if (!nanp || (s.startsWith('+') && !s.startsWith('+1'))) return s.replace(/\s+/g, ' ')
  return `+1 ${nanp.slice(0, 3)} ${nanp.slice(3, 6)} ${nanp.slice(6)}${ext ? ` poste ${ext[1]}` : ''}`
}
