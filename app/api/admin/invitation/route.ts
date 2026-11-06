import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, acceptInvitation, currentAccount, invitationInfo, sessionCookieOptions } from '@/lib/auth'
import { clientKey, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Ce que la page d'invitation affiche (organisme, rôle, courriel, compte déjà existant ou non)
export async function GET(request: NextRequest) {
  const info = await invitationInfo(request.nextUrl.searchParams.get('jeton') ?? '')
  if (!info) return NextResponse.json({ error: 'Cette invitation a expiré ou a déjà servi. Demandez-en une nouvelle.' }, { status: 404 })
  const me = await currentAccount()
  return NextResponse.json({ email: info.email, role: info.role, orgName: info.orgName, accountExists: info.accountExists, signedInAs: me?.email ?? null })
}

export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'admin-invitation'), 20, 10 * 60_000)) return NextResponse.json({ error: 'Trop de tentatives.' }, { status: 429 })
  const b = (await request.json().catch(() => ({}))) as { jeton?: unknown; name?: unknown; password?: unknown }
  const r = await acceptInvitation(typeof b.jeton === 'string' ? b.jeton : '', {
    name: b.name,
    password: b.password,
    signedIn: await currentAccount(),
    userAgent: request.headers.get('user-agent'),
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  const res = NextResponse.json({ ok: true })
  if (r.token) res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions(request.headers.get('x-forwarded-host') || request.headers.get('host')))
  return res
}
