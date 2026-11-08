import { NextRequest, NextResponse, after } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'
import { sendSignupCode } from '@/lib/email'
import { localeOf } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { checkOrgSlug, newSignupCode, signup, signupInvitation, suggestSlug, verifySignupCode } from '@/lib/signup'
import { orgUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Inscription d'un organisme sur invitation. Les erreurs sont des CODES : la page les traduit (français et anglais).
const fail = (code: string, status = 400, detail?: string) => NextResponse.json({ error: code, ...(detail ? { detail } : {}) }, { status })

/** Ce que la page affiche : courriel de l'invitation, nom d'organisme proposé, mot de Studio. */
export async function GET(request: NextRequest) {
  const inv = await signupInvitation(request.nextUrl.searchParams.get('jeton') ?? '')
  if (!inv) return fail('invitation', 404)
  return NextResponse.json({ email: inv.email, orgName: inv.orgName, message: inv.message, locale: inv.locale, slug: inv.orgName ? suggestSlug(inv.orgName) : '' })
}

export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'inscription'), 60, 10 * 60_000)) return fail('trop', 429)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof b.jeton === 'string' ? b.jeton : ''

  if (b.action === 'adresse') {
    // Disponibilité d'une adresse (vérifiée en direct pendant la saisie) ; seulement avec une invitation valide
    if (!(await signupInvitation(token))) return fail('invitation', 404)
    return NextResponse.json(await checkOrgSlug(b.slug))
  }

  const inv = await signupInvitation(token)
  if (!inv) return fail('invitation', 404)

  if (b.action === 'code') {
    const r = await newSignupCode(inv, b.email)
    if (!r.ok) return fail(r.error, r.error === 'trop' ? 429 : 400)
    const locale = localeOf(request)
    after(async () => {
      try {
        await sendSignupCode({ to: r.email, code: r.code, locale })
      } catch (e) {
        console.error('Code de confirmation non envoyé :', e)
      }
    })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'verifier') {
    const r = await verifySignupCode(inv, b.email, b.code)
    return r.ok ? NextResponse.json({ ok: true }) : fail(r.error, r.error === 'trop' ? 429 : 400)
  }

  if (b.action === 'creer') {
    const r = await signup({
      token,
      name: b.name,
      email: b.email,
      password: b.password,
      orgName: b.orgName,
      slug: b.slug,
      terms: b.terms,
      locale: localeOf(request),
      userAgent: request.headers.get('user-agent'),
    })
    if (!r.ok) return fail(r.error, 400, r.detail ? errorMessage(localeOf(request), r.detail) : undefined)
    const res = NextResponse.json({ ok: true, console: orgUrl(r.slug, '/admin', request) })
    res.cookies.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions(request.headers.get('x-forwarded-host') || request.headers.get('host')))
    return res
  }

  return fail('action')
}
