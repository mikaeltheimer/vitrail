import { missingForLaunch, type LegalInfo } from './identity-shared'

/** Ce qui manque à un organisme pour « Mettre en ligne » : un compte Stripe prêt et les coordonnées juridiques (Loi 25). */
export type LaunchBlocker = 'stripe' | 'juridique'

/**
 * Définition UNIQUE de « prêt à lancer » : utilisée par goLive (lib/signup.ts) et par la section Studio, pour que les
 * deux ne puissent jamais diverger. Vide = prêt.
 */
export function launchBlockers(org: { stripe_ready?: boolean | null; legal?: unknown }): LaunchBlocker[] {
  const out: LaunchBlocker[] = []
  if (!org.stripe_ready) out.push('stripe')
  if (missingForLaunch((org.legal ?? {}) as Partial<LegalInfo>).length) out.push('juridique')
  return out
}
