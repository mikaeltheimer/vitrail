import { check, done } from './helpers'
import { fakeDb, reset, rpcs } from './fake-db'

// Section Studio : « prêt à lancer » (même définition que goLive), étapes du Parcours, « À traiter », totaux et
// parcours demande → en ligne. Les totaux eux-mêmes viennent de studio_org_stats (migration 2026-11-25), éprouvée sur
// PostgreSQL ; ici, on vérifie ce que le serveur en fait.

const DAY = 86_400_000
const NOW = Date.parse('2026-11-20T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * DAY).toISOString()
const LEGAL = { entity: 'École inc.', address: '1 rue', officerName: 'A', officerEmail: 'a@ex.com', officerPhone: '+1 450 000 0000' }

async function main() {
  const s = await import('../lib/studio-stats')
  const { launchBlockers } = await import('../lib/launch')

  console.log('Prêt à lancer')
  check('rien de prêt : Stripe et coordonnées', JSON.stringify(launchBlockers({ stripe_ready: false, legal: {} })) === '["stripe","juridique"]')
  check('Stripe prêt, coordonnées incomplètes', JSON.stringify(launchBlockers({ stripe_ready: true, legal: { ...LEGAL, officerPhone: ' ' } })) === '["juridique"]')
  check('tout prêt', launchBlockers({ stripe_ready: true, legal: LEGAL }).length === 0)
  check('étapes', s.stageOf('draft', ['stripe']) === 'pas-pret' && s.stageOf('draft', []) === 'pret' && s.stageOf('live', ['stripe']) === 'en-ligne' && s.stageOf('suspended', []) === 'suspendu')

  console.log('Lecture des totaux')
  reset()
  let since = ''
  rpcs.studio_org_stats = args => {
    since = String(args.p_since)
    return [{ organization_id: 'a', donors: '19', net_cents: '214168', fee_cents: 0, disputes_open: 1, last_donation_at: ago(3), bounces_since: '2' }]
  }
  const stats = await s.orgStats(fakeDb as never, NOW)
  check('fenêtre de 30 jours', since === ago(30), since)
  check('bigint en texte converti', stats.get('a')?.donors === 19 && stats.get('a')?.netCents === 214168 && stats.get('a')?.bouncesSince === 2)

  const orgs = [
    s.toStudioOrg({ id: 'a', name_fr: 'École', status: 'draft', stripe_ready: true, legal: LEGAL, created_at: ago(20) }, 'ecole', stats.get('a')),
    s.toStudioOrg({ id: 'b', name_fr: 'Club', status: 'draft', stripe_ready: false, legal: {}, created_at: ago(10) }, 'club', undefined),
    s.toStudioOrg({ id: 'c', name_fr: 'Neuf', status: 'draft', stripe_ready: false, legal: LEGAL, created_at: ago(2) }, 'neuf', undefined),
    s.toStudioOrg({ id: 'd', name_fr: 'Musée', status: 'live', stripe_ready: true, legal: LEGAL, created_at: ago(40), went_live_at: ago(5) }, 'musee', { ...s.EMPTY_STATS, donors: 28, netCents: 100, feeCents: 7 }),
  ]
  check('École prête à lancer', orgs[0].stage === 'pret')
  check('Club pas prêt : ce qui manque', orgs[1].stage === 'pas-pret' && orgs[1].blockers.join() === 'stripe,juridique')
  check('sans totaux : zéros', orgs[1].stats.donors === 0)

  console.log('À traiter')
  const invitations = [
    { id: 'i1', email: 'x@ex.com', orgName: 'Atelier', expiresAt: new Date(NOW + 2 * DAY).toISOString(), state: 'pending' as const },
    { id: 'i2', email: 'y@ex.com', orgName: null, expiresAt: new Date(NOW + 9 * DAY).toISOString(), state: 'pending' as const },
    { id: 'i3', email: 'z@ex.com', orgName: null, expiresAt: new Date(NOW + 1 * DAY).toISOString(), state: 'accepted' as const },
  ]
  const todo = s.buildTodo([{ id: 'r1', org_name: 'Maison des jeunes', source: 'ecole', created_at: ago(1) }], invitations, orgs, NOW)
  const kinds = todo.map(t => t.kind).join()
  check('ordre : demande, litige, invitation, pas prêt, courriels', kinds === 'demande,litige,invitation,pas-pret,courriels', kinds)
  check('invitation qui expire bientôt seulement', todo.filter(t => t.kind === 'invitation').length === 1)
  const stale = todo.find(t => t.kind === 'pas-pret')
  check('pas prêt depuis 10 jours (pas celui de 2 jours)', stale?.kind === 'pas-pret' && stale.orgId === 'b' && stale.days === 10)

  console.log('Totaux et parcours')
  const t = s.platformTotals(orgs)
  check('organismes par étape', t.orgsByStatus.pret === 1 && t.orgsByStatus['pas-pret'] === 2 && t.orgsByStatus['en-ligne'] === 1)
  check('sommes', t.donors === 47 && t.netCents === 214268 && t.feeCents === 7 && t.disputesOpen === 1)
  const f = s.buildFunnel(
    [{ source: 'ecole', created_at: ago(1) }, { source: null, created_at: ago(50) }, { source: 'ecole', created_at: ago(60) }],
    [{ created_at: ago(2) }, { created_at: ago(45) }],
    orgs,
    NOW,
  )
  check('demandes', f.requests.total === 3 && f.requests.since === 1)
  check('invitations', f.invitations.total === 2 && f.invitations.since === 1)
  check('prêts : brouillons prêts et en ligne', f.ready.total === 2)
  check('en ligne : fenêtre sur la mise en ligne', f.live.total === 1 && f.live.since === 1)
  check('provenance', JSON.stringify(f.sources) === JSON.stringify([{ source: 'ecole', total: 2, since: 1 }, { source: 'direct', total: 1, since: 0 }]), f.sources)

  done()
}

void main()
