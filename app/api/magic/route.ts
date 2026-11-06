import { after, NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { createTokenForEmail } from '@/lib/donations'
import { sendMagicLink } from '@/lib/email'
import { localeOf } from '@/lib/i18n'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { validateEmail } from '@/lib/validate'
import { baseUrlOf, requireTenant } from '@/lib/tenant'

export const runtime = 'nodejs'

/** « Retrouver mon morceau » : envoie un lien par courriel. La réponse est toujours la même, pour ne pas révéler qui a donné. */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'magic'), 60, 10 * 60_000)) return errorResponse(request, err('tropDeDemandes'), 429)
  const t = await requireTenant(request)
  if ('response' in t) return t.response
  const orgId = t.tenant.org.id
  const baseUrl = baseUrlOf(request)
  const { email } = (await request.json().catch(() => ({}))) as { email?: unknown }
  const v = validateEmail(email)
  if (v.ok) {
    // Après la réponse : la durée de la requête ne révèle pas si le courriel a déjà donné, et un envoi lent ne fait pas attendre.
    const locale = localeOf(request)
    after(async () => {
      try {
        const found = await createTokenForEmail(orgId, v.value)
        if (found) await sendMagicLink({ to: v.value, token: found.token, locale, donorId: found.donorId, organizationId: orgId, baseUrl })
      } catch (e) {
        console.error('Lien magique non envoyé :', e)
      }
    })
  }
  return NextResponse.json({ ok: true })
}
