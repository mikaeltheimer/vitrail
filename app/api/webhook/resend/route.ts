import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { STATUS_RANK, type EmailStatus } from '@/lib/email'
import { hasEmailLog } from '@/lib/schema'
import { verifySvix } from '@/lib/svix'

export const runtime = 'nodejs'

// Événements de Resend sur les courriels envoyés : met à jour le journal (envoyé, livré, retardé, rebond, plainte).
// À déclarer chez Resend (Webhooks) vers /api/webhook/resend, avec le secret dans RESEND_WEBHOOK_SECRET.

const STATUS_OF: Record<string, EmailStatus> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
}

interface ResendEvent {
  type?: string
  data?: { email_id?: string; bounce?: { message?: string; type?: string; subType?: string }; failed?: { reason?: string } }
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook non configuré' }, { status: 400 }) // i18n-ok : réponse à Resend, pas au visiteur
  const ok = verifySvix(
    body,
    { id: request.headers.get('svix-id'), timestamp: request.headers.get('svix-timestamp'), signature: request.headers.get('svix-signature') },
    secret,
  )
  if (!ok) return NextResponse.json({ error: 'Signature invalide' }, { status: 400 }) // i18n-ok : réponse à Resend, pas au visiteur

  let event: ResendEvent
  try {
    event = JSON.parse(body) as ResendEvent
  } catch {
    return NextResponse.json({ error: 'Corps illisible' }, { status: 400 }) // i18n-ok : réponse à Resend, pas au visiteur
  }
  const status = event.type ? STATUS_OF[event.type] : undefined
  const providerId = event.data?.email_id
  // Ouvertures, clics et autres événements : ignorés (on ne suit pas les donateurs).
  if (!status || !providerId) return NextResponse.json({ received: true })

  try {
    if (!(await hasEmailLog())) return NextResponse.json({ received: true })
    const db = getDb()
    const { data: row, error } = await db.from('email_log').select('id,status').eq('provider_id', providerId).maybeSingle()
    if (error) throw error
    // Courriel inconnu (autre projet Resend, journal vidé) ou événement plus ancien que l'état connu : rien à faire.
    if (!row || STATUS_RANK[status] <= STATUS_RANK[row.status as EmailStatus]) return NextResponse.json({ received: true })
    const detail = event.data?.bounce?.message || event.data?.failed?.reason || null
    const { error: updateError } = await db
      .from('email_log')
      .update({ status, error: status === 'bounced' || status === 'failed' || status === 'complained' ? detail : null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (updateError) throw updateError
  } catch (e) {
    console.error('Webhook Resend : mise à jour du journal impossible :', e)
    // Resend réessaiera.
    return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 }) // i18n-ok : réponse à Resend, pas au visiteur
  }
  return NextResponse.json({ received: true })
}
