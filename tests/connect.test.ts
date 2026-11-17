import { check, done, mocks } from './helpers'
import { calls, reset, rpcs, tables } from './fake-db'

// ── Faux Stripe et faux next/server (le webhook se teste sans réseau) ───────────────────────────
const feeRefunds: { id: string; amount: number; key: string }[] = []
const fees: Record<string, { amount: number; amount_refunded: number }> = {}
const sessionsByIntent: Record<string, { id: string; metadata?: Record<string, string> }> = {}
const created: { params: Record<string, any>; opts: Record<string, any> }[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
const accountCalls: { params: Record<string, any>; opts?: Record<string, any> }[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
// Paiements vus depuis les comptes connectés (pour le remboursement depuis la console), par session Checkout
const charges: Record<string, { account: string; charge: { id: string; amount: number; amount_refunded: number; application_fee: string | null; disputed?: boolean } }> = {}
const refundsMade: { params: Record<string, any>; opts: Record<string, any> }[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
const seenKeys = new Set<string>()
// Paiements lus au règlement (frais réels sur la balance transaction du compte connecté)
const intents: Record<string, { account: string; latest_charge: Record<string, unknown> }> = {}
const fakeStripe = {
  paymentIntents: {
    retrieve: async (id: string, _p: unknown, opts: { stripeAccount: string }) => {
      const x = intents[id]
      if (!x || x.account !== opts.stripeAccount) throw new Error('No such payment_intent')
      return { id, latest_charge: x.latest_charge }
    },
  },
  charges: {
    retrieve: async (id: string, _p: unknown, opts: { stripeAccount: string }) => {
      const x = Object.values(charges).find(c => c.charge.id === id && c.account === opts.stripeAccount)
      if (!x) throw new Error('No such charge')
      return { ...x.charge, payment_intent: `pi_${id}` }
    },
  },
  refunds: {
    create: async (params: Record<string, any>, opts: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (seenKeys.has(opts.idempotencyKey)) return { id: 're_same', status: 'succeeded' }
      seenKeys.add(opts.idempotencyKey)
      refundsMade.push({ params, opts })
      const c = Object.values(charges).find(x => x.account === opts.stripeAccount && `pi_${x.charge.id}` === params.payment_intent)!.charge
      const before = c.amount_refunded
      c.amount_refunded += params.amount
      // refund_application_fee : Stripe rend la part proportionnelle de la commission
      if (params.refund_application_fee && c.application_fee) {
        const f = fees[c.application_fee]
        const due = c.amount_refunded >= c.amount ? f.amount : Math.floor((f.amount * c.amount_refunded) / c.amount)
        f.amount_refunded = Math.max(f.amount_refunded, due)
      }
      void before
      return { id: 're_' + refundsMade.length, status: 'succeeded' }
    },
  },
  accounts: {
    create: async (params: Record<string, unknown>, opts?: Record<string, unknown>) => { accountCalls.push({ params, opts }); return { id: 'acct_NEW' } },
    retrieve: async (id: string) => ({ id, controller: { stripe_dashboard: { type: id === 'acct_FULL' ? 'full' : 'express' } } }),
    createLoginLink: async () => ({ url: 'https://connect.stripe.com/express/login' }),
  },
  accountLinks: { create: async () => ({ url: 'https://connect.stripe.com/setup/x' }) },
  webhooks: { constructEvent: (body: string, _sig: string, secret: string) => { if (secret !== 'whsec_connect') throw new Error('bad'); return JSON.parse(body) } },
  checkout: { sessions: {
    retrieve: async (id: string, _p: unknown, opts: { stripeAccount: string }) => {
      const x = charges[id]
      if (!x || x.account !== opts.stripeAccount) throw new Error('No such checkout.session')
      return { id, payment_intent: { id: `pi_${x.charge.id}`, latest_charge: { ...x.charge } } }
    },
    create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => { created.push({ params, opts }); return { url: 'https://checkout.test/x' } }, list: async ({ payment_intent }: { payment_intent: string }, opts: { stripeAccount: string }) => { void opts; return { data: sessionsByIntent[payment_intent] ? [sessionsByIntent[payment_intent]] : [] } } } },
  applicationFees: {
    retrieve: async (id: string) => ({ id, ...fees[id] }),
    createRefund: async (id: string, p: { amount: number }, o: { idempotencyKey: string }) => { feeRefunds.push({ id, amount: p.amount, key: o.idempotencyKey }); fees[id].amount_refunded += p.amount; return {} },
  },
}
mocks['@/lib/payments'] = { getStripe: () => fakeStripe }
mocks['./payments'] = { getStripe: () => fakeStripe }
mocks['stripe'] = function FakeStripe() { return fakeStripe }
mocks['@/lib/email'] = { sendReceipt: async () => true }
mocks['next/server'] = {
  after: () => undefined,
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect'
process.env.PAYMENT_MODE = 'stripe'
process.env.STRIPE_SECRET_KEY = 'sk_test_x'

async function main() {
  const { parseBillingSchedule, DEFAULT_BILLING_SCHEDULE } = await import('../lib/platform-fee')
  const { paymentModeFor } = await import('../lib/env')
  const { forgetTenantCache } = await import('../lib/tenant')
  const { POST } = await import('../app/api/webhook/stripe/route')

  console.log('Grille (la règle elle-même : tests/contribution.test.ts)')
  const S = DEFAULT_BILLING_SCHEDULE
  check('grille de l\'ancienne forme en base : modèle plafonné par défaut', JSON.stringify(parseBillingSchedule({ rate: 0.028, tierRate: 0.005, tierAfterCents: 500000 })) === JSON.stringify(S))

  console.log('Mode de paiement par organisme')
  check('brouillon : dons fermés (on s\'exerce sur l\'entraînement)', paymentModeFor({ status: 'draft', stripeReady: true }) === 'off')
  check('entraînement : toujours démo, jamais Stripe', paymentModeFor({ status: 'live', stripeReady: true, practiceOf: 'orgA' }) === 'demo')
  check('en ligne et compte prêt : Stripe', paymentModeFor({ status: 'live', stripeReady: true }) === 'stripe')
  check('en ligne, compte pas prêt : dons fermés', paymentModeFor({ status: 'live', stripeReady: false }) === 'off')
  check('suspendu : fermé', paymentModeFor({ status: 'suspended', stripeReady: true }) === 'off')
  process.env.PAYMENT_MODE = 'demo'
  check('interrupteur maître en démo : tout en démo', paymentModeFor({ status: 'live', stripeReady: true }) === 'demo')
  process.env.PAYMENT_MODE = 'stripe'

  console.log('Webhook Connect')
  const settleCalls: Record<string, unknown>[] = []
  const capWaive = { cents: 0 }
  const seed = () => {
    reset(); forgetTenantCache()
    for (const k of Object.keys(fees)) delete fees[k]
    for (const k of Object.keys(sessionsByIntent)) delete sessionsByIntent[k]
    feeRefunds.length = 0
    for (const k of Object.keys(intents)) delete intents[k]
    settleCalls.length = 0
    // settle_platform_fee simulé (la vraie est éprouvée sur PostgreSQL) : surplus réel = min(S, C − frais réels), plus
    // un excédent de plafond réglable ; un don déjà réglé renvoie le même résultat
    rpcs.settle_platform_fee = args => {
      settleCalls.push(args)
      const d = tables.donations.find(x => x.id === args.p_donation)!
      if (d.platform_fee_settled_at) return [{ waived_cents: d.platform_fee_waived_cents, surplus_cents: d.contribution_surplus_cents, settled_now: false, already_settled: true }]
      const surplus = Number(d.contribution_surplus_cents ?? 0)
      const real = args.p_stripe_fee_actual == null ? surplus : Math.min(surplus, Math.max(0, Number(d.donor_contribution_cents ?? 0) - Number(args.p_stripe_fee_actual)))
      const waived = surplus - real + capWaive.cents
      Object.assign(d, { platform_fee_waived_cents: waived, contribution_surplus_cents: real, platform_fee_settled_at: 'maintenant', stripe_fee_actual_cents: args.p_stripe_fee_actual ?? null })
      return [{ waived_cents: waived, surplus_cents: real, settled_now: false, already_settled: false }]
    }
    capWaive.cents = 0
    tables.organizations = [
      { id: 'orgA', status: 'live', name_fr: 'École A', texts: {}, photo_moderation: 'live', stripe_account_id: 'acct_A', stripe_ready: false, tax_province: 'QC' },
      { id: 'orgB', status: 'live', name_fr: 'Musée B', texts: {}, photo_moderation: 'live', stripe_account_id: 'acct_B', stripe_ready: false },
    ]
    tables.organization_slugs = [{ slug: 'ecoleartsutton', organization_id: 'orgA', is_current: true }, { slug: 'musee', organization_id: 'orgB', is_current: true }]
    tables.vitraux = [
      { id: 'permA', organization_id: 'orgA', kind: 'permanent', slug: null, name: 'A', state: 'active', in_main: true, goal_cents: 0 },
      { id: 'closedA', organization_id: 'orgA', kind: 'campaign', slug: 'vieux', name: 'Vieux', state: 'closed', in_main: true, goal_cents: 0 },
      { id: 'permB', organization_id: 'orgB', kind: 'permanent', slug: null, name: 'B', state: 'active', in_main: true, goal_cents: 0 },
    ]
  }
  const send = async (event: object, signed = true) => {
    const req = { text: async () => JSON.stringify(event), headers: { get: (h: string) => (h === 'stripe-signature' && signed ? 'sig' : null) } }
    return (await POST(req as never)) as unknown as { status: number }
  }
  const session = (over: Record<string, unknown> = {}, meta: Record<string, string> = {}) => ({
    type: 'checkout.session.completed',
    account: 'acct_A',
    data: { object: { id: 'cs_live_000001', payment_status: 'paid', amount_total: 5200, customer_details: { email: 'ana@x.ca' }, metadata: { orgId: 'orgA', vitrailId: 'permA', email: 'ana@x.ca', name: 'Ana', showName: '1', feeCents: '200', platformFee: '140', lang: 'fr', ...meta }, ...over } },
  })

  seed()
  let r = await send(session())
  check('don valide : enregistré', r.status === 200 && tables.donations?.length === 1)
  const d0 = tables.donations?.[0]
  check('ses montants : don 50 $, frais couverts 2 $, commission 1,40 $', d0?.amount_cents === 5000 && d0?.fee_cents === 200 && d0?.platform_fee_cents === 140)
  check('rangé chez l\'organisme du compte', d0?.organization_id === 'orgA' && d0?.vitrail_id === 'permA')

  seed()
  await send(session({}, { orgId: 'orgB', vitrailId: 'permB' }))
  check('métadonnée qui contredit le compte : ignorée, rien chez B', !tables.donations?.length)

  seed()
  await send(session({}, { vitrailId: 'permB' }))
  r = await send(session({ id: 'cs_live_000002' }, { vitrailId: 'permB' }))
  check('vitrail d\'un autre organisme : refusé (500, Stripe réessaiera)', r.status === 500 && !tables.donations?.length)

  seed()
  await send({ ...session(), account: undefined })
  check('événement sans compte (plateforme) : ignoré', !tables.donations?.length)

  seed()
  r = await send({ ...session(), account: 'acct_INCONNU' })
  check('compte inconnu : accepté et ignoré', r.status === 200 && !tables.donations?.length)

  seed()
  const foreign = session(); (foreign.data.object.metadata as Record<string, string>).orgId = ''
  await send(foreign)
  check('session qui n\'est pas de Donivers : ignorée', !tables.donations?.length)

  seed()
  await send(session({}, { vitrailId: 'closedA' }))
  check('campagne close : le don payé est quand même consigné', tables.donations?.length === 1 && tables.donations[0].vitrail_id === 'closedA')

  seed()
  r = await send(session(), false)
  check('sans signature : refusé', r.status === 400)

  seed()
  await send(session()); await send(session())
  check('événement rejoué : un seul don', tables.donations?.length === 1)

  seed()
  await send({ type: 'account.updated', account: 'acct_A', data: { object: { id: 'acct_A', charges_enabled: true, details_submitted: true } } })
  check('account.updated : l\'organisme devient prêt', tables.organizations.find(o => o.id === 'orgA')!.stripe_ready === true && tables.organizations.find(o => o.id === 'orgB')!.stripe_ready === false)
  await send({ type: 'account.updated', account: 'acct_A', data: { object: { id: 'acct_A', charges_enabled: false, details_submitted: true } } })
  check('account.updated : paiements désactivés par Stripe → plus prêt', tables.organizations.find(o => o.id === 'orgA')!.stripe_ready === false)
  await send({ type: 'account.updated', account: 'acct_B', data: { object: { id: 'acct_B', country: 'CA', charges_enabled: true, details_submitted: true, company: { address: { state: 'on' } } } } })
  check('account.updated : province lue sur l\'adresse de l\'entreprise', tables.organizations.find(o => o.id === 'orgB')!.tax_province === 'ON')
  await send({ type: 'account.updated', account: 'acct_B', data: { object: { id: 'acct_B', country: 'CA', charges_enabled: true, details_submitted: true } } })
  check('account.updated sans adresse : la province connue reste', tables.organizations.find(o => o.id === 'orgB')!.tax_province === 'ON')

  console.log('Contribution et règlement')
  const contribSession = (over: Record<string, unknown> = {}) =>
    session({ id: 'cs_contrib', amount_total: 14375, payment_intent: 'pi_contrib', ...over }, { feeCents: '0', platformFee: '1428', contribution: '1875', contributionSurplus: '1428', stripeFeeEstimate: '447', contributionSuggested: '1875', contributionVersion: '2026-11-16' })
  const realFee = (stripeFee: number) => {
    intents['pi_contrib'] = { account: 'acct_A', latest_charge: { id: 'ch_contrib', application_fee: 'fee_contrib', balance_transaction: { fee_details: [{ type: 'stripe_fee', amount: stripeFee }, { type: 'application_fee', amount: 1428 }] } } }
    fees['fee_contrib'] = { amount: 1428, amount_refunded: 0 }
  }
  seed()
  realFee(447)
  r = await send(contribSession())
  const dc = () => tables.donations.find(x => x.provider_ref === 'cs_contrib')!
  check('don et contribution séparés : le don reste 125 $', r.status === 200 && dc().amount_cents === 12500 && dc().donor_contribution_cents === 1875)
  check('suggestion montrée et version gardées', dc().contribution_suggested_cents === 1875 && dc().contribution_brackets_version === '2026-11-16' && dc().stripe_fee_estimated_cents === 447)
  check('règlement appelé avec les frais réels (sans la commission de Donivers)', settleCalls.length === 1 && settleCalls[0].p_stripe_fee_actual === 447)
  check('frais réels = estimés : rien n\'est rendu', feeRefunds.length === 0 && dc().platform_fee_waived_cents === 0)
  check('taxes du Québec comprises dans ce que garde Donivers', dc().tax_province === 'QC' && dc().tax_included_cents === 1428 - Math.round(1428 / 1.14975))

  seed()
  realFee(560) // carte étrangère : 5,60 $ au lieu de 4,47 $
  await send(contribSession())
  check('frais réels plus élevés : la différence (1,13 $) est rendue à l\'organisme', feeRefunds.length === 1 && feeRefunds[0].amount === 113 && feeRefunds[0].key.startsWith('fee-waive-'))
  check('surplus gardé = contribution − frais réels', dc().contribution_surplus_cents === 1315 && dc().tax_included_cents === 1315 - Math.round(1315 / 1.14975))
  await send(contribSession())
  check('webhook rejoué : rien de plus n\'est rendu, un seul don', feeRefunds.length === 1 && tables.donations.length === 1)

  seed()
  realFee(300) // tarif réduit : frais plus bas, la commission ne peut pas monter
  await send(contribSession())
  check('frais réels plus bas : rien ne change chez Stripe', feeRefunds.length === 0 && dc().contribution_surplus_cents === 1428)

  seed()
  realFee(447)
  capWaive.cents = 900 // deux paiements simultanés près du plafond : le règlement rend 9 $
  await send(contribSession())
  check('excédent du plafond rendu chez Stripe', feeRefunds.length === 1 && feeRefunds[0].amount === 900)

  seed()
  intents['pi_contrib'] = { account: 'acct_A', latest_charge: { id: 'ch_contrib', application_fee: 'fee_contrib', balance_transaction: 'txn_pas_encore' } }
  fees['fee_contrib'] = { amount: 1428, amount_refunded: 0 }
  await send(contribSession())
  check('frais réels pas encore connus : surplus estimé gardé', settleCalls[0].p_stripe_fee_actual === null && dc().contribution_surplus_cents === 1428)

  seed()
  realFee(447)
  rpcs.settle_platform_fee = () => { throw { code: '40P01', message: 'interblocage' } }
  r = await send(contribSession())
  check('règlement en échec : 500 (Stripe rejoue), le don est déjà enregistré', r.status === 500 && tables.donations.length === 1)

  console.log('Remboursement après un excédent rendu')
  seed()
  realFee(560)
  await send(contribSession())
  sessionsByIntent['pi_contrib'] = { id: 'cs_contrib', metadata: { orgId: 'orgA' } }
  feeRefunds.length = 0
  await send({ type: 'charge.refunded', account: 'acct_A', data: { object: { id: 'ch_contrib', amount: 14375, amount_refunded: 14375, payment_intent: 'pi_contrib', application_fee: 'fee_contrib' } } })
  check('remboursement total : le reste est rendu, l\'excédent n\'est pas rendu deux fois', feeRefunds.length === 1 && feeRefunds[0].amount === 1315 && fees['fee_contrib'].amount_refunded === 1428)
  check('base à jour : part rendue au titre du remboursement, don à zéro', dc().platform_fee_refunded_cents === 1315 && dc().refunded_cents === 12500)

  console.log('Remboursement et commission')
  const refundEvent = (amount_refunded: number, extra: object = {}) => ({
    type: 'charge.refunded', account: 'acct_A',
    data: { object: { id: 'ch_1', amount: 5200, amount_refunded, payment_intent: 'pi_1', application_fee: 'fee_1', ...extra } },
  })
  seed()
  await send(session())
  sessionsByIntent['pi_1'] = { id: 'cs_live_000001', metadata: { orgId: 'orgA' } }
  fees['fee_1'] = { amount: 140, amount_refunded: 0 }
  await send(refundEvent(2600))
  check('remboursement de moitié : don réduit de moitié', tables.donations[0].refunded_cents === 2500)
  check('la moitié de la commission est rendue (0,70 $)', feeRefunds.length === 1 && feeRefunds[0].amount === 70 && tables.donations[0].platform_fee_refunded_cents === 70)
  await send(refundEvent(2600))
  check('événement rejoué : rien de plus n\'est rendu', feeRefunds.length === 1)
  await send(refundEvent(5200))
  check('remboursement total : le reste de la commission est rendu', feeRefunds.length === 2 && feeRefunds[1].amount === 70 && tables.donations[0].platform_fee_refunded_cents === 140 && tables.donations[0].refunded_cents === 5000)
  fees['fee_1'].amount_refunded = 140
  feeRefunds.length = 0
  await send(refundEvent(5200))
  check('commission déjà remboursée par l\'organisme : on ne la rembourse pas deux fois', feeRefunds.length === 0)

  seed()
  sessionsByIntent['pi_x'] = { id: 'cs_autre' }
  r = await send(refundEvent(100, { payment_intent: 'pi_x', application_fee: null }))
  check('remboursement d\'un paiement qui n\'est pas de Donivers : ignoré', r.status === 200 && feeRefunds.length === 0)

  seed()
  sessionsByIntent['pi_1'] = { id: 'cs_pas_encore', metadata: { orgId: 'orgA' } }
  r = await send(refundEvent(100))
  check('remboursement d\'un don pas encore enregistré : 500, Stripe réessaiera', r.status === 500)
  void calls

  console.log('Remboursement depuis la console')
  const { refundDonationFromConsole } = await import('../lib/refunds')
  seed()
  await send(session())
  const donId = tables.donations[0].id as string
  charges['cs_live_000001'] = { account: 'acct_A', charge: { id: 'ch_c', amount: 5200, amount_refunded: 0, application_fee: 'fee_c' } }
  fees['fee_c'] = { amount: 140, amount_refunded: 0 }
  refundsMade.length = 0; seenKeys.clear()
  let rr = await refundDonationFromConsole(fakeStripe as never, 'orgB', 'acct_B', donId, null)
  check('un autre organisme ne peut pas rembourser ce don', !rr.ok && rr.reason === 'unknown' && refundsMade.length === 0)
  rr = await refundDonationFromConsole(fakeStripe as never, 'orgA', null, donId, null)
  check('sans compte prêt : refusé', !rr.ok && rr.reason === 'no_account' && refundsMade.length === 0)
  rr = await refundDonationFromConsole(fakeStripe as never, 'orgA', 'acct_A', donId, 5201)
  check('plus que le paiement : refusé, avec le maximum', !rr.ok && rr.reason === 'bad_amount' && rr.remainingCents === 5200 && refundsMade.length === 0)
  rr = await refundDonationFromConsole(fakeStripe as never, 'orgA', 'acct_A', donId, 2600)
  const made = refundsMade[0]
  check('remboursement partiel fait sur le compte de l\'organisme', rr.ok && made.opts.stripeAccount === 'acct_A' && made.params.amount === 2600 && made.params.payment_intent === 'pi_ch_c')
  check('commission rendue juste après par notre calcul, pas par refund_application_fee', made.params.refund_application_fee === undefined && fees['fee_c'].amount_refunded === 70)
  check('base à jour tout de suite : moitié du don', tables.donations[0].refunded_cents === 2500 && tables.donations[0].platform_fee_refunded_cents === 70)
  feeRefunds.length = 0
  await send({ type: 'charge.refunded', account: 'acct_A', data: { object: { ...charges['cs_live_000001'].charge, payment_intent: 'pi_ch_c' } } })
  sessionsByIntent['pi_ch_c'] = { id: 'cs_live_000001', metadata: { orgId: 'orgA' } }
  await send({ type: 'charge.refunded', account: 'acct_A', data: { object: { ...charges['cs_live_000001'].charge, payment_intent: 'pi_ch_c' } } })
  check('le webhook qui suit ne change rien et ne rend rien de plus', tables.donations[0].refunded_cents === 2500 && feeRefunds.length === 0)
  // Double clic : même état du paiement, même montant → même clé, un seul remboursement
  charges['cs_live_000001'].charge.amount_refunded = 0
  seenKeys.add(`console-refund-${donId}-0-2600`)
  const n = refundsMade.length
  await refundDonationFromConsole(fakeStripe as never, 'orgA', 'acct_A', donId, 2600)
  check('double clic : la même clé d\'idempotence, aucun second remboursement', refundsMade.length === n)
  charges['cs_live_000001'].charge.amount_refunded = 2600
  rr = await refundDonationFromConsole(fakeStripe as never, 'orgA', 'acct_A', donId, null)
  check('« tout » = ce qui reste du paiement', rr.ok && refundsMade.at(-1)!.params.amount === 2600)
  check('remboursement total : morceau à zéro, toute la commission rendue', tables.donations[0].refunded_cents === 5000 && tables.donations[0].platform_fee_refunded_cents === 140)
  rr = await refundDonationFromConsole(fakeStripe as never, 'orgA', 'acct_A', donId, null)
  check('déjà tout remboursé : refusé', !rr.ok && rr.reason === 'nothing_left')
  tables.donations[0].source = 'cash'
  rr = await refundDonationFromConsole(fakeStripe as never, 'orgA', 'acct_A', donId, null)
  check('don comptant : pas de remboursement par Stripe', !rr.ok && rr.reason === 'not_stripe')

  console.log('Litiges')
  const dispute = (status: string, extra: object = {}) => ({ id: 'dp_1', status, amount: 5200, charge: 'ch_d', evidence_details: { due_by: 1796000000 }, ...extra })
  const dEvent = (type: string, d: object, account = 'acct_A') => ({ type, account, data: { object: d } })
  const seedDispute = async () => {
    seed()
    await send(session())
    charges['cs_live_000001'] = { account: 'acct_A', charge: { id: 'ch_d', amount: 5200, amount_refunded: 0, application_fee: 'fee_d', disputed: true } }
    sessionsByIntent['pi_ch_d'] = { id: 'cs_live_000001', metadata: { orgId: 'orgA' } }
    fees['fee_d'] = { amount: 140, amount_refunded: 0 }
    feeRefunds.length = 0
  }
  await seedDispute()
  r = await send(dEvent('charge.dispute.created', dispute('needs_response')))
  const dd = () => tables.donations[0]
  check('litige ouvert : noté avec sa date limite', r.status === 200 && dd().dispute_status === 'open' && dd().dispute_id === 'dp_1' && !!dd().dispute_due_by)
  check('litige ouvert : le morceau reste entier, la commission aussi', dd().refunded_cents === 0 && feeRefunds.length === 0)
  rr = await refundDonationFromConsole(fakeStripe as never, 'orgA', 'acct_A', dd().id as string, null)
  check('paiement contesté : pas de remboursement depuis la console', !rr.ok && rr.reason === 'disputed')
  await send(dEvent('charge.dispute.closed', dispute('lost')))
  check('litige perdu : traité comme un remboursement total', dd().dispute_status === 'lost' && dd().refunded_cents === 5000 && dd().dispute_due_by === null)
  check('litige perdu : toute la commission est rendue', feeRefunds.length === 1 && feeRefunds[0].amount === 140 && dd().platform_fee_refunded_cents === 140)
  await send(dEvent('charge.dispute.closed', dispute('lost')))
  await send({ type: 'charge.refunded', account: 'acct_A', data: { object: { ...charges['cs_live_000001'].charge, payment_intent: 'pi_ch_d' } } })
  check('rejoué, ou suivi d\'un charge.refunded : rien ne bouge', dd().refunded_cents === 5000 && feeRefunds.length === 1)

  await seedDispute()
  await send(dEvent('charge.dispute.created', dispute('needs_response')))
  await send(dEvent('charge.dispute.closed', dispute('won')))
  check('litige gagné : rien n\'est repris', dd().dispute_status === 'won' && dd().refunded_cents === 0 && feeRefunds.length === 0)

  await seedDispute()
  charges['cs_live_000001'].charge.amount_refunded = 2600
  await send(dEvent('charge.dispute.closed', dispute('lost', { amount: 2600 })))
  check('remboursé à moitié puis litige perdu sur le reste : tout est repris', dd().refunded_cents === 5000 && dd().platform_fee_refunded_cents === 140)

  await seedDispute()
  await send(dEvent('charge.dispute.created', dispute('warning_needs_response')))
  await send(dEvent('charge.dispute.closed', dispute('warning_closed')))
  check('demande de renseignements close sans litige : plus rien de signalé', dd().dispute_status === null && dd().refunded_cents === 0)

  await seedDispute()
  // Le compte B émet un litige sur un paiement qui, par erreur de routage, mène à la session du don de A : le filtre par organisme protège A
  charges['cs_b'] = { account: 'acct_B', charge: { id: 'ch_d', amount: 5200, amount_refunded: 0, application_fee: null, disputed: true } }
  r = await send(dEvent('charge.dispute.created', dispute('needs_response'), 'acct_B'))
  check('litige reçu d\'un autre compte : le don de A n\'est pas touché', r.status === 200 && dd().dispute_status == null)

  console.log('Remboursement qui échoue après coup')
  await seedDispute()
  charges['cs_live_000001'].charge.disputed = false
  charges['cs_live_000001'].charge.amount_refunded = 5200
  await send({ type: 'charge.refunded', account: 'acct_A', data: { object: { ...charges['cs_live_000001'].charge, payment_intent: 'pi_ch_d' } } })
  check('remboursé', dd().refunded_cents === 5000)
  charges['cs_live_000001'].charge.amount_refunded = 0
  await send({ type: 'charge.refund.updated', account: 'acct_A', data: { object: { id: 're_1', status: 'failed', charge: 'ch_d' } } })
  check('remboursement échoué : le don redevient entier', dd().refunded_cents === 0)

  console.log('Paiement direct')
  const { startCheckout } = await import('../lib/payments')
  const base = { email: 'ana@x.ca', amountCents: 10000, feeCents: 0, returnTo: 'vitrail' as const, profile: { showName: true, name: 'Ana', message: null, photoUrl: null, quoteConsent: false }, color: '#fff', channel: null, locale: 'fr' as const, baseUrl: 'https://ecoleartsutton.donivers.test' }
  const orgRow = { id: 'orgA', slug: 'ecoleartsutton', status: 'live' as const, practiceOf: null, showcase: false, name: 'École A', nameEn: null, photoModeration: 'live' as const, senderName: null, replyTo: null, stripeAccountId: 'acct_A', stripeReady: true, feeSchedule: S, taxProvince: 'QC' }
  const vit = { id: 'permA', organizationId: 'orgA', kind: 'permanent' as const, slug: null, name: 'A', state: 'active' as const, inMain: true, goalCents: 0 }
  seed()
  tables.organization_billing = [{ organization_id: 'orgA', donors_counted: 150, cumul_cents: 0, fee_threshold_reached_at: '2026-11-20', fee_settled_at: null }]
  await startCheckout({ ...base, tenant: { org: orgRow, vitrail: vit } })
  const c0 = created.at(-1)!
  check('la session est créée sur le compte de l\'organisme', c0.opts.stripeAccount === 'acct_A')
  check('après le 100e donateur, sans contribution : 2,8 % prélevés par Stripe', c0.params.payment_intent_data.application_fee_amount === 280 && c0.params.metadata.platformFee === '280')
  const expires = Number(c0.params.expires_at) - Math.floor(Date.now() / 1000)
  check('session de 30 minutes', expires > 29 * 60 && expires <= 30 * 60)
  check('sans contribution : une seule ligne, aucune suggestion gardée', c0.params.line_items.length === 1 && c0.params.metadata.contribution === '0' && !('contributionSuggested' in c0.params.metadata))
  check('organisme et vitrail dans les métadonnées', c0.params.metadata.orgId === 'orgA' && c0.params.metadata.vitrailId === 'permA')
  check('retour sur l\'adresse de l\'organisme', String(c0.params.success_url).startsWith('https://ecoleartsutton.donivers.test/vitrail?merci='))
  await startCheckout({ ...base, contributionCents: 1500, contributionShown: true, tenant: { org: orgRow, vitrail: vit } })
  const c1 = created.at(-1)!
  // F = 2,9 % de 115 $ + 0,30 $ = 3,64 $ ; S = 11,36 $ ≥ N = 2,80 $ → l'organisme ne paie rien
  check('contribution de 15 $ : deuxième ligne, Donivers garde le surplus, l\'organisme ne paie rien', c1.params.line_items.length === 2 && c1.params.line_items[1].price_data.unit_amount === 1500 && c1.params.payment_intent_data.application_fee_amount === 1136)
  check('libellé de la ligne (piste A)', c1.params.line_items[1].price_data.product_data.name === 'Frais de transaction et contribution à Donivers')
  check('détail du calcul dans les métadonnées', c1.params.metadata.contribution === '1500' && c1.params.metadata.contributionSurplus === '1136' && c1.params.metadata.stripeFeeEstimate === '364' && c1.params.metadata.contributionSuggested === '1500' && c1.params.metadata.contributionVersion === '2026-11-16')
  tables.organization_billing = [{ organization_id: 'orgA', donors_counted: 40, cumul_cents: 0, fee_threshold_reached_at: null, fee_settled_at: null }]
  await startCheckout({ ...base, tenant: { org: orgRow, vitrail: vit } })
  check('avant le 100e donateur : rien prélevé', !('application_fee_amount' in created.at(-1)!.params.payment_intent_data))
  tables.organization_billing = [{ organization_id: 'orgA', donors_counted: 400, cumul_cents: 49500, fee_threshold_reached_at: '2026-11-20', fee_settled_at: '2026-11-25' }]
  await startCheckout({ ...base, tenant: { org: orgRow, vitrail: vit } })
  check('acquitté : 0 % pour toujours', !('application_fee_amount' in created.at(-1)!.params.payment_intent_data))
  tables.organization_billing = [{ organization_id: 'orgA', donors_counted: 400, cumul_cents: 0, fee_threshold_reached_at: '2026-11-20', fee_settled_at: null }]
  await startCheckout({ ...base, tenant: { org: { ...orgRow, feeSchedule: parseBillingSchedule({ model: 'exempt', scope: 'principal' }) }, vitrail: vit } })
  check('École exemptée : aucune commission', !('application_fee_amount' in created.at(-1)!.params.payment_intent_data))
  await startCheckout({ ...base, tenant: { org: orgRow, vitrail: { ...vit, id: 'campA', kind: 'campaign' as const, slug: 'c1' } } })
  check('campagne : pas encore de commission (étape L2)', !('application_fee_amount' in created.at(-1)!.params.payment_intent_data))
  let threw = false
  try { await startCheckout({ ...base, tenant: { org: { ...orgRow, stripeAccountId: null }, vitrail: vit } }) } catch { threw = true }
  check('sans compte connecté : aucun paiement ne démarre', threw)

  console.log('Compte connecté')
  const { startOnboarding, dashboardLink } = await import('../lib/connect')
  seed()
  tables.organizations[0].stripe_account_id = null
  const out = await startOnboarding({ ...orgRow, stripeAccountId: null }, 'https://ecoleartsutton.donivers.test')
  const ac = accountCalls.at(-1)!
  check('compte créé avec frais payés par l\'organisme et pertes couvertes par Stripe', ac.params.controller.fees.payer === 'account' && ac.params.controller.losses.payments === 'stripe')
  check('tableau de bord Express, identité recueillie par Stripe', ac.params.controller.stripe_dashboard.type === 'express' && ac.params.controller.requirement_collection === 'stripe')
  check('pays Canada, paiements par carte demandés', ac.params.country === 'CA' && ac.params.capabilities.card_payments.requested === true)
  check('le compte est enregistré sur l\'organisme', tables.organizations[0].stripe_account_id === 'acct_NEW' && out.accountId === 'acct_NEW')
  process.env.STRIPE_CONNECT_API_VERSION = '2026-06-24.preview'
  tables.organizations[0].stripe_account_id = null
  await startOnboarding({ ...orgRow, stripeAccountId: null }, 'https://x.test')
  check('version d\'API fixée seulement pour la création du compte', accountCalls.at(-1)!.opts?.apiVersion === '2026-06-24.preview')
  delete process.env.STRIPE_CONNECT_API_VERSION
  process.env.STRIPE_ACCOUNT_DASHBOARD = 'full'
  tables.organizations[0].stripe_account_id = null
  await startOnboarding({ ...orgRow, stripeAccountId: null }, 'https://x.test')
  check('tableau de bord complet sur demande', accountCalls.at(-1)!.params.controller.stripe_dashboard.type === 'full')
  delete process.env.STRIPE_ACCOUNT_DASHBOARD
  check('lien du tableau de bord Express', (await dashboardLink('acct_A')) === 'https://connect.stripe.com/express/login')
  check('pas de lien pour un tableau de bord complet', (await dashboardLink('acct_FULL')) === null)
  done()
}
main().catch(e => { console.error(e); process.exit(1) })
