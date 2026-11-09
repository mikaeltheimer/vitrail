import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { cleanChannel } from '@/lib/validate'
import { campaignParam, requireTenant } from '@/lib/tenant'

export const runtime = 'nodejs'

/** Une visite de la page de don, avec sa provenance (?src= du code QR). Comptée une fois par session du navigateur. */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'visit'), 600, 60_000)) return NextResponse.json({ ok: false }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as { channel?: unknown; campaign?: unknown }
  const t = await requireTenant(request, campaignParam(body.campaign))
  if ('response' in t) return t.response
  // Démonstration : aucune trace (ses statistiques sont fictives et ne doivent pas bouger)
  if (t.tenant.org.showcase) return NextResponse.json({ ok: true })
  const channel = cleanChannel(body.channel) ?? 'direct'
  const { error } = await getDb().from('visits').insert({ channel, organization_id: t.tenant.org.id, vitrail_id: t.tenant.vitrail.id })
  if (error) console.error('Visite non comptée :', error.message)
  return NextResponse.json({ ok: !error })
}
