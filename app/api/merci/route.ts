import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { createToken, findByProviderRef, getDonorView } from '@/lib/donations'
import { clientKey, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

/**
 * Page de remerciement : la référence du paiement (impossible à deviner, présente seulement dans l'adresse
 * de retour du donateur) prouve qu'il a donné. Il reçoit alors un lien pour modifier ou agrandir son morceau.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'merci'), 600, 60_000)) return errorResponse(request, err('tropDeRequetes'), 429)
  const { ref } = (await request.json().catch(() => ({}))) as { ref?: string }
  const found = ref ? await findByProviderRef(ref) : null
  // Le webhook de paiement peut arriver quelques secondes après le retour du donateur
  if (!found) return NextResponse.json({ pending: true })

  const donor = await getDonorView(found.donorId)
  if (!donor) return NextResponse.json({ pending: true })

  return NextResponse.json({
    pending: false,
    donorId: donor.id,
    donationCents: found.amountCents,
    totalCents: donor.totalCents,
    name: donor.showName ? donor.name : null,
    color: donor.color,
    photoPending: donor.photoPending,
    hasMessage: !!donor.message,
    token: await createToken(donor.id),
  })
}
