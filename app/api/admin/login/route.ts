import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, adminCodeMatches, adminCookieOptions, createAdminCookieValue } from '@/lib/session'
import { clientKey, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'admin-login'), 8, 10 * 60_000)) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })
  }
  const { code } = (await request.json().catch(() => ({}))) as { code?: unknown }
  const cookie = createAdminCookieValue()
  if (!cookie) return NextResponse.json({ error: 'SESSION_SECRET (32 caractères ou plus) et ADMIN_CODE doivent être définis.' }, { status: 500 })
  if (!adminCodeMatches(code)) return NextResponse.json({ error: 'Code invalide.' }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, cookie, adminCookieOptions)
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { ...adminCookieOptions, maxAge: 0 })
  return res
}
