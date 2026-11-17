import { missingForLaunch, type LegalInfo } from './identity-shared'
import { termsAccepted } from './terms'

/**
 * Ce qui manque à un organisme pour « Mettre en ligne » : un compte Stripe prêt, les coordonnées juridiques (Loi 25) et
 * l'acceptation de la version en vigueur des conditions (D8 : un organisme inscrit avant un changement doit l'accepter).
 */
export type LaunchBlocker = 'stripe' | 'juridique' | 'conditions'

/**
 * Définition UNIQUE de « prêt à lancer » : utilisée par goLive (lib/signup.ts) et par la section Studio, pour que les
 * deux ne puissent jamais diverger. Vide = prêt.
 */
export function launchBlockers(org: { stripe_ready?: boolean | null; legal?: unknown; terms_version?: string | null }): LaunchBlocker[] {
  const out: LaunchBlocker[] = []
  if (!org.stripe_ready) out.push('stripe')
  if (missingForLaunch((org.legal ?? {}) as Partial<LegalInfo>).length) out.push('juridique')
  if (!termsAccepted(org)) out.push('conditions')
  return out
}
