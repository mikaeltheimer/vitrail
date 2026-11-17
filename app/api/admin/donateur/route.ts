import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { FEE_COLUMNS } from '@/lib/billing'
import { orgFees, type FeeRow } from '@/lib/platform-fee'
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
      .select(`id,fee_cents,dispute_status,dispute_due_by,channel,created_at,${FEE_COLUMNS}`)
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
    // Détail des frais de chaque don par carte : propriétaire seulement, et seulement la part qui concerne l'organisme
    // (jamais le montant de la contribution, Mika 17 nov.). Les colonnes brutes ne sortent pas d'ici.
    donations: ((donations.data ?? []) as unknown as (FeeRow & Record<string, unknown>)[]).map(d => ({
      id: d.id,
      amount_cents: d.amount_cents,
      fee_cents: d.fee_cents,
      // Le total payé (don + frais couverts + contribution), pour le remboursement, sans détailler la contribution
      paid_cents: Number(d.amount_cents) + Number(d.fee_cents ?? 0) + Number(d.donor_contribution_cents ?? 0),
      refunded_cents: d.refunded_cents,
      dispute_status: d.dispute_status,
      dispute_due_by: d.dispute_due_by,
      source: d.source,
      channel: d.channel,
      created_at: d.created_at,
      fees: a.ctx.role === 'owner' ? orgFees(d) : null,
    })),
    emails: (emails as { data: unknown[] | null }).data ?? [],
  })
}
