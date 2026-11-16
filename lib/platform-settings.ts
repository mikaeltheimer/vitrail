import { getDb } from './db'
import { DEFAULT_CONTRIBUTION_SETTINGS, validateContributionSettings, type ContributionSettings } from './contribution'
import { DEFAULT_TAX_RATES, parseTaxRates, type Province } from './tax'

// Réglages de la plateforme (table platform_settings, migration 2026-11-27) : une seule source de vérité, modifiable sans
// déploiement. Lecture serveur seulement. Une ligne absente, invalide ou une base injoignable ne bloque jamais un paiement :
// on retombe sur les valeurs par défaut et on le journalise.

export interface PlatformSettings {
  contribution: ContributionSettings
  taxRates: Record<Province, number>
}

const TTL_MS = 60_000
let cache: { at: number; value: PlatformSettings } | null = null

export function clearPlatformSettingsCache() {
  cache = null
}

export async function platformSettings(now = Date.now()): Promise<PlatformSettings> {
  if (cache && now - cache.at < TTL_MS) return cache.value
  let contribution = DEFAULT_CONTRIBUTION_SETTINGS
  let taxRates = DEFAULT_TAX_RATES
  try {
    const { data, error } = await getDb().from('platform_settings').select('key,value').in('key', ['contribution_brackets', 'tax_rates'])
    if (error) throw error
    const byKey = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]))
    if (byKey.has('contribution_brackets')) {
      const checked = validateContributionSettings(byKey.get('contribution_brackets'))
      if (checked.ok) contribution = checked.value
      else console.error('Réglage contribution_brackets invalide, valeurs par défaut utilisées :', checked.errors.join(' ; '))
    }
    if (byKey.has('tax_rates')) taxRates = parseTaxRates(byKey.get('tax_rates'))
  } catch (e) {
    console.error('Réglages de la plateforme illisibles, valeurs par défaut utilisées :', e)
    return { contribution, taxRates } // pas de cache : on réessaiera au prochain paiement
  }
  const value = { contribution, taxRates }
  cache = { at: now, value }
  return value
}
