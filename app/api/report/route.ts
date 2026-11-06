import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { getDb } from '@/lib/db'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { clean } from '@/lib/validate'
import { requireTenant } from '@/lib/tenant'

export const runtime = 'nodejs'

/** Signalement d'un morceau par un visiteur. L'équipe le voit dans la console et décide (masquer, retirer la photo…). */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'report'), 30, 10 * 60_000)) return errorResponse(request, err('tropDeSignalements'), 429)
  const t = await requireTenant(request)
  if ('response' in t) return t.response
  const orgId = t.tenant.org.id
  const body = (await request.json().catch(() => ({}))) as { donorId?: unknown; reason?: unknown }
  const donorId = typeof body.donorId === 'string' && /^[0-9a-f-]{36}$/i.test(body.donorId) ? body.donorId : null
  if (!donorId) return errorResponse(request, err('morceauInconnu'))
  const reason = typeof body.reason === 'string' ? clean(body.reason).slice(0, 300) || null : null
  // Le morceau doit être celui d'un donateur de cet organisme
  const { data: donor } = await getDb().from('donors').select('id').eq('id', donorId).eq('organization_id', orgId).maybeSingle()
  if (!donor) return errorResponse(request, err('morceauInconnu'))
  const { error } = await getDb().from('reports').insert({ organization_id: orgId, donor_id: donorId, reason })
  if (error) {
    console.error('Signalement non enregistré :', error.message)
    return errorResponse(request, err('signalementEchec'), 500)
  }
  return NextResponse.json({ ok: true })
}
