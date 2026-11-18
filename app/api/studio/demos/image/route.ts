import { NextRequest, NextResponse } from 'next/server'
import { studioAccount } from '@/lib/studio'
import { setProjectDemoImage } from '@/lib/demo-projets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Logo ou icône d'une démonstration par projet (comptes is_studio). Le navigateur réduit l'image et l'envoie en PNG,
// comme dans l'atelier (jamais de SVG) :   POST ?id=…&type=logo|icon (corps : le PNG)   DELETE ?id=…&type=logo|icon
// Section Studio : en français seulement.

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
const MAX_BYTES = 600_000

function target(request: NextRequest): { id: string; type: 'logo' | 'icon' } | null {
  const id = request.nextUrl.searchParams.get('id')
  const type = request.nextUrl.searchParams.get('type')
  return id && (type === 'logo' || type === 'icon') ? { id, type } : null
}

async function handle(request: NextRequest, withBody: boolean) {
  if (!(await studioAccount(request))) return fail('Réservé à Studio Existence.', 403)
  const t = target(request)
  if (!t) return fail('Requête invalide.')
  try {
    let bytes: Buffer | null = null
    if (withBody) {
      bytes = Buffer.from(await request.arrayBuffer())
      if (!bytes.length || bytes.length > MAX_BYTES) return fail('Image trop lourde (600 ko au plus).')
    }
    const r = await setProjectDemoImage(t.id, t.type, bytes)
    if (r.ok) return NextResponse.json({ ok: true })
    return r.error === 'introuvable' ? fail('Cette démonstration n’existe pas.', 404) : fail('Image illisible : un PNG de 2000 pixels au plus.')
  } catch (e) {
    console.error('Image d’une démonstration par projet :', e)
    return fail((e as Error).message, 500)
  }
}

export const POST = (request: NextRequest) => handle(request, true)
export const DELETE = (request: NextRequest) => handle(request, false)
