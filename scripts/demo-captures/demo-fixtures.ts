// Données FICTIVES de la démo, dans la forme de /api/vitrail et de GET /api/admin, pour les captures de la console.
// Tout vient de generateDemoDonors (lib/demo.ts) : mêmes donateurs que le vitrail de démonstration, adresses en
// @demo.invalid. Jamais de vraie donnée ici : aucune base n'est lue.
import { DEMO_NAME, DEMO_SLUG } from '../../lib/demo-data'
import { generateDemoDonors, type DemoDonor } from '../../lib/demo'
import type { Piece, RecentDonation, Snapshot } from '../../lib/types'
import type { ConsoleData, DonationRow, DonorRow } from '../../components/console/types'

/** Moment fixe : les captures ne changent pas d'une exécution à l'autre (sauf « il y a … », relatif à l'heure de la capture). */
export const FIXTURE_NOW = Date.parse('2026-11-11T19:30:00Z')

const id = (d: DemoDonor) => `00000000-0000-4000-8000-${String(d.index).padStart(12, '0')}`
const total = (d: DemoDonor) => d.donations.reduce((n, x) => n + x.amountCents, 0)

/**
 * Les donateurs de la démo, décalés pour que les derniers dons tombent juste avant `now` (les captures se lisent
 * « il y a 4 min », comme une console ouverte pendant la collecte).
 */
function donors(now: number): DemoDonor[] {
  const list = generateDemoDonors(FIXTURE_NOW)
  const last = Math.max(...list.flatMap(d => d.donations.map(x => Date.parse(x.at))))
  const shift = now - 4 * 60_000 - last
  return list.map(d => ({ ...d, donations: d.donations.map(x => ({ ...x, at: new Date(Date.parse(x.at) + shift).toISOString() })) }))
}

/** Le vitrail de la démo, comme le renvoie /api/vitrail. */
export function demoSnapshot(now = Date.now()): Snapshot {
  const list = donors(now)
  const pieces: Piece[] = list
    .map(d => ({ id: id(d), name: d.showName ? d.displayName : null, message: d.message, question: d.message ? d.question : null, photoUrl: null, color: d.color, amountCents: total(d) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  const recent: RecentDonation[] = list
    .flatMap(d => d.donations.map((x, i) => ({ id: `${id(d)}-${i}`, donorId: id(d), name: d.showName ? d.displayName : null, message: d.message, photoUrl: null, amountCents: x.amountCents, at: x.at })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15)
  const totalCents = pieces.reduce((n, p) => n + p.amountCents, 0)
  return {
    version: 'demo-captures',
    at: new Date(now).toISOString(),
    // Comme en ligne : la démo n'ouvre jamais de paiement (paymentModeFor), seul « Démonstration » s'affiche
    mode: 'off',
    showcase: true,
    event: { id: 'demo', name: DEMO_NAME, goalCents: 0, totalCents },
    totalCents,
    donationsCount: list.reduce((n, d) => n + d.donations.length, 0),
    pieces,
    recent,
    typicalCents: 5000,
  }
}

/**
 * La console de la démo vue par sa propriétaire (fictive), comme GET /api/admin. Pour que la modération ait quelque chose
 * à montrer : deux témoignages en attente et un signalement (tous tirés des donateurs fictifs).
 */
export function demoConsoleData(locale: 'fr' | 'en', now = Date.now()): ConsoleData {
  const list = donors(now)
  const domain = process.env.PLATFORM_DOMAIN || 'donivers.com'
  const withMessage = list.filter(d => d.message && d.locale === locale && d.showName)
  const pending = new Set(withMessage.slice(0, 2).map(d => d.index))
  const reportedDonor = withMessage[2]

  const donorRows: DonorRow[] = list.map(d => {
    const at = d.donations[d.donations.length - 1].at
    return {
      id: id(d),
      email: d.email,
      display_name: d.displayName,
      show_name: d.showName,
      message: d.message,
      message_status: pending.has(d.index) ? 'pending' : 'approved',
      quote_consent: false,
      photo_url: null,
      photo_status: 'approved',
      color: d.color,
      hidden: false,
      created_at: d.donations[0].at,
      erased_at: null,
      totalCents: total(d),
      lastDonationAt: at,
    }
  })
  const channels = ['accueil', 'ecran', 'cafe', 'courriel']
  const donations: DonationRow[] = list
    .flatMap(d =>
      d.donations.map((x, i) => ({
        id: `${id(d)}-${i}`,
        donor_id: id(d),
        amount_cents: x.amountCents,
        fee_cents: 0,
        refunded_cents: 0,
        dispute_status: null,
        dispute_due_by: null,
        source: 'stripe',
        channel: channels[(d.index + i) % channels.length],
        created_at: x.at,
        donors: { display_name: d.displayName, email: d.email, hidden: false, photo_url: null, photo_status: 'approved' as const },
      })),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const totalCents = donations.reduce((n, x) => n + x.amount_cents, 0)
  const byChannel = new Map<string, { visits: number; donations: number; totalCents: number }>()
  for (const x of donations) {
    const c = byChannel.get(x.channel!) ?? { visits: 0, donations: 0, totalCents: 0 }
    c.donations++
    c.totalCents += x.amount_cents
    c.visits += 3
    byChannel.set(x.channel!, c)
  }

  return {
    org: { name: DEMO_NAME, slug: DEMO_SLUG, status: 'live', practice: false },
    switchUrl: null,
    vitrailUrl: `https://${DEMO_SLUG}.${domain}/vitrail`,
    identityMissing: [],
    atelierUrl: null,
    published: true,
    summary: { totalCents, donations: donations.length, donors: list.length, goalCents: null },
    me: { name: 'Claire Martin', email: 'direction@demo.invalid', role: 'owner', accountId: 'demo-owner' },
    orgs: [],
    team: { members: [{ accountId: 'demo-owner', email: 'direction@demo.invalid', name: 'Claire Martin', role: 'owner' }], invitations: [] },
    mode: 'stripe',
    stripe: { accountId: 'acct_demo', ready: true },
    photoModeration: 'moderation',
    reports: reportedDonor ? [{ id: 1, donor_id: id(reportedDonor), reason: null, created_at: new Date(now - 25 * 60_000).toISOString() }] : [],
    disputes: [],
    bounces: [],
    mailingCount: Math.round(list.length * 0.4),
    channels: [...byChannel.entries()].map(([channel, c]) => ({ channel, ...c })),
    donors: donorRows,
    donations,
  }
}
