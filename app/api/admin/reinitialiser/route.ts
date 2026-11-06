import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, resetPassword, sessionCookieOptions } from '@/lib/auth'
import { clientKey, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

// Nouveau mot de passe depuis le lien reçu : les autres sessions sont fermées, celle-ci s'ouvre.
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'admin-reinit'), 20, 10 * 60_000)) return NextResponse.json({ error: 'Trop de tentatives.' }, { status: 429 })
  const b = (await request.json().catch(() => ({}))) as { jeton?: unknown; password?: unknown }
  const r = await resetPassword(typeof b.jeton === 'string' ? b.jeton : '', b.password, request.headers.get('user-agent'))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions(request.headers.get('x-forwarded-host') || request.headers.get('host')))
  return res
}
