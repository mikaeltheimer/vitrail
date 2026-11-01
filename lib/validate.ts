import { defaultColorFor } from './colors'
import { ANON_LABEL, CONFIG, VALID_COLORS } from './config'
import { validatePhotoPath } from './photos'
import { isProfane } from './profanity'

export { defaultColorFor }

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const LINK_RE = /(https?:|www\.|\.com\b|\.ca\b|\.org\b|\.net\b)/i

/** Retire les caractères de contrôle et compacte les espaces. */
export function clean(input: string): string {
  return input.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function validateEmail(input: unknown): Result<string> {
  if (typeof input !== 'string') return { ok: false, error: 'Courriel requis.' }
  const v = input.trim().toLowerCase()
  if (v.length > 254 || !EMAIL_RE.test(v)) return { ok: false, error: 'Ce courriel ne semble pas valide.' }
  return { ok: true, value: v }
}

export function validateAmountCents(input: unknown): Result<number> {
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'Montant invalide.' }
  if (n < CONFIG.minAmountCents) return { ok: false, error: `Le don minimum est de ${CONFIG.minAmountCents / 100} $.` }
  if (n > CONFIG.maxAmountCents) return { ok: false, error: `Pour un don de plus de ${CONFIG.maxAmountCents / 100} $, parlez-en à l'école.` }
  return { ok: true, value: n }
}

export function validateName(input: unknown): Result<string> {
  if (typeof input !== 'string') return { ok: false, error: 'Nom requis.' }
  const v = clean(input)
  if (v.length < 2) return { ok: false, error: 'Le nom doit compter au moins 2 caractères.' }
  if (v.length > CONFIG.nameMax) return { ok: false, error: `Le nom ne peut dépasser ${CONFIG.nameMax} caractères.` }
  if (LINK_RE.test(v)) return { ok: false, error: 'Le nom ne peut pas contenir de lien.' }
  if (isProfane(v)) return { ok: false, error: "Ce nom contient un mot qui ne peut pas être affiché sur l'écran de l'école." }
  return { ok: true, value: v }
}

export function validateMessage(input: unknown): Result<string | null> {
  if (input == null || input === '') return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, error: 'Message invalide.' }
  const v = clean(input)
  if (!v) return { ok: true, value: null }
  if (v.length > CONFIG.messageMax) return { ok: false, error: `Le message ne peut dépasser ${CONFIG.messageMax} caractères.` }
  if (LINK_RE.test(v)) return { ok: false, error: 'Les liens ne sont pas permis dans le message.' }
  if (isProfane(v)) return { ok: false, error: "Ce message contient un mot qui ne peut pas être affiché sur l'écran de l'école." }
  return { ok: true, value: v }
}

/** Provenance d'une visite ou d'un don (paramètre ?src= des codes QR) : quelques lettres, chiffres et tirets, sinon rien. */
export function cleanChannel(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const v = input.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(v) ? v : null
}

export function validateColor(input: unknown): Result<string> {
  if (typeof input !== 'string' || !VALID_COLORS.includes(input)) return { ok: false, error: 'Couleur invalide.' }
  return { ok: true, value: input }
}

export interface DonorProfileInput {
  showName: boolean
  name: string
  message: string | null
  /** Adresse publique de la photo (bucket « photos »), ou null. Jamais présente sans showName. */
  photoUrl: string | null
}

/** Nom, message et photo d'un profil. Sans consentement d'affichage : « Anonyme », ni message ni photo. */
export function validateProfile(raw: { showName?: unknown; name?: unknown; message?: unknown; photoPath?: unknown }): Result<DonorProfileInput> {
  const showName = raw.showName === true
  if (!showName) return { ok: true, value: { showName: false, name: ANON_LABEL, message: null, photoUrl: null } }
  const name = validateName(raw.name)
  if (!name.ok) return name
  const message = validateMessage(raw.message)
  if (!message.ok) return message
  const photo = validatePhotoPath(raw.photoPath)
  if (!photo.ok) return photo
  return { ok: true, value: { showName: true, name: name.value, message: message.value, photoUrl: photo.value } }
}
