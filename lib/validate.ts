import { defaultColorFor } from './colors'
import { ANON_LABEL, CONFIG, VALID_COLORS } from './config'
import { validatePhotoPath } from './photos'
import { isProfane } from './profanity'
import { err, money, type AppError } from './errors'

export { defaultColorFor }

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const LINK_RE = /(https?:|www\.|\.com\b|\.ca\b|\.org\b|\.net\b)/i

/** Retire les caractères de contrôle et compacte les espaces. */
export function clean(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function validateEmail(input: unknown): Result<string> {
  if (typeof input !== 'string') return { ok: false, error: err('courrielRequis') }
  const v = input.trim().toLowerCase()
  if (v.length > 254 || !EMAIL_RE.test(v)) return { ok: false, error: err('courrielInvalide') }
  return { ok: true, value: v }
}

export function validateAmountCents(input: unknown): Result<number> {
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: err('montantInvalide') }
  if (n < CONFIG.minAmountCents) return { ok: false, error: err('montantMin', { montant: money(CONFIG.minAmountCents) }) }
  if (n > CONFIG.maxAmountCents) return { ok: false, error: err('montantMax', { montant: money(CONFIG.maxAmountCents) }) }
  return { ok: true, value: n }
}

export function validateName(input: unknown): Result<string> {
  if (typeof input !== 'string') return { ok: false, error: err('nomRequis') }
  const v = clean(input)
  if (v.length < 2) return { ok: false, error: err('nomCourt') }
  if (v.length > CONFIG.nameMax) return { ok: false, error: err('nomLong', { max: CONFIG.nameMax }) }
  if (LINK_RE.test(v)) return { ok: false, error: err('nomLien') }
  if (isProfane(v)) return { ok: false, error: err('nomGrossier') }
  return { ok: true, value: v }
}

export function validateMessage(input: unknown): Result<string | null> {
  if (input == null || input === '') return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, error: err('temoignageInvalide') }
  const v = clean(input)
  if (!v) return { ok: true, value: null }
  if (v.length > CONFIG.messageMax) return { ok: false, error: err('temoignageLong', { max: CONFIG.messageMax }) }
  if (LINK_RE.test(v)) return { ok: false, error: err('temoignageLien') }
  if (isProfane(v)) return { ok: false, error: err('temoignageGrossier') }
  return { ok: true, value: v }
}

/** Provenance d'une visite ou d'un don (paramètre ?src= des codes QR) : quelques lettres, chiffres et tirets, sinon rien. */
export function cleanChannel(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const v = input.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(v) ? v : null
}

export function validateColor(input: unknown): Result<string> {
  if (typeof input !== 'string' || !VALID_COLORS.includes(input)) return { ok: false, error: err('couleurInvalide') }
  return { ok: true, value: input }
}

export interface DonorProfileInput {
  showName: boolean
  name: string
  message: string | null
  /** Adresse publique de la photo (bucket « photos »), ou null. Possible même sans nom (don anonyme avec photo). */
  photoUrl: string | null
  /** Le donateur permet à l'organisme de citer son témoignage ailleurs (Loi 25 : consentement explicite, jamais par défaut). */
  quoteConsent: boolean
}

/** Nom, message et photo d'un profil. Le nom est facultatif (« Anonyme ») ; message et photo restent possibles sans nom. */
export function validateProfile(raw: { showName?: unknown; name?: unknown; message?: unknown; photoPath?: unknown; quoteConsent?: unknown }): Result<DonorProfileInput> {
  const showName = raw.showName === true
  let name: Result<string> = { ok: true, value: ANON_LABEL }
  if (showName) {
    name = validateName(raw.name)
    if (!name.ok) return name
  }
  const message = validateMessage(raw.message)
  if (!message.ok) return message
  const photo = validatePhotoPath(raw.photoPath)
  if (!photo.ok) return photo
  return { ok: true, value: { showName, name: name.value, message: message.value, photoUrl: photo.value, quoteConsent: raw.quoteConsent === true && !!message.value } }
}
