import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { fetchWhere } from '@/lib/donations'
import { failer } from '@/lib/errors'
import { donationFees } from '@/lib/platform-fee'
import { parseFilter, utcToLocal } from '@/lib/journal'
import { donationsInRange, matchesFilter, type RawDonor } from '@/lib/journal-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Exports CSV (propriétaire) : ?type=dons (les dons, filtrés comme le journal de la console : ?du=&au=&paiement=&provenance=&q=) ou ?type=liste (donateurs qui ont accepté de recevoir les
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
    // Mêmes filtres que le journal de la console (période en heure de l'organisme, mode de paiement, provenance, donateur)
    const filter = parseFilter(request.nextUrl.searchParams)
    const { donations: all } = await donationsInRange(org.id, filter)
    const donations = all.filter(n => matchesFilter(n, byId.get(n.donor_id) as RawDonor | undefined, filter))
    donations.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))
    body = csv([
      // contribution, frais_stripe, commission_organisme (C, 16 nov.) ; frais_couverts reste pour les dons d'avant (ancienne case)
      // date_locale (17 nov.) : l'heure de l'organisme, celle des filtres de la console
      ['date', 'date_locale', 'courriel', 'nom', 'don', 'contribution', 'frais_stripe', 'commission_organisme', 'frais_couverts', 'rembourse', 'net', 'litige', 'mode', 'provenance'],
      ...donations.map(n => {
        const d = byId.get(n.donor_id)
        const email = String(d?.email ?? '')
        const f = donationFees(n)
        return [
          n.created_at,
          utcToLocal(new Date(n.created_at)).replace('T', ' '),
          email.endsWith('.invalid') ? '' : email,
          d?.display_name ?? '',
          money(Number(n.amount_cents)),
          f ? money(f.contributionCents) : '',
          f && f.stripeFeeCents !== null ? money(f.stripeFeeCents) : '',
          f ? money(f.orgCommissionCents) : '',
          money(Number(n.fee_cents ?? 0)),
          money(Number(n.refunded_cents)),
          money(Number(n.amount_cents) - Number(n.refunded_cents)),
          n.dispute_status ?? '',
          n.source,
          n.channel ?? '',
        ]
      }),
    ])
    const range = filter.du || filter.au ? `-${(filter.du ?? 'debut').replace(':', 'h')}_${(filter.au ?? 'fin').replace(':', 'h')}` : `-${day}`
    name = `dons-${org.slug}${range}.csv`
  } else {
    return failer(request)('exportInconnu')
  }
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  })
}
