import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { localeOf } from '@/lib/i18n'
import { paymentModeFor } from '@/lib/env'
import { resolveToken } from '@/lib/donations'
import { baseUrlOf, campaignParam, resolveTenant, tenantResponse, type Tenant } from '@/lib/tenant'
import { startCheckout } from '@/lib/payments'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { cleanChannel, defaultColorFor, validateAmountCents, validateColor, validateEmail, validateProfile } from '@/lib/validate'
import { ANON_LABEL } from '@/lib/config'
import { feeFor } from '@/lib/fees'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'donate'), 120, 60_000)) return errorResponse(request, err('tropDeTentatives'), 429)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return errorResponse(request, err('requeteInvalide'))
  }

  const resolved = await resolveTenant(request, { vitrailSlug: campaignParam(body.campaign) })
  const stop = tenantResponse(resolved)
  if (stop) return stop
  const { tenant } = resolved as { tenant: Tenant }
  if (paymentModeFor(tenant.org) === 'off') return errorResponse(request, err('donsFermes'), 503)
  if (tenant.vitrail.state === 'closed') return errorResponse(request, err('campagneFermee'), 409)

  const amount = validateAmountCents(body.amountCents)
  if (!amount.ok) return errorResponse(request, amount.error)

  let email: string | null
  let profile
  let color: string

  if (typeof body.token === 'string' && body.token) {
    // Donateur reconnu par lien magique : son morceau existe déjà, on ne touche ni au nom ni à la couleur.
    const donor = await resolveToken(body.token, tenant.org.id)
    if (!donor) return errorResponse(request, err('lienExpire'), 400)
    email = donor.email
    profile = { showName: donor.showName, name: donor.name, message: donor.message, photoUrl: donor.photoUrl, quoteConsent: donor.quoteConsent }
    color = donor.color
  } else {
    // Le courriel est demandé par Stripe au paiement (un champ de moins ici) ; accepté s'il est fourni (anciens liens, tests)
    if (typeof body.email === 'string' && body.email.trim()) {
      const e = validateEmail(body.email)
      if (!e.ok) return errorResponse(request, e.error)
      email = e.value
    } else {
      email = null
    }
    const p = validateProfile({ showName: body.showName, name: body.name, message: body.message, photoPath: body.photoPath, quoteConsent: body.quoteConsent })
    if (!p.ok) return errorResponse(request, p.error)
    profile = p.value
    const c = validateColor(body.color)
    color = c.ok ? c.value : defaultColorFor(email ?? String(Math.random()))
  }

  try {
    const { url } = await startCheckout({
      email,
      // Le don seul fait la taille du morceau ; les frais couverts sont recalculés ici, jamais repris du navigateur
      amountCents: amount.value,
      feeCents: body.coverFees === true ? feeFor(amount.value) : 0,
      returnTo: body.returnTo === 'vitrail' ? 'vitrail' : 'don',
      profile: { ...profile, name: profile.showName ? profile.name : ANON_LABEL },
      color,
      tenant,
      baseUrl: baseUrlOf(request),
      channel: cleanChannel(body.channel),
      locale: localeOf(request),
      mailingConsent: body.mailingConsent === true,
    })
    return NextResponse.json({ url })
  } catch (e) {
    console.error('Don impossible :', e)
    return errorResponse(request, err('paiementEchec'), 502)
  }
}
