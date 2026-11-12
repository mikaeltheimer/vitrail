import { getDb } from './db'

// Colonnes ajoutées par une migration que l'équipe lance à la main dans Supabase : tant qu'elle n'est pas passée,
// le site continue de fonctionner sans ces colonnes au lieu de tomber. Résultat gardé une minute.

let cache: { ok: boolean; at: number } | null = null

/** Langue du donateur (migration 2026-11-05-langue-donateur.sql) : donors.locale. */
let localeCache: { ok: boolean; at: number } | null = null
export async function hasLocaleColumn(): Promise<boolean> {
  if (localeCache && Date.now() - localeCache.at < 60_000) return localeCache.ok
  const { error } = await getDb().from('donors').select('locale').limit(1)
  if (error) console.error('Migration de la langue absente : lancez supabase/migrations/2026-11-05-langue-donateur.sql')
  localeCache = { ok: !error, at: Date.now() }
  return localeCache.ok
}

/** Témoignages (migration 2026-11-04-temoignages.sql) : donors.message_status et donors.quote_consent. */
export async function hasTestimonialColumns(): Promise<boolean> {
  if (cache && Date.now() - cache.at < 60_000) return cache.ok
  const { error } = await getDb().from('donors').select('message_status,quote_consent').limit(1)
  if (error) console.error('Migration des témoignages absente : lancez supabase/migrations/2026-11-04-temoignages.sql')
  cache = { ok: !error, at: Date.now() }
  return cache.ok
}

/** Question du témoignage (migration 2026-11-21-question-temoignage.sql) : donors.message_question. */
let questionCache: { ok: boolean; at: number } | null = null
export async function hasMessageQuestion(): Promise<boolean> {
  if (questionCache && Date.now() - questionCache.at < 60_000) return questionCache.ok
  const { error } = await getDb().from('donors').select('message_question').limit(1)
  if (error) console.error('Migration de la question du témoignage absente : lancez supabase/migrations/2026-11-21-question-temoignage.sql')
  questionCache = { ok: !error, at: Date.now() }
  return questionCache.ok
}

/** Journal des courriels (migration 2026-11-05-journal-courriels.sql) : table email_log. */
let emailLogCache: { ok: boolean; at: number } | null = null
export async function hasEmailLog(): Promise<boolean> {
  if (emailLogCache && Date.now() - emailLogCache.at < 60_000) return emailLogCache.ok
  const { error } = await getDb().from('email_log').select('id').limit(1)
  if (error) console.error('Journal des courriels absent : lancez supabase/migrations/2026-11-05-journal-courriels.sql')
  emailLogCache = { ok: !error, at: Date.now() }
  return emailLogCache.ok
}
