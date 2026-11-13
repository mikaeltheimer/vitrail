import type { SupabaseClient } from '@supabase/supabase-js'
import { launchBlockers, type LaunchBlocker } from './launch'

// Section Studio : des TOTAUX, jamais des personnes (décision du 12 novembre 2026). Ce module ne lit ni nom, ni courriel,
// ni témoignage, ni photo de donateur, ni montant de don pris un par un : tout passe par la fonction SQL
// studio_org_stats (migration 2026-11-25), seul endroit où la commission nette est calculée pour Studio.

export const WINDOW_DAYS = 30
/** Un organisme inscrit mais pas prêt depuis plus longtemps que ça apparaît dans « À traiter ». */
export const STALE_DAYS = 7
/** Une invitation qui expire dans moins que ça apparaît dans « À traiter ». */
export const EXPIRING_DAYS = 3
const DAY = 86_400_000

export interface OrgStats {
  donors: number
  donorsSince: number
  donations: number
  donationsSince: number
  netCents: number
  netSinceCents: number
  offlineNetCents: number
  feeCents: number
  feeSinceCents: number
  disputesOpen: number
  lastDonationAt: string | null
  owners: number
  volunteers: number
  lastLoginAt: string | null
  bounces: number
  bouncesSince: number
  complaints: number
  complaintsSince: number
}

export const EMPTY_STATS: OrgStats = {
  donors: 0, donorsSince: 0, donations: 0, donationsSince: 0, netCents: 0, netSinceCents: 0, offlineNetCents: 0, feeCents: 0, feeSinceCents: 0,
  disputesOpen: 0, lastDonationAt: null, owners: 0, volunteers: 0, lastLoginAt: null, bounces: 0, bouncesSince: 0, complaints: 0, complaintsSince: 0,
}

const n = (v: unknown) => Number(v ?? 0) || 0

/** Une ligne de studio_org_stats → OrgStats (les bigint arrivent parfois en texte). */
export function statsFromRow(r: Record<string, unknown>): OrgStats {
  return {
    donors: n(r.donors), donorsSince: n(r.donors_since), donations: n(r.donations), donationsSince: n(r.donations_since),
    netCents: n(r.net_cents), netSinceCents: n(r.net_since_cents), offlineNetCents: n(r.offline_net_cents),
    feeCents: n(r.fee_cents), feeSinceCents: n(r.fee_since_cents), disputesOpen: n(r.disputes_open),
    lastDonationAt: (r.last_donation_at as string | null) ?? null, owners: n(r.owners), volunteers: n(r.volunteers),
    lastLoginAt: (r.last_login_at as string | null) ?? null, bounces: n(r.bounces), bouncesSince: n(r.bounces_since),
    complaints: n(r.complaints), complaintsSince: n(r.complaints_since),
  }
}

/** Totaux par organisme réel (démo et ateliers exclus par la fonction SQL), indexés par identifiant. */
export async function orgStats(db: SupabaseClient, now = Date.now()): Promise<Map<string, OrgStats>> {
  const since = new Date(now - WINDOW_DAYS * DAY).toISOString()
  const { data, error } = await db.rpc('studio_org_stats', { p_since: since })
  if (error) throw error
  return new Map(((data ?? []) as Record<string, unknown>[]).map(r => [r.organization_id as string, statsFromRow(r)]))
}

export type Stage = 'pas-pret' | 'pret' | 'en-ligne' | 'suspendu'

export interface StudioOrg {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string
  wentLiveAt: string | null
  blockers: LaunchBlocker[]
  stage: Stage
  stats: OrgStats
}

/** Étape d'un organisme dans le Parcours. Prêt à lancer = exactement les conditions de « Mettre en ligne ». */
export function stageOf(status: string, blockers: LaunchBlocker[]): Stage {
  if (status === 'live') return 'en-ligne'
  if (status === 'suspended') return 'suspendu'
  return blockers.length ? 'pas-pret' : 'pret'
}

export function toStudioOrg(o: Record<string, unknown>, slug: string, stats: OrgStats | undefined): StudioOrg {
  const blockers = launchBlockers(o as { stripe_ready?: boolean; legal?: unknown })
  const status = String(o.status)
  return {
    id: o.id as string,
    name: o.name_fr as string,
    slug,
    status,
    createdAt: o.created_at as string,
    wentLiveAt: (o.went_live_at as string | null) ?? null,
    blockers,
    stage: stageOf(status, blockers),
    stats: stats ?? EMPTY_STATS,
  }
}

export interface InvitationLite {
  id: string
  email: string
  orgName: string | null
  expiresAt: string
  state: 'pending' | 'accepted' | 'revoked' | 'expired'
}

export interface RequestLite {
  id: string
  org_name: string
  source: string | null
  created_at: string
}

export type TodoItem =
  | { kind: 'demande'; id: string; orgName: string; source: string | null; createdAt: string }
  | { kind: 'invitation'; id: string; label: string; expiresAt: string }
  | { kind: 'pas-pret'; orgId: string; name: string; blockers: LaunchBlocker[]; days: number }
  | { kind: 'litige'; orgId: string; name: string; count: number }
  | { kind: 'courriels'; orgId: string; name: string; bounces: number; complaints: number }

/** « À traiter » : ce qui demande un geste de Studio, dans l'ordre où le faire. */
export function buildTodo(requests: RequestLite[], invitations: InvitationLite[], orgs: StudioOrg[], now = Date.now()): TodoItem[] {
  const out: TodoItem[] = []
  for (const r of requests) out.push({ kind: 'demande', id: r.id, orgName: r.org_name, source: r.source, createdAt: r.created_at })
  for (const o of orgs) if (o.stats.disputesOpen > 0) out.push({ kind: 'litige', orgId: o.id, name: o.name, count: o.stats.disputesOpen })
  for (const i of invitations) {
    if (i.state === 'pending' && new Date(i.expiresAt).getTime() - now < EXPIRING_DAYS * DAY) out.push({ kind: 'invitation', id: i.id, label: i.orgName || i.email, expiresAt: i.expiresAt })
  }
  for (const o of orgs) {
    const days = Math.floor((now - new Date(o.createdAt).getTime()) / DAY)
    if (o.stage === 'pas-pret' && days >= STALE_DAYS) out.push({ kind: 'pas-pret', orgId: o.id, name: o.name, blockers: o.blockers, days })
  }
  for (const o of orgs) {
    if (o.stats.bouncesSince > 0 || o.stats.complaintsSince > 0) out.push({ kind: 'courriels', orgId: o.id, name: o.name, bounces: o.stats.bouncesSince, complaints: o.stats.complaintsSince })
  }
  return out
}

export interface PlatformTotals {
  orgsByStatus: Record<Stage, number>
  donors: number
  donorsSince: number
  donations: number
  donationsSince: number
  netCents: number
  netSinceCents: number
  offlineNetCents: number
  feeCents: number
  feeSinceCents: number
  disputesOpen: number
  owners: number
  volunteers: number
  bounces: number
  bouncesSince: number
  complaints: number
  complaintsSince: number
}

/** Somme des organismes. Un même courriel chez deux organismes compte deux fois (seuil propre à chaque organisme). */
export function platformTotals(orgs: StudioOrg[]): PlatformTotals {
  const t: PlatformTotals = {
    orgsByStatus: { 'pas-pret': 0, pret: 0, 'en-ligne': 0, suspendu: 0 },
    donors: 0, donorsSince: 0, donations: 0, donationsSince: 0, netCents: 0, netSinceCents: 0, offlineNetCents: 0, feeCents: 0, feeSinceCents: 0,
    disputesOpen: 0, owners: 0, volunteers: 0, bounces: 0, bouncesSince: 0, complaints: 0, complaintsSince: 0,
  }
  for (const o of orgs) {
    t.orgsByStatus[o.stage]++
    for (const k of ['donors', 'donorsSince', 'donations', 'donationsSince', 'netCents', 'netSinceCents', 'offlineNetCents', 'feeCents', 'feeSinceCents', 'disputesOpen', 'owners', 'volunteers', 'bounces', 'bouncesSince', 'complaints', 'complaintsSince'] as const) {
      t[k] += o.stats[k]
    }
  }
  return t
}

export interface FunnelStep {
  total: number
  since: number
}

export interface Funnel {
  requests: FunnelStep
  invitations: FunnelStep
  signups: FunnelStep
  ready: FunnelStep
  live: FunnelStep
  /** Provenance des demandes : identifiant de l'organisme dont la signature a mené à la demande, ou « direct ». */
  sources: { source: string; total: number; since: number }[]
}

/**
 * Parcours demande → invitation → inscription → prêt à lancer → en ligne. « Prêt » compte les organismes prêts en
 * brouillon ET ceux déjà en ligne (ils ont été prêts). Les fenêtres se mesurent sur la date de chaque étape quand elle
 * existe (demande, invitation, création, mise en ligne) ; « prêt » n'a pas de date : sa fenêtre suit la création.
 */
export function buildFunnel(
  requests: { source: string | null; created_at: string }[],
  invitations: { created_at: string }[],
  orgs: StudioOrg[],
  now = Date.now(),
): Funnel {
  const since = now - WINDOW_DAYS * DAY
  const recent = (iso: string | null) => !!iso && new Date(iso).getTime() > since
  const step = <T,>(rows: T[], date: (r: T) => string | null): FunnelStep => ({ total: rows.length, since: rows.filter(r => recent(date(r))).length })
  const bySource = new Map<string, { total: number; since: number }>()
  for (const r of requests) {
    const k = r.source || 'direct'
    const v = bySource.get(k) ?? { total: 0, since: 0 }
    v.total++
    if (recent(r.created_at)) v.since++
    bySource.set(k, v)
  }
  const ready = orgs.filter(o => o.stage === 'pret' || o.stage === 'en-ligne')
  const live = orgs.filter(o => o.stage === 'en-ligne')
  return {
    requests: step(requests, r => r.created_at),
    invitations: step(invitations, r => r.created_at),
    signups: step(orgs, o => o.createdAt),
    ready: step(ready, o => o.createdAt),
    live: step(live, o => o.wentLiveAt),
    sources: [...bySource].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.total - a.total || a.source.localeCompare(b.source)),
  }
}
