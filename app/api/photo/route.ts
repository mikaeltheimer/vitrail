import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { PHOTO_MAX_BYTES, isJpeg, uploadPhoto } from '@/lib/photos'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { requireTenant } from '@/lib/tenant'

export const runtime = 'nodejs'


/**
 * Envoi d'une photo (JPEG carré, déjà réduit par le navigateur). Public, donc limité : taille, type vérifié sur les octets,
 * cadence par adresse. Le fichier n'apparaît sur l'écran que si le don est fait avec le consentement d'affichage.
 * Rangée dans le dossier de l'organisme de l'adresse (org/<organisme>/d/) : seul cet organisme pourra l'attacher à un don.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'photo'), 80, 60_000)) return errorResponse(request, err('tropDePhotos'), 429)

  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > PHOTO_MAX_BYTES) return errorResponse(request, err('photoTropLourde'), 413)

  const t = await requireTenant(request)
  if ('response' in t) return t.response

  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length > PHOTO_MAX_BYTES) return errorResponse(request, err('photoTropLourde'), 413)
  if (!isJpeg(bytes)) return errorResponse(request, err('photoPasJpeg'))

  try {
    return NextResponse.json({ path: await uploadPhoto(t.tenant.org.id, bytes) })
  } catch (e) {
    console.error('Envoi de la photo échoué :', e)
    return errorResponse(request, err('photoEchec'), 502)
  }
}
