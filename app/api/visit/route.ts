import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { cleanChannel } from '@/lib/validate'

export const runtime = 'nodejs'

/** Une visite de la page de don, avec sa provenance (?src= du code QR). Comptée une fois par session du navigateur. */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'visit'), 600, 60_000)) return NextResponse.json({ ok: false }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as { channel?: unknown }
  const channel = cleanChannel(body.channel) ?? 'direct'
  const { error } = await getDb().from('visits').insert({ channel })
  if (error) console.error('Visite non comptée :', error.message)
  return NextResponse.json({ ok: !error })
}
