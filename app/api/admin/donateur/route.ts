import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { hasEmailLog } from '@/lib/schema'
import { failer, internalError } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Fiche d'un donateur (console, onglet Dons) : ses dons et les courriels qu'il a reçus, dans CET organisme seulement.
export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ('response' in a) return a.response
  const orgId = a.ctx.tenant.org.id
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const db = getDb()
  const { data: donor, error } = await db.from('donors').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle()
  if (error) return internalError(request, 'Fiche donateur', error)
  if (!donor) return failer(request)('donateurInconnu', 404)
  const [donations, emails] = await Promise.all([
    db
      .from('donations')
      .select('id,amount_cents,fee_cents,refunded_cents,dispute_status,dispute_due_by,source,channel,created_at')
      .eq('organization_id', orgId)
      .eq('donor_id', id)
      .order('created_at', { ascending: false }),
    (await hasEmailLog())
      ? db.from('email_log').select('id,created_at,kind,status,to_email,error').eq('organization_id', orgId).eq('donor_id', id).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (donations.error) return internalError(request, 'Fiche donateur', donations.error)
  const d = donor as Record<string, unknown>
  return NextResponse.json({
    donor: {
      id: d.id,
      email: d.email,
      display_name: d.display_name,
      show_name: d.show_name,
      message: d.message,
      message_status: d.message_status ?? 'approved',
      photo_url: d.photo_url,
      photo_status: d.photo_status,
      color: d.color,
      hidden: d.hidden,
      locale: d.locale ?? 'fr',
      created_at: d.created_at,
      mailing_consent_at: d.mailing_consent_at ?? null,
      erased_at: d.erased_at ?? null,
    },
    donations: donations.data ?? [],
    emails: (emails as { data: unknown[] | null }).data ?? [],
  })
}
