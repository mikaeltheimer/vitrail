import { getDb } from './db'

// Colonnes ajoutées par une migration que l'équipe lance à la main dans Supabase : tant qu'elle n'est pas passée,
// le site continue de fonctionner sans ces colonnes au lieu de tomber. Résultat gardé une minute.

let cache: { ok: boolean; at: number } | null = null

/** Témoignages (migration 2026-11-04-temoignages.sql) : donors.message_status et donors.quote_consent. */
export async function hasTestimonialColumns(): Promise<boolean> {
  if (cache && Date.now() - cache.at < 60_000) return cache.ok
  const { error } = await getDb().from('donors').select('message_status,quote_consent').limit(1)
  if (error) console.error('Migration des témoignages absente : lancez supabase/migrations/2026-11-04-temoignages.sql')
  cache = { ok: !error, at: Date.now() }
  return cache.ok
}
