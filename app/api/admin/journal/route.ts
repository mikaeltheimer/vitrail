import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { isAdmin } from '@/lib/session'
import { hasEmailLog } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Journal des courriels pour la console (lecture seule) : compteurs par statut et derniers envois.
// Sans la table email_log (migration 2026-11-05-journal-courriels.sql), « available: false ».
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) // i18n-ok : console admin (FR)
  if (!(await hasEmailLog())) return NextResponse.json({ available: false, counts: {}, rows: [] })
  const db = getDb()
  const [rowsRes, statusRes] = await Promise.all([
    db.from('email_log').select('id,created_at,to_email,kind,status,error,subject').order('created_at', { ascending: false }).limit(100),
    db.from('email_log').select('status').order('created_at', { ascending: false }).limit(2000),
  ])
  if (rowsRes.error || statusRes.error) return NextResponse.json({ error: (rowsRes.error ?? statusRes.error)!.message }, { status: 500 })
  const counts: Record<string, number> = {}
  for (const r of statusRes.data ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1
  return NextResponse.json({ available: true, counts, rows: rowsRes.data ?? [] })
}
