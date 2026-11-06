import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { fetchWhere } from '@/lib/donations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Exports CSV (propriétaire) : ?type=dons (tous les dons) ou ?type=liste (donateurs qui ont accepté de recevoir les
// nouvelles de l'organisme, avec la date et la version du consentement : c'est la preuve exigée par la loi anti-pourriel).
// Séparateur « ; » et BOM : Excel en français ouvre le fichier correctement.

const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  // Neutralise les formules (=, +, -, @) : un nom de donateur ne doit jamais s'exécuter dans un tableur
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const csv = (rows: unknown[][]) => '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n'
const money = (c: number) => (c / 100).toFixed(2).replace('.', ',')

export async function GET(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return a.response
  const org = a.ctx.tenant.org
  const type = request.nextUrl.searchParams.get('type')
  const donors = await fetchWhere<Record<string, unknown>>('donors', '*', 'organization_id', org.id, 'id')
  const byId = new Map(donors.map(d => [d.id as string, d]))
  const day = new Date().toISOString().slice(0, 10)
  let body: string
  let name: string

  if (type === 'liste') {
    const rows = donors.filter(d => d.mailing_consent_at && !d.mailing_withdrawn_at && !String(d.email).endsWith('.invalid'))
    body = csv([
      ['courriel', 'nom', 'langue', 'consentement_le', 'version_du_texte'],
      ...rows.map(d => [d.email, d.show_name ? d.display_name : '', d.locale ?? 'fr', d.mailing_consent_at, d.mailing_consent_version ?? '']),
    ])
    name = `liste-envoi-${org.slug}-${day}.csv`
  } else if (type === 'dons') {
    const donations = await fetchWhere<Record<string, unknown>>(
      'donations',
      'id,donor_id,amount_cents,fee_cents,refunded_cents,dispute_status,source,channel,created_at',
      'organization_id',
      org.id,
      'id',
    )
    donations.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))
    body = csv([
      ['date', 'courriel', 'nom', 'don', 'frais_couverts', 'rembourse', 'net', 'litige', 'mode', 'provenance'],
      ...donations.map(n => {
        const d = byId.get(n.donor_id as string)
        const email = String(d?.email ?? '')
        return [
          n.created_at,
          email.endsWith('.invalid') ? '' : email,
          d?.display_name ?? '',
          money(Number(n.amount_cents)),
          money(Number(n.fee_cents ?? 0)),
          money(Number(n.refunded_cents)),
          money(Number(n.amount_cents) - Number(n.refunded_cents)),
          n.dispute_status ?? '',
          n.source,
          n.channel ?? '',
        ]
      }),
    ])
    name = `dons-${org.slug}-${day}.csv`
  } else {
    return NextResponse.json({ error: 'Export inconnu.' }, { status: 400 })
  }
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  })
}
