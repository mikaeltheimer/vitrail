import { check, done } from './helpers'
import { reset, tables } from './fake-db'

// Journal des dons (console) : fuseau de l'organisme, périodes, filtres, résumé, frais Stripe à la charge de l'organisme.
async function main() {
  const { localToUtc, utcToLocal, periodRange, periodOf, parseFilter, summarize } = await import('../lib/journal')
  const { donationJournal } = await import('../lib/journal-server')

  console.log('Fuseau de l’organisme (America/Toronto)')
  check('hiver : 4 déc. 17 h = 22 h UTC', localToUtc('2026-12-04T17:00')?.toISOString() === '2026-12-04T22:00:00.000Z', localToUtc('2026-12-04T17:00'))
  check('été : 1er juil. 17 h = 21 h UTC', localToUtc('2026-07-01T17:00')?.toISOString() === '2026-07-01T21:00:00.000Z', localToUtc('2026-07-01T17:00'))
  check('passage à l’heure d’été (8 mars 2026, 3 h)', localToUtc('2026-03-08T03:00')?.toISOString() === '2026-03-08T07:00:00.000Z', localToUtc('2026-03-08T03:00'))
  check('retour à l’heure normale (1er nov. 2026, 0 h)', localToUtc('2026-11-01T00:00')?.toISOString() === '2026-11-01T04:00:00.000Z', localToUtc('2026-11-01T00:00'))
  check('aller-retour', utcToLocal(new Date('2026-12-05T06:30:00Z')) === '2026-12-05T01:30')
  check('date impossible refusée', localToUtc('2026-02-30T10:00') === null)

  console.log('Périodes toutes faites')
  const now = new Date('2026-12-05T03:00:00Z') // 4 déc., 22 h à Sutton : « aujourd'hui » = le 4, pas le 5 (UTC)
  check('aujourd’hui suit l’heure de l’organisme', JSON.stringify(periodRange('aujourdhui', now)) === JSON.stringify({ du: '2026-12-04T00:00', au: '2026-12-05T00:00' }), periodRange('aujourdhui', now))
  check('hier', periodRange('hier', now).du === '2026-12-03T00:00')
  check('7 derniers jours', periodRange('semaine', now).du === '2026-11-28T00:00')
  check('ce mois-ci (décembre → janvier)', JSON.stringify(periodRange('mois', now)) === JSON.stringify({ du: '2026-12-01T00:00', au: '2027-01-01T00:00' }))
  check('puce allumée', periodOf(periodRange('hier', now), now) === 'hier' && periodOf({ du: '2026-12-04T17:00', au: '2026-12-05T02:00' }, now) === 'perso' && periodOf({ du: null, au: null }, now) === 'tout')

  console.log('Lecture du filtre')
  const f = parseFilter(new URLSearchParams('du=2026-12-04T17:00&au=bidon&paiement=cash&provenance=Table d’accueil&q=  lou '))
  check('valeurs mal formées ignorées', f.du === '2026-12-04T17:00' && f.au === null && f.paiement === 'cash' && f.provenance === null && f.q === 'lou', f)

  console.log('Journal d’une soirée')
  reset()
  tables.donors = [
    { id: 'd1', organization_id: 'orgA', email: 'lou@exemple.ca', display_name: 'Lou', color: '#F0B24A', hidden: false, erased_at: null },
    { id: 'd2', organization_id: 'orgA', email: 'x@cash.invalid', display_name: 'Jean', color: '#1FA978', hidden: false, erased_at: null },
    { id: 'dB', organization_id: 'orgB', email: 'b@exemple.ca', display_name: 'Autre', color: '#1FA978', hidden: false, erased_at: null },
  ]
  const don = (id: string, org: string, donor: string, at: string, amount: number, extra: Record<string, unknown> = {}) => ({
    id, organization_id: org, donor_id: donor, created_at: at, amount_cents: amount, refunded_cents: 0, source: 'stripe', channel: 'bar', dispute_status: null, fee_cents: null, ...extra,
  })
  tables.donations = [
    don('avant', 'orgA', 'd1', '2026-12-04T21:59:59.000Z', 1000), // 16 h 59 : hors période
    don('n1', 'orgA', 'd1', '2026-12-04T22:00:00.000Z', 5000, { donor_contribution_cents: 300, stripe_fee_actual_cents: 175, platform_fee_cents: 140, contribution_surplus_cents: 125 }), // contribution > frais : 0 $ pour l'organisme ; 125 $ du plafond réglés par la contribution
    don('n2', 'orgA', 'd1', '2026-12-05T02:00:00.000Z', 10000, { refunded_cents: 10000, stripe_fee_estimated_cents: 320, channel: null }), // remboursé plus tard : compte à la date du don
    don('n3', 'orgA', 'd2', '2026-12-05T04:30:00.000Z', 2500, { source: 'cash', channel: null }),
    don('apres', 'orgA', 'd1', '2026-12-05T07:00:00.000Z', 700), // 2 h : « au » exclu
    don('autre', 'orgB', 'dB', '2026-12-05T01:00:00.000Z', 9900),
  ]
  const soir = { du: '2026-12-04T17:00', au: '2026-12-05T02:00', paiement: null, provenance: null, q: '' }
  const j = await donationJournal('orgA', soir, true)
  check('bornes : début compris, fin exclue, autre organisme exclu', j.rows.map(r => r.id).join() === 'n3,n2,n1', j.rows.map(r => r.id))
  check('brut, remboursé, net', j.summary.grossCents === 17500 && j.summary.refundedCents === 10000 && j.summary.netCents === 7500, j.summary)
  check('par mode de paiement (net)', j.summary.byPayment.stripe.cents === 5000 && j.summary.byPayment.stripe.count === 2 && j.summary.byPayment.cash.cents === 2500)
  check('donateurs distincts', j.summary.donors === 2)
  check('frais Stripe à la charge de l’organisme (estimés)', j.summary.stripeFeesCents === 320 && j.summary.stripeFeesEstimated, j.summary)
  check('frais payés par les donateurs, commission par l’organisme et par les contributions', JSON.stringify(j.summary.fees) === JSON.stringify({ stripeDonorCents: 175, commissionOrgCents: 15, commissionDonorCents: 125 }), j.summary.fees)
  const { orgFees } = await import('../lib/platform-fee')
  const of = orgFees(tables.donations.find(n => n.id === 'n1') as never)
  check('orgFees : la part de l’organisme, jamais la contribution', !!of && of.stripeOrgCents === 0 && of.stripeDonorCents === 175 && !('contributionCents' in of), of)
  const refunded = orgFees({ source: 'stripe', amount_cents: 5000, refunded_cents: 5000, donor_contribution_cents: 300, stripe_fee_actual_cents: 175 })
  check('don remboursé : les frais Stripe restent à l’organisme', refunded?.stripeOrgCents === 175 && refunded?.stripeDonorCents === 0, refunded)
  check('provenance : sans provenance = direct, comptant = aucune', j.rows.find(r => r.id === 'n2')?.channel === 'direct' && j.rows.find(r => r.id === 'n3')?.channel === null)
  check('aucune contribution dans la réponse', !JSON.stringify(j).includes('contribution'))
  const v = await donationJournal('orgA', soir, false)
  check('bénévole : pas de frais', v.summary.stripeFeesCents === null && !v.summary.stripeFeesEstimated && v.summary.fees === null)
  check('filtre mode de paiement', (await donationJournal('orgA', { ...soir, paiement: 'cash' }, true)).rows.map(r => r.id).join() === 'n3')
  check('filtre provenance (le comptant n’a pas de provenance)', (await donationJournal('orgA', { ...soir, provenance: 'bar' }, true)).rows.map(r => r.id).join() === 'n1')
  check('filtre donateur (courriel fictif ignoré)', (await donationJournal('orgA', { ...soir, q: 'invalid' }, true)).rows.length === 0 && (await donationJournal('orgA', { ...soir, q: 'jea' }, true)).rows.length === 1)
  check('sans période : tout l’organisme', (await donationJournal('orgA', { du: null, au: null, paiement: null, provenance: null, q: '' }, true)).rows.length === 5)
  check('résumé vide', summarize([]).netCents === 0 && summarize([]).donors === 0)

  done()
}
main()
