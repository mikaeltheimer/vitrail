import { check, done, mocks } from './helpers'
import { calls, reset, tables } from './fake-db'

// ── Faux Stripe et faux next/server (le webhook se teste sans réseau) ───────────────────────────
const feeRefunds: { id: string; amount: number; key: string }[] = []
const fees: Record<string, { amount: number; amount_refunded: number }> = {}
const sessionsByIntent: Record<string, { id: string; metadata?: Record<string, string> }> = {}
const created: { params: Record<string, any>; opts: Record<string, any> }[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
const accountCalls: { params: Record<string, any>; opts?: Record<string, any> }[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
const fakeStripe = {
  accounts: {
    create: async (params: Record<string, unknown>, opts?: Record<string, unknown>) => { accountCalls.push({ params, opts }); return { id: 'acct_NEW' } },
    retrieve: async (id: string) => ({ id, controller: { stripe_dashboard: { type: id === 'acct_FULL' ? 'full' : 'express' } } }),
    createLoginLink: async () => ({ url: 'https://connect.stripe.com/express/login' }),
  },
  accountLinks: { create: async () => ({ url: 'https://connect.stripe.com/setup/x' }) },
  webhooks: { constructEvent: (body: string, _sig: string, secret: string) => { if (secret !== 'whsec_connect') throw new Error('bad'); return JSON.parse(body) } },
  checkout: { sessions: { create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => { created.push({ params, opts }); return { url: 'https://checkout.test/x' } }, list: async ({ payment_intent }: { payment_intent: string }, opts: { stripeAccount: string }) => { void opts; return { data: sessionsByIntent[payment_intent] ? [sessionsByIntent[payment_intent]] : [] } } } },
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
  const { platformFeeCents, parseFeeSchedule, DEFAULT_FEE_SCHEDULE } = await import('../lib/platform-fee')
  const { paymentModeFor } = await import('../lib/env')
  const { forgetTenantCache } = await import('../lib/tenant')
  const { POST } = await import('../app/api/webhook/stripe/route')

  console.log('Commission')
  const S = DEFAULT_FEE_SCHEDULE
  check('2,8 % d\'un don de 100 $', platformFeeCents(10000, S, 0) === 280)
  check('arrondi au cent', platformFeeCents(1234, S, 0) === 35) // 34,552
  check('juste sous le seuil : encore 2,8 %', platformFeeCents(10000, S, 499_999) === 280)
  check('au seuil : 0,5 %', platformFeeCents(10000, S, 500_000) === 50)
  check('le don qui franchit le seuil garde l\'ancien taux', platformFeeCents(100_000, S, 499_000) === 2800)
  check('grille invalide : retombe sur la grille par défaut', JSON.stringify(parseFeeSchedule({ rate: 'x', tierRate: -1, tierAfterCents: NaN })) === JSON.stringify(S))
  check('grille négociée', parseFeeSchedule({ rate: 0.02, tierAfterCents: 100, tierRate: 0 }).tierRate === 0)
  check('taux absurde refusé (> 20 %)', parseFeeSchedule({ rate: 0.9 }).rate === S.rate)

  console.log('Mode de paiement par organisme')
  check('brouillon : démo', paymentModeFor({ status: 'draft', stripeReady: false }) === 'demo')
  check('en ligne et compte prêt : Stripe', paymentModeFor({ status: 'live', stripeReady: true }) === 'stripe')
  check('en ligne, compte pas prêt : dons fermés', paymentModeFor({ status: 'live', stripeReady: false }) === 'off')
  check('suspendu : fermé', paymentModeFor({ status: 'suspended', stripeReady: true }) === 'off')
  process.env.PAYMENT_MODE = 'demo'
  check('interrupteur maître en démo : tout en démo', paymentModeFor({ status: 'live', stripeReady: true }) === 'demo')
  process.env.PAYMENT_MODE = 'stripe'

  console.log('Webhook Connect')
  const seed = () => {
    reset(); forgetTenantCache()
    for (const k of Object.keys(fees)) delete fees[k]
    for (const k of Object.keys(sessionsByIntent)) delete sessionsByIntent[k]
    feeRefunds.length = 0
    tables.organizations = [
      { id: 'orgA', status: 'live', name_fr: 'École A', texts: {}, photo_moderation: 'live', stripe_account_id: 'acct_A', stripe_ready: false },
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

  console.log('Paiement direct')
  const { startCheckout } = await import('../lib/payments')
  const base = { email: 'ana@x.ca', amountCents: 10000, feeCents: 0, returnTo: 'vitrail' as const, profile: { showName: true, name: 'Ana', message: null, photoUrl: null, quoteConsent: false }, color: '#fff', channel: null, locale: 'fr' as const, baseUrl: 'https://ecoleartsutton.donivers.test' }
  const orgRow = { id: 'orgA', slug: 'ecoleartsutton', status: 'live' as const, name: 'École A', nameEn: null, photoModeration: 'live' as const, senderName: null, replyTo: null, stripeAccountId: 'acct_A', stripeReady: true, feeSchedule: S }
  const vit = { id: 'permA', organizationId: 'orgA', kind: 'permanent' as const, slug: null, name: 'A', state: 'active' as const, inMain: true, goalCents: 0 }
  seed()
  tables.organization_fee_totals = [{ organization_id: 'orgA', fees_cents: 0 }]
  await startCheckout({ ...base, tenant: { org: orgRow, vitrail: vit } })
  const c0 = created.at(-1)!
  check('la session est créée sur le compte de l\'organisme', c0.opts.stripeAccount === 'acct_A')
  check('commission de 2,8 % prélevée par Stripe', c0.params.payment_intent_data.application_fee_amount === 280 && c0.params.metadata.platformFee === '280')
  check('organisme et vitrail dans les métadonnées', c0.params.metadata.orgId === 'orgA' && c0.params.metadata.vitrailId === 'permA')
  check('retour sur l\'adresse de l\'organisme', String(c0.params.success_url).startsWith('https://ecoleartsutton.donivers.test/vitrail?merci='))
  tables.organization_fee_totals = [{ organization_id: 'orgA', fees_cents: 500_000 }]
  await startCheckout({ ...base, tenant: { org: orgRow, vitrail: vit } })
  check('après 5 000 $ de commissions : 0,5 %', created.at(-1)!.params.payment_intent_data.application_fee_amount === 50)
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
