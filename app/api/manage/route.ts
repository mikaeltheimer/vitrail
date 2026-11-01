import { NextRequest, NextResponse } from 'next/server'
import { resolveToken, updateDonorProfile } from '@/lib/donations'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { validateColor, validateProfile } from '@/lib/validate'

export const runtime = 'nodejs'

/** Lecture et modification de son morceau, sur présentation d'un lien magique. Le courriel n'est jamais renvoyé. */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'manage'), 200, 60_000)) return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const donor = typeof body.token === 'string' ? await resolveToken(body.token) : null
  if (!donor) return NextResponse.json({ error: 'Ce lien a expiré. Demandez-en un nouveau.' }, { status: 401 })

  if (body.action === 'update') {
    const profile = validateProfile({ showName: body.showName, name: body.name, message: body.message, photoPath: body.photoPath })
    if (!profile.ok) return NextResponse.json({ error: profile.error }, { status: 400 })
    // photoPath absent = on garde la photo actuelle ; vide = on la retire ; un chemin = nouvelle photo
    if (body.photoPath === undefined) profile.value.photoUrl = donor.photoUrl
    const color = validateColor(body.color)
    await updateDonorProfile(donor.id, profile.value, color.ok ? color.value : undefined, donor.photoUrl)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({
    donorId: donor.id,
    showName: donor.showName,
    name: donor.showName ? donor.name : '',
    message: donor.message ?? '',
    photoUrl: donor.photoUrl,
    photoPending: donor.photoPending,
    color: donor.color,
    totalCents: donor.totalCents,
  })
}
