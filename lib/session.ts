import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

// Session admin : un cookie signé (échéance + HMAC), pas une valeur fixe qu'on pourrait fabriquer à la main.
// Variables : ADMIN_CODE (le code à saisir) et SESSION_SECRET (longue chaîne aléatoire, ≥ 32 caractères).

export const ADMIN_COOKIE = 'vitrail_admin'
const MAX_AGE_S = 60 * 60 * 12

function secret(): string | null {
  const s = process.env.SESSION_SECRET
  return s && s.length >= 32 ? s : null
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

export function adminCodeMatches(code: unknown): boolean {
  const expected = process.env.ADMIN_CODE
  if (!expected || typeof code !== 'string') return false
  const a = Buffer.from(code)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createAdminCookieValue(): string | null {
  const key = secret()
  if (!key) return null
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S
  return `${exp}.${sign(String(exp), key)}`
}

export const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: MAX_AGE_S,
  path: '/',
}

export function verifyAdminCookieValue(value: string | undefined): boolean {
  const key = secret()
  if (!key || !value) return false
  const [exp, sig] = value.split('.')
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false
  const expected = sign(exp, key)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Pour les pages et les routes serveur. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies()
  return verifyAdminCookieValue(store.get(ADMIN_COOKIE)?.value)
}
