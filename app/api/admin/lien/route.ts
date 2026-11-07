import { NextRequest, NextResponse, after } from 'next/server'
import { linksForEmail } from '@/lib/auth'
import { sendInvitation, sendOrgInvitation, sendPasswordReset } from '@/lib/email'
import { getOrg, orgUrl, baseUrlOf, platformUrl } from '@/lib/tenant'
import { clientKey, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

// « Mot de passe oublié ou première connexion » : on envoie un lien s'il y a lieu, et on répond TOUJOURS la même chose
// (on ne révèle pas si une adresse a un compte). Les courriels partent après la réponse.
export async function POST(request: NextRequest) {
  const ok = NextResponse.json({ ok: true })
  if (!rateLimit(clientKey(request, 'admin-lien'), 10, 10 * 60_000)) return ok
  const { email } = (await request.json().catch(() => ({}))) as { email?: unknown }
  try {
    const links = await linksForEmail(email)
    const base = baseUrlOf(request)
    after(async () => {
      for (const l of links) {
        try {
          if (l.kind === 'password_reset') {
            await sendPasswordReset({ to: l.email, token: l.token, locale: 'fr', baseUrl: base })
          } else if (!l.organizationId) {
            await sendOrgInvitation({ to: l.email, token: l.token, locale: 'fr', baseUrl: platformUrl(request) })
          } else {
            const org = await getOrg(l.organizationId)
            if (org) await sendInvitation({ to: l.email, token: l.token, locale: 'fr', orgName: org.name, organizationId: org.id, role: l.role, baseUrl: orgUrl(org.slug, '', request) })
          }
        } catch (e) {
          console.error('Lien de connexion non envoyé :', e)
        }
      }
    })
  } catch (e) {
    console.error('Demande de lien de connexion :', e)
  }
  return ok
}
