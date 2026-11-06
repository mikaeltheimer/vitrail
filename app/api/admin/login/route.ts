import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, destroySession, login, sessionCookieOptions } from '@/lib/auth'
import { clientKey, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const hostOf = (r: NextRequest) => r.headers.get('x-forwarded-host') || r.headers.get('host')

// Connexion à la console : courriel + mot de passe. La session vaut pour toute la plateforme ; l'accès à un organisme
// est vérifié ensuite, à chaque requête (lib/auth.ts, requireAdmin). Deux freins : par adresse IP (mémoire de l'instance)
// et par courriel (en base : 10 échecs en 15 minutes bloquent ce courriel).
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'admin-login'), 20, 10 * 60_000)) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 })
  }
  const { email, password } = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown }
  const r = await login(email, password, request.headers.get('user-agent'))
  if (!r.ok) {
    return r.reason === 'locked'
      ? NextResponse.json({ error: 'Trop de tentatives pour ce compte. Réessayez dans 15 minutes, ou choisissez un nouveau mot de passe.' }, { status: 429 })
      : NextResponse.json({ error: 'Courriel ou mot de passe incorrect.' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions(hostOf(request)))
  return res
}

// Déconnexion : la session est effacée en base (le témoin seul ne suffirait pas sur un appareil partagé)
export async function DELETE(request: NextRequest) {
  await destroySession(request.cookies.get(SESSION_COOKIE)?.value)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(hostOf(request), 0))
  return res
}
