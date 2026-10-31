import { ANON_LABEL, CONFIG, VALID_COLORS, GLASS_COLORS } from './config'

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
  return { ok: true, value: v }
}

export function validateMessage(input: unknown): Result<string | null> {
  if (input == null || input === '') return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, error: 'Message invalide.' }
  const v = clean(input)
  if (!v) return { ok: true, value: null }
  if (v.length > CONFIG.messageMax) return { ok: false, error: `Le message ne peut dépasser ${CONFIG.messageMax} caractères.` }
  if (LINK_RE.test(v)) return { ok: false, error: 'Les liens ne sont pas permis dans le message.' }
  return { ok: true, value: v }
}

export function validateColor(input: unknown): Result<string> {
  if (typeof input !== 'string' || !VALID_COLORS.includes(input)) return { ok: false, error: 'Couleur invalide.' }
  return { ok: true, value: input }
}

/** Couleur de départ, stable pour un courriel donné. */
export function defaultColorFor(email: string): string {
  let h = 2166136261
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return GLASS_COLORS[(h >>> 0) % GLASS_COLORS.length].value
}

export interface DonorProfileInput {
  showName: boolean
  name: string
  message: string | null
}

/** Nom et message d'un profil. Sans consentement d'affichage, le nom est « Anonyme » et le message est vide. */
export function validateProfile(raw: { showName?: unknown; name?: unknown; message?: unknown }): Result<DonorProfileInput> {
  const showName = raw.showName === true
  if (!showName) return { ok: true, value: { showName: false, name: ANON_LABEL, message: null } }
  const name = validateName(raw.name)
  if (!name.ok) return name
  const message = validateMessage(raw.message)
  if (!message.ok) return message
  return { ok: true, value: { showName: true, name: name.value, message: message.value } }
}
