import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireEnv } from './env'

let client: SupabaseClient | null = null

/** Client Supabase côté serveur (clé de service). Ne jamais importer depuis un composant client. */
export function getDb(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
