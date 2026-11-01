import { NextRequest, NextResponse } from 'next/server'
import { PHOTO_MAX_BYTES, isJpeg, uploadPhoto } from '@/lib/photos'
import { clientKey, rateLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

/**
 * Envoi d'une photo (JPEG carré, déjà réduit par le navigateur). Public, donc limité : taille, type vérifié sur les octets,
 * cadence par adresse. Le fichier n'apparaît sur l'écran que si le don est fait avec le consentement d'affichage.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'photo'), 80, 60_000)) return fail('Trop de photos envoyées. Réessayez dans une minute.', 429)

  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > PHOTO_MAX_BYTES) return fail('Photo trop lourde.', 413)

  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length > PHOTO_MAX_BYTES) return fail('Photo trop lourde.', 413)
  if (!isJpeg(bytes)) return fail("Ce fichier n'est pas une photo JPEG valide.")

  try {
    return NextResponse.json({ path: await uploadPhoto(bytes) })
  } catch (e) {
    console.error('Envoi de la photo échoué :', e)
    return fail("La photo n'a pas pu être enregistrée.", 502)
  }
}
