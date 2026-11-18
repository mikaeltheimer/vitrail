import { NextRequest, NextResponse } from 'next/server'
import { studioAccount } from '@/lib/studio'
import { addDemoPhoto } from '@/lib/demo'
import { projectDemoId } from '@/lib/demo-projets'
import { PHOTO_MAX_BYTES, isJpeg } from '@/lib/photos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Une photo pour une démonstration par projet (comptes is_studio) : POST ?id=… , JPEG carré déjà réduit par le
// navigateur, attribué au hasard à un fragment nommé sans photo. Section Studio : en français seulement.

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: NextRequest) {
  if (!(await studioAccount(request))) return fail('Réservé à Studio Existence.', 403)
  const bytes = Buffer.from(await request.arrayBuffer())
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) return fail('Photo trop lourde.')
  if (!isJpeg(bytes)) return fail('Ce fichier n’est pas un JPEG.')
  try {
    const id = await projectDemoId(request.nextUrl.searchParams.get('id'))
    if (!id) return fail('Cette démonstration n’existe pas.', 404)
    const r = await addDemoPhoto(bytes, id)
    if (!r.ok) return fail('Tous les fragments nommés ont déjà une photo.', 409)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Photo d’une démonstration par projet :', e)
    return fail((e as Error).message, 500)
  }
}
