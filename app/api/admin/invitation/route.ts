import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, acceptInvitation, currentAccount, invitationInfo, sessionCookieOptions } from '@/lib/auth'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { failer } from '@/lib/errors'
import { localeOf } from '@/lib/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Ce que la page d'invitation affiche (organisme, rôle, courriel, compte déjà existant ou non)
export async function GET(request: NextRequest) {
  const info = await invitationInfo(request.nextUrl.searchParams.get('jeton') ?? '')
  if (!info) return failer(request)('invitationExpiree', 404)
  const me = await currentAccount()
  const orgName = localeOf(request) === 'en' && info.orgNameEn ? info.orgNameEn : info.orgName
  return NextResponse.json({ email: info.email, role: info.role, orgName, accountExists: info.accountExists, signedInAs: me?.email ?? null })
}

export async function POST(request: NextRequest) {
  const fail = failer(request)
  if (!rateLimit(clientKey(request, 'admin-invitation'), 20, 10 * 60_000)) return fail('tropDeTentativesMinutes', 429)
  const b = (await request.json().catch(() => ({}))) as { jeton?: unknown; name?: unknown; password?: unknown }
  const r = await acceptInvitation(typeof b.jeton === 'string' ? b.jeton : '', {
    name: b.name,
    password: b.password,
    signedIn: await currentAccount(),
    userAgent: request.headers.get('user-agent'),
  })
  if (!r.ok) return fail(r.error)
  const res = NextResponse.json({ ok: true })
  if (r.token) res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions(request.headers.get('x-forwarded-host') || request.headers.get('host')))
  return res
}
