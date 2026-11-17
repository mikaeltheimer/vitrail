// Journal des dons de la console : filtres par période (heure de l'organisme), mode de paiement, provenance et donateur.
// Partagé par le navigateur (Journal.tsx) et le serveur (api/admin/dons, api/admin/export). Aucune dépendance serveur.
//
// Décisions de Mika (17 nov. 2026) : fuseau fixe America/Toronto pour l'instant (pas de colonne par organisme) ;
// dans un rapport de période, un remboursement compte à la date du DON (le net d'une soirée reste juste même si un
// don est remboursé une semaine plus tard).

export const ORG_TIMEZONE = 'America/Toronto'

export const PAYMENTS = ['stripe', 'cash', 'seed', 'demo'] as const
export type Payment = (typeof PAYMENTS)[number]

export const PERIODS = ['aujourdhui', 'hier', 'semaine', 'mois', 'tout', 'perso'] as const
export type Period = (typeof PERIODS)[number]

/** Filtre tel qu'il voyage dans l'adresse (« du » et « au » : heure locale de l'organisme, AAAA-MM-JJTHH:MM, « au » exclu). */
export interface JournalFilter {
  du: string | null
  au: string | null
  paiement: Payment | null
  /** Clé de provenance (« direct » = sans provenance). */
  provenance: string | null
  q: string
}

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** Lit un filtre depuis des paramètres d'adresse ; toute valeur mal formée est ignorée. */
export function parseFilter(p: URLSearchParams): JournalFilter {
  const local = (k: string) => {
    const v = p.get(k)
    return v && LOCAL_RE.test(v) && localToUtc(v) ? v : null
  }
  const pay = p.get('paiement')
  const prov = (p.get('provenance') ?? '').trim()
  return {
    du: local('du'),
    au: local('au'),
    paiement: (PAYMENTS as readonly string[]).includes(pay ?? '') ? (pay as Payment) : null,
    provenance: prov && /^[a-z0-9-]{1,40}$/.test(prov) ? prov : null,
    q: (p.get('q') ?? '').trim().slice(0, 80),
  }
}

export function filterToParams(f: JournalFilter): URLSearchParams {
  const p = new URLSearchParams()
  if (f.du) p.set('du', f.du)
  if (f.au) p.set('au', f.au)
  if (f.paiement) p.set('paiement', f.paiement)
  if (f.provenance) p.set('provenance', f.provenance)
  if (f.q) p.set('q', f.q)
  return p
}

export const isFiltered = (f: JournalFilter) => !!(f.du || f.au || f.paiement || f.provenance || f.q)

// ── Fuseau horaire ─────────────────────────────────────────────────────────────

const partsFormat = new Map<string, Intl.DateTimeFormat>()
function zoneParts(ms: number, tz: string) {
  let fmt = partsFormat.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    partsFormat.set(tz, fmt)
  }
  const o: Record<string, number> = {}
  for (const x of fmt.formatToParts(new Date(ms))) if (x.type !== 'literal') o[x.type] = Number(x.value)
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, min: o.minute, s: o.second }
}

/** Décalage du fuseau à cet instant, en millisecondes (heure locale − UTC). */
function offsetAt(ms: number, tz: string): number {
  const p = zoneParts(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - (ms - (ms % 1000))
}

/** « 2026-12-04T17:00 » (heure de l'organisme) → instant UTC ; null si la date n'existe pas. */
export function localToUtc(local: string, tz = ORG_TIMEZONE): Date | null {
  const m = LOCAL_RE.exec(local) && local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  if (new Date(wall).getUTCDate() !== d) return null
  // Deux passes : le décalage peut changer entre l'heure « naïve » et l'heure réelle (passage à l'heure d'été)
  let ms = wall - offsetAt(wall, tz)
  ms = wall - offsetAt(ms, tz)
  return new Date(ms)
}

/** Instant → « 2026-12-04T17:00 » dans le fuseau de l'organisme. */
export function utcToLocal(date: Date, tz = ORG_TIMEZONE): string {
  const p = zoneParts(date.getTime(), tz)
  const z = (n: number) => String(n).padStart(2, '0')
  return `${p.y}-${z(p.m)}-${z(p.d)}T${z(p.h)}:${z(p.min)}`
}

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Bornes d'une période toute faite, en heure de l'organisme (« au » exclu). */
export function periodRange(period: Period, now = new Date(), tz = ORG_TIMEZONE): { du: string | null; au: string | null } {
  const today = utcToLocal(now, tz).slice(0, 10)
  const at = (day: string) => `${day}T00:00`
  switch (period) {
    case 'aujourdhui':
      return { du: at(today), au: at(addDays(today, 1)) }
    case 'hier':
      return { du: at(addDays(today, -1)), au: at(today) }
    case 'semaine':
      return { du: at(addDays(today, -6)), au: at(addDays(today, 1)) }
    case 'mois': {
      const [y, m] = today.split('-').map(Number)
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      return { du: at(`${today.slice(0, 7)}-01`), au: at(next) }
    }
    default:
      return { du: null, au: null }
  }
}

/** Quelle période toute faite correspond à ces bornes (pour allumer la bonne puce), sinon « perso » ou « tout ». */
export function periodOf(f: Pick<JournalFilter, 'du' | 'au'>, now = new Date()): Period {
  if (!f.du && !f.au) return 'tout'
  for (const p of PERIODS) {
    if (p === 'tout' || p === 'perso') continue
    const r = periodRange(p, now)
    if (r.du === f.du && r.au === f.au) return p
  }
  return 'perso'
}

// ── Résumé ─────────────────────────────────────────────────────────────────────

export interface JournalRow {
  id: string
  donorId: string
  createdAt: string
  amountCents: number
  refundedCents: number
  disputeStatus: 'open' | 'won' | 'lost' | null
  source: Payment
  channel: string | null
  donor: { name: string; color: string; hidden: boolean; erased: boolean } | null
}

export interface JournalSummary {
  grossCents: number
  refundedCents: number
  netCents: number
  donations: number
  donors: number
  /** Net et nombre de dons par mode de paiement. */
  byPayment: Record<Payment, { cents: number; count: number }>
  /** Frais Stripe que l'organisme paie lui-même (non couverts par les contributions) : propriétaire seulement, sinon null. */
  stripeFeesCents: number | null
  /** Une partie des frais est estimée (frais réels pas encore connus de Stripe). */
  stripeFeesEstimated: boolean
}

export interface JournalResponse {
  rows: JournalRow[]
  summary: JournalSummary
}

/** Résumé d'une sélection : chaque don compte à sa date, remboursements déduits. */
export function summarize(rows: JournalRow[]): Omit<JournalSummary, 'stripeFeesCents' | 'stripeFeesEstimated'> {
  const byPayment = Object.fromEntries(PAYMENTS.map(p => [p, { cents: 0, count: 0 }])) as JournalSummary['byPayment']
  let gross = 0
  let refunded = 0
  const donors = new Set<string>()
  for (const r of rows) {
    gross += r.amountCents
    refunded += Math.min(r.refundedCents, r.amountCents)
    const b = byPayment[r.source]
    b.cents += r.amountCents - Math.min(r.refundedCents, r.amountCents)
    b.count++
    donors.add(r.donorId)
  }
  return { grossCents: gross, refundedCents: refunded, netCents: gross - refunded, donations: rows.length, donors: donors.size, byPayment }
}
