import { NextRequest, NextResponse } from 'next/server'
import { studioAccount } from '@/lib/studio'
import { addDemoPhoto } from '@/lib/demo'
import { PHOTO_MAX_BYTES, isJpeg } from '@/lib/photos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Une photo pour la démo (comptes is_studio) : JPEG carré déjà réduit par le navigateur, attribuée au hasard à un
// morceau nommé sans photo. Section Studio : en français seulement.

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status }) // i18n-ok : section Studio (FR)

export async function POST(request: NextRequest) {
  if (!(await studioAccount(request))) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  const bytes = Buffer.from(await request.arrayBuffer())
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) return fail('Photo trop lourde.') // i18n-ok : section Studio (FR)
  if (!isJpeg(bytes)) return fail('Ce fichier n’est pas un JPEG.') // i18n-ok : section Studio (FR)
  try {
    const r = await addDemoPhoto(bytes)
    if (!r.ok) return fail(r.reason === 'noDemo' ? 'Créez d’abord la démo.' : 'Tous les morceaux nommés ont déjà une photo.', 409) // i18n-ok : section Studio (FR)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Photo de la démo :', e)
    return fail((e as Error).message, 500)
  }
}
