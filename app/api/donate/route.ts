import { NextRequest, NextResponse } from 'next/server'
import { paymentMode } from '@/lib/env'
import { getCurrentEventRow, resolveToken } from '@/lib/donations'
import { startCheckout } from '@/lib/payments'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { defaultColorFor, validateAmountCents, validateColor, validateEmail, validateProfile } from '@/lib/validate'
import { ANON_LABEL } from '@/lib/config'

export const runtime = 'nodejs'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'donate'), 12, 60_000)) return fail('Trop de tentatives. Réessayez dans une minute.', 429)
  if (paymentMode() === 'off') return fail('Les dons en ligne ne sont pas encore ouverts.', 503)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return fail('Requête invalide.')
  }

  const amount = validateAmountCents(body.amountCents)
  if (!amount.ok) return fail(amount.error)

  let email: string
  let profile
  let color: string

  if (typeof body.token === 'string' && body.token) {
    // Donateur reconnu par lien magique : son morceau existe déjà, on ne touche ni au nom ni à la couleur.
    const donor = await resolveToken(body.token)
    if (!donor) return fail('Ce lien a expiré. Demandez-en un nouveau.', 400)
    email = donor.email
    profile = { showName: donor.showName, name: donor.name, message: donor.message, photoUrl: donor.photoUrl }
    color = donor.color
  } else {
    const e = validateEmail(body.email)
    if (!e.ok) return fail(e.error)
    email = e.value
    const p = validateProfile({ showName: body.showName, name: body.name, message: body.message, photoPath: body.photoPath })
    if (!p.ok) return fail(p.error)
    profile = p.value
    const c = validateColor(body.color)
    color = c.ok ? c.value : defaultColorFor(email)
  }

  try {
    const event = await getCurrentEventRow()
    const { url } = await startCheckout({
      email,
      amountCents: amount.value,
      profile: { ...profile, name: profile.showName ? profile.name : ANON_LABEL },
      color,
      eventId: event?.id ?? null,
    })
    return NextResponse.json({ url })
  } catch (e) {
    console.error('Don impossible :', e)
    return fail("Le paiement n'a pas pu démarrer. Réessayez dans un instant.", 502)
  }
}
