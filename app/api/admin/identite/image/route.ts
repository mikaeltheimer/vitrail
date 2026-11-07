import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { PHOTO_BUCKET } from '@/lib/photos'
import { forgetIdentity } from '@/lib/identity'
import { forgetTenantCache } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Logo et icône de l'organisme (propriétaire). Le navigateur réduit l'image et l'envoie en PNG (transparence gardée) :
//   POST ?type=logo|icon&w=<largeur>&h=<hauteur>  (corps : le PNG)     DELETE ?type=logo|icon
// Rangés dans le bucket public sous org/<organisme>/ ; jamais de SVG (un SVG ouvert seul peut exécuter du script).

const MAX_BYTES = 600_000
const COLUMN = { logo: 'logo_path', icon: 'icon_path' } as const
const SIZE_KEY = { logo: 'logoSize', icon: 'iconSize' } as const
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
/** Dimensions lues dans l'en-tête du PNG (bloc IHDR). */
const pngSize = (b: Buffer): [number, number] => [b.readUInt32BE(16), b.readUInt32BE(20)]

async function guard(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return { response: a.response }
  const org = a.ctx.tenant.org
  if (org.practiceOf) return { response: fail("L'entraînement reprend le logo de l'organisme : modifiez-le depuis sa console.") }
  const type = request.nextUrl.searchParams.get('type')
  if (type !== 'logo' && type !== 'icon') return { response: fail('Type inconnu.') }
  return { orgId: org.id, type: type as 'logo' | 'icon' }
}

/** Retire l'ancien fichier s'il est dans le bucket (pas un fichier statique du site). Sans gravité si ça échoue. */
async function removeOld(orgId: string, path: string | null | undefined) {
  if (!path || !path.startsWith(`org/${orgId}/`)) return
  const { error } = await getDb().storage.from(PHOTO_BUCKET).remove([path])
  if (error) console.error('Ancien logo non supprimé (sans gravité) :', error.message)
}

export async function POST(request: NextRequest) {
  const g = await guard(request)
  if ('response' in g) return g.response
  const bytes = Buffer.from(await request.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_BYTES) return fail('Image trop lourde (600 Ko au plus).')
  if (!isPng(bytes)) return fail('Image illisible : envoyez un PNG ou un JPEG.')
  const [w, h] = pngSize(bytes)
  if (!w || !h || w > 2000 || h > 2000) return fail('Dimensions invalides.')

  const db = getDb()
  const path = `org/${g.orgId}/${g.type}-${randomUUID()}.png`
  const { error: upErr } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/png', cacheControl: '31536000', upsert: false })
  if (upErr) throw upErr
  const { data: cur, error: curErr } = await db.from('organizations').select('logo_path,icon_path,theme').eq('id', g.orgId).single()
  if (curErr) throw curErr
  const theme = { ...((cur.theme as Record<string, unknown> | null) ?? {}), [SIZE_KEY[g.type]]: [w, h] }
  const { error } = await db.from('organizations').update({ [COLUMN[g.type]]: path, theme }).eq('id', g.orgId)
  if (error) {
    await db.storage.from(PHOTO_BUCKET).remove([path])
    throw error
  }
  await removeOld(g.orgId, cur[COLUMN[g.type]] as string | null)
  forgetTenantCache()
  forgetIdentity()
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const g = await guard(request)
  if ('response' in g) return g.response
  const db = getDb()
  const { data: cur, error: curErr } = await db.from('organizations').select('logo_path,icon_path').eq('id', g.orgId).single()
  if (curErr) throw curErr
  const { error } = await db.from('organizations').update({ [COLUMN[g.type]]: null }).eq('id', g.orgId)
  if (error) throw error
  await removeOld(g.orgId, cur[COLUMN[g.type]] as string | null)
  forgetTenantCache()
  forgetIdentity()
  return NextResponse.json({ ok: true })
}
