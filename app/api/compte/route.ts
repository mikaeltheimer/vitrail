import { NextRequest, NextResponse, after } from 'next/server'
import { SESSION_COOKIE, currentAccount, foreignOrigin, sessionCookieOptions } from '@/lib/auth'
import { accountInfo, cancelEmailChange, changePassword, requestEmailChange, updateName } from '@/lib/account'
import { sendEmailChange } from '@/lib/email'
import { baseUrlOf } from '@/lib/tenant'
import { localeOf } from '@/lib/i18n'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { failer, internalError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mon compte : la personne connectée, quel que soit l'organisme ou le rôle (le compte vaut pour toute la plateforme).
export async function GET(request: NextRequest) {
  const account = await currentAccount()
  if (!account) return failer(request)('connectezVous', 401)
  try {
    const info = await accountInfo(account.id)
    if (!info) return failer(request)('connectezVous', 401)
    return NextResponse.json(info, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return internalError(request, 'Mon compte', e)
  }
}

// { action: 'nom', name } | { action: 'motDePasse', current, next } | { action: 'courriel', email, password } | { action: 'annulerCourriel' }
export async function POST(request: NextRequest) {
  const fail = failer(request)
  if (foreignOrigin(request)) return fail('autreOrigine', 403)
  const account = await currentAccount()
  if (!account) return fail('connectezVous', 401)
  // Mot de passe vérifié à chaque demande sensible : on limite les essais
  if (!rateLimit(clientKey(request, `compte:${account.id}`), 20, 10 * 60_000)) return fail('tropDeTentativesMinutes', 429)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    if (b.action === 'nom') {
      const r = await updateName(account.id, b.name)
      return r.ok ? NextResponse.json({ ok: true }) : fail(r.error)
    }
    if (b.action === 'motDePasse') {
      const r = await changePassword(account.id, b.current, b.next, request.headers.get('user-agent'))
      if (!r.ok) return fail(r.error)
      const res = NextResponse.json({ ok: true })
      res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions(request.headers.get('x-forwarded-host') || request.headers.get('host')))
      return res
    }
    if (b.action === 'courriel') {
      const r = await requestEmailChange(account.id, b.email, b.password)
      if (!r.ok) return fail(r.error)
      // Le lien ramène à l'adresse d'où la demande est faite (la console de l'organisme), dans sa langue
      const base = baseUrlOf(request)
      const locale = localeOf(request)
      const oldEmail = account.email
      after(async () => {
        try {
          await sendEmailChange({ to: r.newEmail, token: r.token, locale, baseUrl: base, oldEmail })
        } catch (e) {
          console.error('Lien de changement d’adresse non envoyé :', e)
        }
      })
      return NextResponse.json({ ok: true, email: r.newEmail })
    }
    if (b.action === 'annulerCourriel') {
      await cancelEmailChange(account.id)
      return NextResponse.json({ ok: true })
    }
    return fail('actionInconnue')
  } catch (e) {
    return internalError(request, 'Mon compte', e)
  }
}
