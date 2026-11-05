import { createToken } from './donations'
import { getDb } from './db'
import { sendReminder } from './email'
import { hasEmailLog, hasLocaleColumn } from './schema'
import { isLocale, type Locale } from '@/i18n/config'

// Rappel du lendemain : un seul courriel par donateur, qui l'invite à ajouter un témoignage.
// Lancé chaque jour par Vercel Cron (vercel.json → /api/cron/reminders).
//
// Un donateur reçoit le rappel si, à la fois :
//  - son dernier don date de 20 à 72 heures (« le lendemain » ; 72 h rattrapent une journée où la tâche n'a pas pu passer) ;
//  - il a payé au moins un don réel (pas de démo, de don comptant ni de donnée d'essai) ;
//  - il n'a pas déjà de témoignage et son morceau n'est pas masqué ;
//  - on ne lui a jamais envoyé de rappel ;
//  - aucun de nos courriels ne lui a rebondi ou n'a été signalé comme indésirable (protège la réputation d'envoi).
// Sans journal des courriels, rien n'est envoyé : sans lui, on ne pourrait pas éviter les doublons.

const HOUR = 3_600_000
export const MIN_AGE_H = 20
export const MAX_AGE_H = 72
/** Plafond par passage : l'API de Resend limite le débit, et la tâche a une durée maximale. Le reste passe le lendemain. */
export const MAX_PER_RUN = 50
const PAUSE_MS = 600

export interface ReminderOptions {
  now?: number
  limit?: number
  /** Ne rien envoyer : dire seulement qui recevrait le rappel. */
  dry?: boolean
  baseUrl?: string
  pauseMs?: number
}

export interface ReminderResult {
  /** Raison pour laquelle rien n'a été fait, le cas échéant. */
  reason?: string
  candidates: number
  sent: number
  failed: number
  skipped: Record<string, number>
  /** Seulement en essai à blanc : adresses masquées de ceux qui recevraient le rappel. */
  wouldSend?: string[]
}

export const maskEmail = (email: string): string => {
  const [local, domain = ''] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function runReminders(opts: ReminderOptions = {}): Promise<ReminderResult> {
  const now = opts.now ?? Date.now()
  const limit = opts.limit ?? MAX_PER_RUN
  const result: ReminderResult = { candidates: 0, sent: 0, failed: 0, skipped: {} }
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1)

  if (!(await hasEmailLog())) return { ...result, reason: 'journal des courriels absent' }

  const db = getDb()
  const from = new Date(now - MAX_AGE_H * HOUR).toISOString()
  const to = new Date(now - MIN_AGE_H * HOUR).toISOString()

  // 1. Donateurs dont le dernier don tombe dans la fenêtre (le plus ancien d'abord)
  const { data: totals, error: totalsError } = await db
    .from('donor_totals')
    .select('donor_id,last_donation_at')
    .gte('last_donation_at', from)
    .lte('last_donation_at', to)
    .order('last_donation_at', { ascending: true })
    .limit(500)
  if (totalsError) throw totalsError
  const ids = (totals ?? []).map(r => r.donor_id as string)
  if (!ids.length) return result

  // 2. Leur fiche, leurs dons réels et ce qu'on leur a déjà écrit
  const withLocale = await hasLocaleColumn()
  const donorCols: string = `id,email,message,hidden${withLocale ? ',locale' : ''}`
  const [donorsRes, paidRes, logRes] = await Promise.all([
    db.from('donors').select(donorCols).in('id', ids),
    db.from('donations').select('donor_id').in('donor_id', ids).eq('source', 'stripe'),
    db.from('email_log').select('donor_id,kind,status').in('donor_id', ids),
  ])
  for (const r of [donorsRes, paidRes, logRes]) if (r.error) throw r.error

  const donorRows = (donorsRes.data ?? []) as unknown as { id: string; email: string; message: string | null; hidden: boolean; locale?: string }[]
  const donors = new Map(donorRows.map(d => [d.id, d]))
  const paid = new Set((paidRes.data ?? []).map(r => r.donor_id as string))
  const reminded = new Set<string>()
  const unreachable = new Set<string>()
  for (const l of logRes.data ?? []) {
    // Un rappel « failed » ou « skipped » n'a pas été remis : on peut réessayer. Les autres comptent comme envoyés.
    if (l.kind === 'reminder' && l.status !== 'failed' && l.status !== 'skipped') reminded.add(l.donor_id as string)
    if (l.status === 'bounced' || l.status === 'complained') unreachable.add(l.donor_id as string)
  }

  const eligible: { id: string; email: string; locale: Locale }[] = []
  for (const id of ids) {
    const d = donors.get(id)
    if (!d) skip('fiche absente')
    else if (!paid.has(id)) skip('aucun don payé') // i18n-ok : console admin (FR)
    else if (d.hidden) skip('morceau masqué') // i18n-ok : console admin (FR)
    else if (d.message && d.message.trim()) skip('a déjà un témoignage') // i18n-ok : console admin (FR)
    else if (reminded.has(id)) skip('déjà rappelé') // i18n-ok : console admin (FR)
    else if (unreachable.has(id)) skip('adresse en rebond ou signalée') // i18n-ok : console admin (FR)
    else eligible.push({ id, email: d.email, locale: isLocale(d.locale) ? d.locale : 'fr' })
  }
  result.candidates = eligible.length
  const batch = eligible.slice(0, limit)
  if (eligible.length > batch.length) result.skipped['reporté au prochain passage'] = eligible.length - batch.length // i18n-ok : console admin (FR)

  if (opts.dry) {
    result.wouldSend = batch.map(d => maskEmail(d.email))
    return result
  }

  // 3. Envoi, au rythme que Resend accepte ; un échec n'arrête pas les suivants
  for (const [i, d] of batch.entries()) {
    try {
      const token = await createToken(d.id)
      const ok = await sendReminder({ to: d.email, token, locale: d.locale, donorId: d.id, baseUrl: opts.baseUrl })
      if (ok) result.sent++
      else result.failed++
    } catch (e) {
      console.error('Rappel non envoyé :', e)
      result.failed++
    }
    if (i < batch.length - 1) await sleep(opts.pauseMs ?? PAUSE_MS)
  }
  return result
}
