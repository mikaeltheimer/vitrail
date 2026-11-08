import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { hasEmailLog } from '@/lib/schema'
import { internalError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Journal des courriels pour la console (lecture seule) : compteurs par statut et derniers envois.
// Sans la table email_log (migration 2026-11-05-journal-courriels.sql), « available: false ».
// Seulement les courriels de l'organisme de l'adresse : jamais ceux d'un autre.
export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ('response' in a) return a.response
  const orgId = a.ctx.tenant.org.id
  if (!(await hasEmailLog())) return NextResponse.json({ available: false, counts: {}, rows: [] })
  const db = getDb()
  const [rowsRes, statusRes] = await Promise.all([
    db.from('email_log').select('id,created_at,to_email,kind,status,error,subject').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100),
    db.from('email_log').select('status').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(2000),
  ])
  if (rowsRes.error || statusRes.error) return internalError(request, 'Journal des courriels', rowsRes.error ?? statusRes.error)
  const counts: Record<string, number> = {}
  for (const r of statusRes.data ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1
  return NextResponse.json({ available: true, counts, rows: rowsRes.data ?? [] })
}
