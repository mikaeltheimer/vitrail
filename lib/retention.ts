import { getDb } from './db'

// Durées de conservation des renseignements de la PLATEFORME, telles que les annonce la politique de confidentialité
// de la vitrine (messages : legalPlateforme.confidentialite, section « conservation »). Appliquées chaque jour par la
// tâche planifiée (app/api/cron/reminders). Changer une durée ici, c'est changer la politique, et inversement.
// Les renseignements des donateurs ne sont PAS concernés : ils relèvent de chaque organisme (lib/erase.ts, console).

const DAY = 86_400_000
export const RETENTION = {
  /** Tentatives de connexion échouées (frein contre les essais de mots de passe). */
  loginFailuresDays: 1,
  /** Liens « mot de passe oublié » et codes de confirmation d'inscription, utilisés ou non. */
  shortTokensDays: 30,
  /** Sessions expirées. */
  expiredSessionsDays: 0,
  /** Invitations acceptées, annulées ou expirées. */
  closedInvitationsDays: 365,
  /** Demandes d'invitation de la vitrine, après la dernière date connue (réponse ou demande). */
  accessRequestsDays: 730,
  /** Journal des courriels de la plateforme (sans organisme : demandes, codes, invitations à créer un organisme). */
  platformEmailLogDays: 365,
} as const

export interface PurgeResult {
  [table: string]: number | string
}

const before = (days: number, now: number) => new Date(now - days * DAY).toISOString()

/** Efface ce qui a dépassé sa durée. Ne lève pas d'erreur : un échec est noté et le reste continue. */
export async function purgeExpired(now = Date.now()): Promise<PurgeResult> {
  const db = getDb()
  const out: PurgeResult = {}
  const run = async (name: string, q: PromiseLike<{ error: { message: string } | null; count?: number | null }>) => {
    try {
      const { error, count } = await q
      out[name] = error ? `erreur : ${error.message}` : (count ?? 0) // i18n-ok : journal de la tâche (FR)
    } catch (e) {
      out[name] = `erreur : ${(e as Error).message}` // i18n-ok : journal de la tâche (FR)
    }
  }
  const nowIso = new Date(now).toISOString()
  await run('login_failures', db.from('login_failures').delete({ count: 'exact' }).lte('created_at', before(RETENTION.loginFailuresDays, now)))
  await run('password_resets', db.from('password_resets').delete({ count: 'exact' }).lte('created_at', before(RETENTION.shortTokensDays, now)))
  await run('signup_codes', db.from('signup_codes').delete({ count: 'exact' }).lte('created_at', before(RETENTION.shortTokensDays, now)))
  await run('sessions', db.from('sessions').delete({ count: 'exact' }).lte('expires_at', before(RETENTION.expiredSessionsDays, now)))
  // Invitations closes : acceptée, annulée, ou expirée, depuis plus d'un an
  const old = before(RETENTION.closedInvitationsDays, now)
  await run('invitations', db.from('invitations').delete({ count: 'exact' }).lte('created_at', old).or(`accepted_at.not.is.null,revoked_at.not.is.null,expires_at.lte."${nowIso}"`))
  // Demandes d'invitation : deux ans après la demande et, si elle a été traitée, après son traitement
  const twoYears = before(RETENTION.accessRequestsDays, now)
  await run('access_requests', db.from('access_requests').delete({ count: 'exact' }).lte('created_at', twoYears).or(`handled_at.is.null,handled_at.lte."${twoYears}"`))
  await run('email_log', db.from('email_log').delete({ count: 'exact' }).is('organization_id', null).lte('created_at', before(RETENTION.platformEmailLogDays, now)))
  return out
}
