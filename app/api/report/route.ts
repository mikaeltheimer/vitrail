import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { clean } from '@/lib/validate'

export const runtime = 'nodejs'

/** Signalement d'un morceau par un visiteur. L'équipe le voit dans la console et décide (masquer, retirer la photo…). */
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'report'), 30, 10 * 60_000)) return NextResponse.json({ error: 'Trop de signalements.' }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as { donorId?: unknown; reason?: unknown }
  const donorId = typeof body.donorId === 'string' && /^[0-9a-f-]{36}$/i.test(body.donorId) ? body.donorId : null
  if (!donorId) return NextResponse.json({ error: 'Morceau inconnu.' }, { status: 400 })
  const reason = typeof body.reason === 'string' ? clean(body.reason).slice(0, 300) || null : null
  const { error } = await getDb().from('reports').insert({ donor_id: donorId, reason })
  if (error) {
    console.error('Signalement non enregistré :', error.message)
    return NextResponse.json({ error: "Le signalement n'a pas pu être envoyé." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
