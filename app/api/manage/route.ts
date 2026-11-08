import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { resolveToken, updateDonorProfile, updateTestimonial } from '@/lib/donations'
import { getDb } from '@/lib/db'
import { grantMailingConsent, isSubscribed, withdrawMailingConsent } from '@/lib/consent'
import { localeOf } from '@/lib/i18n'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { requireTenant } from '@/lib/tenant'
import { validateColor, validateMessage, validateProfile } from '@/lib/validate'

export const runtime = 'nodejs'

/** Lecture et modification de son morceau, sur présentation d'un lien magique. Le courriel n'est jamais renvoyé. */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'manage'), 200, 60_000)) return errorResponse(request, err('tropDeRequetes'), 429)
  const t = await requireTenant(request)
  if ('response' in t) return t.response
  const orgId = t.tenant.org.id
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const donor = typeof body.token === 'string' ? await resolveToken(body.token, orgId) : null
  if (!donor) return errorResponse(request, err('lienExpire'), 401)

  if (body.action === 'update') {
    const profile = validateProfile({ showName: body.showName, name: body.name, message: body.message, photoPath: body.photoPath, quoteConsent: body.quoteConsent }, orgId)
    if (!profile.ok) return errorResponse(request, profile.error)
    // photoPath absent = on garde la photo actuelle ; vide = on la retire ; un chemin = nouvelle photo
    if (body.photoPath === undefined) profile.value.photoUrl = donor.photoUrl
    const color = validateColor(body.color)
    await updateDonorProfile(orgId, donor.id, profile.value, color.ok ? color.value : undefined, donor.photoUrl, donor.message)
    return NextResponse.json({ ok: true })
  }

  // Témoignage seul (bandeau de remerciement après le don) : le reste du morceau ne bouge pas
  if (body.action === 'testimonial') {
    const message = validateMessage(body.message)
    if (!message.ok) return errorResponse(request, message.error)
    const { pending } = await updateTestimonial(donor, message.value, body.quoteConsent === true)
    return NextResponse.json({ ok: true, pending })
  }

  // Liste d'envoi de l'organisme : s'inscrire ou se retirer, à tout moment
  if (body.action === 'mailing') {
    if (body.subscribed === true) await grantMailingConsent(donor.id, localeOf(request))
    else await withdrawMailingConsent(donor.id)
    return NextResponse.json({ ok: true, subscribed: body.subscribed === true })
  }

  const { data: m } = await getDb().from('donors').select('mailing_consent_at,mailing_withdrawn_at').eq('id', donor.id).maybeSingle()
  return NextResponse.json({
    mailing: isSubscribed(m ?? {}),
    donorId: donor.id,
    messagePending: donor.messagePending,
    quoteConsent: donor.quoteConsent,
    showName: donor.showName,
    name: donor.showName ? donor.name : '',
    message: donor.message ?? '',
    photoUrl: donor.photoUrl,
    photoPending: donor.photoPending,
    color: donor.color,
    totalCents: donor.totalCents,
  })
}
