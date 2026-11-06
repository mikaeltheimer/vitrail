import { check, done } from './helpers'
import { calls, reset, tables } from './fake-db'
process.env.PAYMENT_MODE = 'demo'
process.env.DEFAULT_ORG_SLUG = 'ecoleartsutton'

async function main() {
  const { recordDonation, resolveToken, createToken, getSnapshot, findByProviderRef } = await import('../lib/donations')
  const { applyRefund } = await import('../lib/refunds')
  const { getCampaignBySlug, forgetTenantCache, defaultTenant } = await import('../lib/tenant')
  const { newPhotoStatus } = await import('../lib/settings')

  const seed = () => {
    reset(); forgetTenantCache()
    tables.organizations = [
      { id: 'orgA', status: 'live', name_fr: 'École A', texts: {}, photo_moderation: 'live' },
      { id: 'orgB', status: 'live', name_fr: 'Musée B', texts: {}, photo_moderation: 'moderation' },
    ]
    tables.organization_slugs = [
      { slug: 'ecoleartsutton', organization_id: 'orgA', is_current: true },
      { slug: 'musee', organization_id: 'orgB', is_current: true },
    ]
    tables.vitraux = [
      { id: 'permA', organization_id: 'orgA', kind: 'permanent', slug: null, name: 'Vitrail A', state: 'active', in_main: true, goal_cents: 0 },
      { id: 'gala', organization_id: 'orgA', kind: 'campaign', slug: 'gala-2027', name: 'Gala', state: 'active', in_main: true, goal_cents: 500000 },
      { id: 'permB', organization_id: 'orgB', kind: 'permanent', slug: null, name: 'Vitrail B', state: 'active', in_main: true, goal_cents: 0 },
    ]
  }
  const profile = { showName: true, name: 'Lou', message: null, photoUrl: null, quoteConsent: false }

  console.log('Donateurs par organisme')
  seed()
  const a = await recordDonation({ organizationId: 'orgA', vitrailId: 'permA', email: 'lou@x.ca', profile, color: '#fff', amountCents: 5000, source: 'stripe', providerRef: 'cs_test_aaaaaaaa' })
  const b = await recordDonation({ organizationId: 'orgB', vitrailId: 'permB', email: 'lou@x.ca', profile, color: '#fff', amountCents: 2000, source: 'stripe', providerRef: 'cs_test_bbbbbbbb' })
  check('même courriel, deux organismes = deux donateurs', a.donorId !== b.donorId && tables.donors.length === 2)
  check('chaque donateur porte son organisme', tables.donors.map(d => d.organization_id).sort().join() === 'orgA,orgB')
  check('le don porte organisme et vitrail', tables.donations[0].organization_id === 'orgA' && tables.donations[0].vitrail_id === 'permA')
  const again = await recordDonation({ organizationId: 'orgA', vitrailId: 'permA', email: 'lou@x.ca', profile, color: '#fff', amountCents: 5000, source: 'stripe', providerRef: 'cs_test_aaaaaaaa' })
  check('un rappel de Stripe ne double rien', again.duplicate && tables.donations.length === 2)
  const second = await recordDonation({ organizationId: 'orgA', vitrailId: 'gala', email: 'lou@x.ca', profile, color: '#fff', amountCents: 1000, source: 'stripe', providerRef: 'cs_test_cccccccc' })
  check('même donateur, autre vitrail du même organisme', second.donorId === a.donorId && tables.donations[2].vitrail_id === 'gala')
  check('paiement retrouvé seulement dans son organisme', !!(await findByProviderRef('cs_test_aaaaaaaa', 'orgA')) && (await findByProviderRef('cs_test_aaaaaaaa', 'orgB')) === null)

  console.log('Liens magiques')
  const token = await createToken(a.donorId)
  check('le lien ouvre le morceau chez son organisme', (await resolveToken(token, 'orgA'))?.id === a.donorId)
  check('le même lien est refusé chez un autre organisme', (await resolveToken(token, 'orgB')) === null)

  console.log('Remboursements')
  tables.donations.push({ id: 'd-fee', organization_id: 'orgA', vitrail_id: 'permA', donor_id: a.donorId, amount_cents: 5000, fee_cents: 200, refunded_cents: 0, provider_ref: 'cs_test_fee' })
  check('remboursement partiel proportionnel', (await applyRefund('orgA', 'cs_test_fee', 5200, 2600)).outcome === 'updated' && tables.donations.at(-1)!.refunded_cents === 2500)
  check('rejouer l\'événement ne change rien', (await applyRefund('orgA', 'cs_test_fee', 5200, 2600)).outcome === 'unchanged' && tables.donations.at(-1)!.refunded_cents === 2500)
  check('remboursement total = tout le don', (await applyRefund('orgA', 'cs_test_fee', 5200, 5200)).outcome === 'updated' && tables.donations.at(-1)!.refunded_cents === 5000)
  check('jamais plus que le don', (await applyRefund('orgA', 'cs_test_fee', 5200, 9999)).outcome === 'unchanged' && tables.donations.at(-1)!.refunded_cents === 5000)
  check('paiement inconnu', (await applyRefund('orgA', 'cs_inconnu', 100, 100)).outcome === 'unknown'
  )
  check('un remboursement ne touche pas le don d\'un autre organisme', (await applyRefund('orgB', 'cs_test_fee', 5200, 5200)).outcome === 'unknown')

  console.log('Modération par organisme')
  check('organisme A : publié tout de suite', (await newPhotoStatus('orgA')) === 'approved')
  check('organisme B : en attente', (await newPhotoStatus('orgB')) === 'pending')

  console.log('Adresses')
  const calls0 = calls.length
  check('campagne réservée : aucune requête', (await getCampaignBySlug('orgA', 'admin')) === null && calls.length === calls0)
  check('campagne de l\'organisme', (await getCampaignBySlug('orgA', 'gala-2027'))?.id === 'gala')
  check('campagne d\'un autre organisme introuvable', (await getCampaignBySlug('orgB', 'gala-2027')) === null)
  check('organisme par défaut', (await defaultTenant())?.org.id === 'orgA' && (await defaultTenant())?.vitrail.id === 'permA')

  console.log('Instantané')
  seed()
  tables.donors = [
    { id: 'dA', organization_id: 'orgA', display_name: 'Ana', show_name: true, message: null, photo_url: null, photo_status: 'approved', color: '#111', hidden: false },
    { id: 'dH', organization_id: 'orgA', display_name: 'Caché', show_name: true, message: null, photo_url: null, photo_status: 'approved', color: '#222', hidden: true },
    { id: 'dB', organization_id: 'orgB', display_name: 'Ben', show_name: true, message: null, photo_url: null, photo_status: 'approved', color: '#333', hidden: false },
  ]
  tables.vitrail_donor_totals = [
    { vitrail_id: 'permA', organization_id: 'orgA', donor_id: 'dA', total_cents: 7000 },
    { vitrail_id: 'permA', organization_id: 'orgA', donor_id: 'dH', total_cents: 900 },
    { vitrail_id: 'gala', organization_id: 'orgA', donor_id: 'dA', total_cents: 2000 },
    { vitrail_id: 'permB', organization_id: 'orgB', donor_id: 'dB', total_cents: 300 },
  ]
  tables.vitrail_totals = [
    { vitrail_id: 'permA', organization_id: 'orgA', total_cents: 7900, donations_count: 3 },
    { vitrail_id: 'gala', organization_id: 'orgA', total_cents: 2000, donations_count: 1 },
  ]
  tables.vitrail_donations = [
    { donation_id: 'n1', vitrail_id: 'permA', organization_id: 'orgA', donor_id: 'dA', net_cents: 7000, created_at: '2026-11-05T10:00:00Z' },
    { donation_id: 'n2', vitrail_id: 'permA', organization_id: 'orgA', donor_id: 'dH', net_cents: 900, created_at: '2026-11-05T11:00:00Z' },
    { donation_id: 'n3', vitrail_id: 'gala', organization_id: 'orgA', donor_id: 'dA', net_cents: 2000, created_at: '2026-11-05T12:00:00Z' },
  ]
  const tenantA = { org: { id: 'orgA', slug: 'ecoleartsutton', status: 'live', name: 'École A', nameEn: null, photoModeration: 'live', senderName: null, replyTo: null, stripeAccountId: null, stripeReady: false } as never, vitrail: { id: 'permA', organizationId: 'orgA', kind: 'permanent', slug: null, name: 'Vitrail A', state: 'active', inMain: true, goalCents: 0 } as never }
  const sp = await getSnapshot(tenantA)
  check('vitrail permanent : le morceau d\'Ana à 70 $', sp.pieces.length === 1 && sp.pieces[0].amountCents === 7000)
  check('le morceau masqué n\'est pas affiché mais son argent compte', sp.totalCents === 7900)
  check('derniers dons : ceux du vitrail, sans le donateur masqué', sp.recent.length === 1 && sp.recent[0].id === 'n1' && sp.recent[0].name === 'Ana')
  check('aucun morceau d\'un autre organisme', !sp.pieces.some(p => p.id === 'dB'))
  check('l\'événement est toujours présent, sans objectif', sp.event?.goalCents === 0 && sp.event?.id === 'permA')
  const gala = await getSnapshot({ ...tenantA, vitrail: { ...(tenantA.vitrail as object), id: 'gala', kind: 'campaign', slug: 'gala-2027', name: 'Gala', goalCents: 500000 } as never })
  check('campagne : ses propres dons seulement', gala.pieces.length === 1 && gala.pieces[0].amountCents === 2000 && gala.totalCents === 2000)
  check('campagne : son objectif', gala.event?.goalCents === 500000)
  check('les requêtes sont filtrées par vitrail et par organisme', calls.some(c => c.table === 'vitrail_donor_totals' && c.filters.some(([k, v]) => k === 'vitrail_id' && v === 'gala')) && calls.some(c => c.table === 'donors' && c.filters.some(([k, v]) => k === 'organization_id' && v === 'orgA')))
  check('version différente par vitrail', sp.version !== gala.version)
  done()
}
main().catch(e => { console.error(e); process.exit(1) })
