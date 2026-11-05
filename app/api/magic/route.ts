import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { createTokenForEmail } from '@/lib/donations'
import { sendMagicLink } from '@/lib/email'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { validateEmail } from '@/lib/validate'

export const runtime = 'nodejs'

/** « Retrouver mon morceau » : envoie un lien par courriel. La réponse est toujours la même, pour ne pas révéler qui a donné. */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'magic'), 60, 10 * 60_000)) return errorResponse(request, err('tropDeDemandes'), 429)
  const { email } = (await request.json().catch(() => ({}))) as { email?: unknown }
  const v = validateEmail(email)
  if (v.ok) {
    try {
      const token = await createTokenForEmail(v.value)
      if (token) await sendMagicLink(v.value, token)
    } catch (e) {
      console.error('Lien magique non envoyé :', e)
    }
  }
  return NextResponse.json({ ok: true })
}
