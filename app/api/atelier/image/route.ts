import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { PHOTO_BUCKET } from '@/lib/photos'
import { setDraftImage } from '@/lib/atelier'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Logo et icône du BROUILLON, depuis l'atelier (propriétaire). Le navigateur réduit l'image et l'envoie en PNG :
//   POST ?type=logo|icon  (corps : le PNG)     DELETE ?type=logo|icon
// Rangés dans le bucket public sous org/<organisme réel>/ ; jamais de SVG (un SVG ouvert seul peut exécuter du script).

const MAX_BYTES = 600_000
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
const isPng = (b: Uint8Array) => b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
/** Dimensions lues dans l'en-tête du PNG (bloc IHDR). */
const pngSize = (b: Buffer): [number, number] => [b.readUInt32BE(16), b.readUInt32BE(20)]

async function guard(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return { response: a.response }
  const org = a.ctx.tenant.org
  if (!org.practiceOf) return { response: fail("Le logo se modifie dans l'atelier.") }
  const type = request.nextUrl.searchParams.get('type')
  if (type !== 'logo' && type !== 'icon') return { response: fail('Type inconnu.') }
  return { orgId: org.practiceOf, type: type as 'logo' | 'icon' }
}

export async function POST(request: NextRequest) {
  const g = await guard(request)
  if ('response' in g) return g.response
  const bytes = Buffer.from(await request.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_BYTES) return fail('Image trop lourde (600 Ko au plus).')
  if (!isPng(bytes)) return fail('Image illisible : envoyez un PNG, un JPEG ou un SVG.')
  const [w, h] = pngSize(bytes)
  if (!w || !h || w > 2000 || h > 2000) return fail('Dimensions invalides.')
  const path = `org/${g.orgId}/${g.type}-${randomUUID()}.png`
  const { error } = await getDb().storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/png', cacheControl: '31536000', upsert: false })
  if (error) throw error
  try {
    await setDraftImage(g.orgId, g.type, path, [w, h])
  } catch (e) {
    await getDb().storage.from(PHOTO_BUCKET).remove([path])
    throw e
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const g = await guard(request)
  if ('response' in g) return g.response
  await setDraftImage(g.orgId, g.type, null, null)
  return NextResponse.json({ ok: true })
}
