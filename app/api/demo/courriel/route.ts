import { NextRequest, NextResponse } from 'next/server'
import { buildReceipt, emailIdentity } from '@/lib/email'
import { renderEmail } from '@/lib/emailTemplate'
import { err, errorResponse } from '@/lib/errors'
import { getIdentity } from '@/lib/identity'
import { localeOf } from '@/lib/i18n'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { baseUrlOf, requireTenant } from '@/lib/tenant'
import { validateAmountCents } from '@/lib/validate'
import { isLocale } from '@/i18n/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Vitrail de démonstration seulement (étape G) : le courriel de remerciement que recevrait le donateur, rendu sans envoi.
// Reçoit le montant et la langue, rien d'autre (ni nom, ni témoignage, ni photo) ; ne lit ni n'écrit aucune donnée de donateur.
// Le lien du courriel porte un jeton bidon (« demonstration ») : il mène à « ce lien a expiré » ; l'aperçu le désactive.
export async function GET(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'demo-courriel'), 30, 60_000)) return errorResponse(request, err('tropDeTentatives'), 429)
  const t = await requireTenant(request)
  if ('response' in t) return t.response
  const org = t.tenant.org
  // Les vrais organismes envoient le vrai reçu : cet aperçu public n'existe que pour la démo
  if (!org.showcase) return errorResponse(request, err('impossibleIci'), 404)

  const params = request.nextUrl.searchParams
  const amount = validateAmountCents(Number(params.get('montant')))
  if (!amount.ok) return errorResponse(request, amount.error)
  const lang = params.get('lang')
  const identity = await getIdentity(org)
  if (!identity) return errorResponse(request, err('indisponible'), 503)

  const e = emailIdentity(identity, isLocale(lang) ? lang : localeOf(request))
  const built = buildReceipt({ amountCents: amount.value, token: 'demonstration', locale: e.locale, baseUrl: baseUrlOf(request), org: e.build.org })
  const { html } = renderEmail(built.content, e.locale, e.from.header)
  return NextResponse.json(
    { subject: built.subject, fromName: e.from.fromName, html },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  )
}
