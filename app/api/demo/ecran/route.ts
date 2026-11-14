import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { requireTenant } from '@/lib/tenant'
import { addScreenPiece, isScreenCode, screenPhoto, screenPieces, validateScreenPiece } from '@/lib/demo-screen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Écran jumelé de la démonstration seulement (lib/demo-screen.ts).
// GET ?code=           les morceaux d'essai de la séance (interrogé par /ecran de la démo)
// GET ?code=&photo=id  la photo d'un de ces morceaux
// POST { code, piece } un don d'essai fait par le QR de l'écran (envoyé par /vitrail de la démo)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_BODY = 1_200_000
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

async function demoOrg(request: NextRequest): Promise<{ orgId: string } | { response: Response }> {
  const t = await requireTenant(request)
  if ('response' in t) return t
  // Les vrais organismes n'ont que de vrais dons : ce chemin n'existe que pour la démo
  if (!t.tenant.org.showcase) return { response: errorResponse(request, err('impossibleIci'), 404) }
  return { orgId: t.tenant.org.id }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const code = params.get('code')
    if (!isScreenCode(code)) return errorResponse(request, err('impossibleIci'), 400)
    const o = await demoOrg(request)
    if ('response' in o) return o.response
    const photo = params.get('photo')
    if (photo !== null) {
      if (!UUID_RE.test(photo)) return errorResponse(request, err('impossibleIci'), 400)
      const data = await screenPhoto(o.orgId, code, photo)
      if (!data) return errorResponse(request, err('impossibleIci'), 404)
      const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')
      return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=43200, immutable', 'X-Robots-Tag': 'noindex' } })
    }
    return NextResponse.json({ pieces: await screenPieces(o.orgId, code) }, { headers: NO_STORE })
  } catch (e) {
    console.error('Écran jumelé (lecture) impossible :', e)
    return errorResponse(request, err('indisponible'), 503)
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!rateLimit(clientKey(request, 'demo-ecran'), 20, 60_000)) return errorResponse(request, err('tropDeTentatives'), 429)
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return errorResponse(request, err('impossibleIci'), 413)
    const o = await demoOrg(request)
    if ('response' in o) return o.response
    const body = (await request.json().catch(() => null)) as { code?: unknown; piece?: unknown } | null
    if (!isScreenCode(body?.code)) return errorResponse(request, err('impossibleIci'), 400)
    const piece = validateScreenPiece(body.piece)
    if (!piece.ok) return errorResponse(request, piece.error)
    const r = await addScreenPiece(o.orgId, body.code, piece.value)
    if (r === 'plein') return errorResponse(request, err('tropDeTentatives'), 429)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    console.error('Écran jumelé (envoi) impossible :', e)
    return errorResponse(request, err('indisponible'), 503)
  }
}
