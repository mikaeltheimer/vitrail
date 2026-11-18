import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { fetchWhere } from '@/lib/donations'
import { failer } from '@/lib/errors'
import { orgFees } from '@/lib/platform-fee'
import { parseFilter, utcToLocal } from '@/lib/journal'
import { donationsInRange, matchesFilter, type RawDonor } from '@/lib/journal-server'
import { isQuotable, shownTestimonials, signatureOf, type TestimonialDonor } from '@/lib/testimonials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Exports CSV (propriétaire) : ?type=dons (les dons, filtrés comme le journal de la console : ?du=&au=&paiement=&provenance=&q=) ou ?type=liste (donateurs qui ont accepté de recevoir les
// nouvelles de l'organisme, avec la date et la version du consentement : c'est la preuve exigée par la loi anti-pourriel)
// ou ?type=temoignages (témoignages affichés ; ?filtre=citables pour ceux que l'organisme peut citer, avec la date du
// consentement ; jamais le courriel ni la photo, que le consentement ne couvre pas).
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
      // Frais (17 nov.) : seulement ce qui concerne l'organisme, jamais le montant de la contribution du donateur (Mika).
      // frais_stripe_* et commission_* : vides pour un don sans frais connus (comptant, amorçage, dons d'avant le 16 nov.).
      // frais_couverts reste pour les dons d'avant (ancienne case). date_locale : l'heure de l'organisme, celle des filtres.
      ['date', 'date_locale', 'courriel', 'nom', 'don', 'frais_stripe_organisme', 'frais_stripe_donateur', 'frais_stripe_estimes', 'commission_organisme', 'commission_donateur', 'frais_couverts', 'rembourse', 'net', 'litige', 'mode', 'provenance'],
      ...donations.map(n => {
        const d = byId.get(n.donor_id)
        const email = String(d?.email ?? '')
        const f = orgFees(n)
        return [
          n.created_at,
          utcToLocal(new Date(n.created_at)).replace('T', ' '),
          email.endsWith('.invalid') ? '' : email,
          d?.display_name ?? '',
          money(Number(n.amount_cents)),
          f && f.stripeFeeCents !== null ? money(f.stripeOrgCents) : '',
          f && f.stripeFeeCents !== null ? money(f.stripeDonorCents) : '',
          f && f.stripeFeeCents !== null && f.stripeFeeEstimated ? 'oui' : '',
          f ? money(f.commissionOrgCents) : '',
          f ? money(f.commissionDonorCents) : '',
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
  } else if (type === 'temoignages') {
    const onlyQuotable = request.nextUrl.searchParams.get('filtre') === 'citables'
    const list = shownTestimonials(donors as unknown as TestimonialDonor[]).filter(d => !onlyQuotable || isQuotable(d))
    body = csv([
      ['signature', 'temoignage', 'question', 'citable', 'consentement_le', 'modifie_le'],
      ...list.map(d => [
        signatureOf(d) ?? 'Anonyme', // i18n-ok : les exports CSV sont en français, comme leurs en-têtes
        d.message?.trim() ?? '',
        d.message_question ?? '',
        isQuotable(d) ? 'oui' : 'non',
        isQuotable(d) ? (d.quote_consent_at ? utcToLocal(new Date(d.quote_consent_at)).replace('T', ' ') : 'inconnue') : '',
        d.updated_at ? utcToLocal(new Date(d.updated_at)).slice(0, 10) : '',
      ]),
    ])
    name = `temoignages${onlyQuotable ? '-citables' : ''}-${org.slug}-${day}.csv`
  } else {
    return failer(request)('exportInconnu')
  }
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  })
}
