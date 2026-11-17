import { NextRequest, NextResponse, after } from 'next/server'
import { confirmEmailChange } from '@/lib/account'
import { sendEmailChanged } from '@/lib/email'
import { localeOf } from '@/lib/i18n'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { failer, internalError } from '@/lib/errors'

export const runtime = 'nodejs'

// Confirmation d'une nouvelle adresse depuis le lien reçu (un bouton, pas un simple GET : les antivirus des messageries
// ouvrent les liens tout seuls). L'ancienne adresse est prévenue.
export async function POST(request: NextRequest) {
  const fail = failer(request)
  if (!rateLimit(clientKey(request, 'compte-courriel'), 20, 10 * 60_000)) return fail('tropDeTentativesMinutes', 429)
  const b = (await request.json().catch(() => ({}))) as { jeton?: unknown }
  try {
    const r = await confirmEmailChange(typeof b.jeton === 'string' ? b.jeton : '')
    if (!r.ok) return fail(r.error)
    const locale = localeOf(request)
    after(async () => {
      try {
        await sendEmailChanged({ to: r.oldEmail, locale, newEmail: r.newEmail })
      } catch (e) {
        console.error('Avis de changement d’adresse non envoyé :', e)
      }
    })
    return NextResponse.json({ ok: true, email: r.newEmail })
  } catch (e) {
    return internalError(request, 'Confirmation d’adresse', e)
  }
}
