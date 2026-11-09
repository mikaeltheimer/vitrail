// Variables d'environnement, lues à l'usage (jamais à l'import) pour que le build passe sans configuration.

const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)

/**
 * Adresse publique du site. Garde-fou : une adresse « localhost » restée dans la configuration d'un site en ligne
 * (copiée de .env.example) est ignorée au profit du domaine de production que fournit Vercel.
 */
export function siteUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (configured && !(isLocal(configured) && vercel)) return configured.replace(/\/$/, '')
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}

export type PaymentMode = 'stripe' | 'demo' | 'off'

/**
 * - stripe : vrais paiements (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET).
 * - demo   : AUCUN paiement, le don est enregistré tout de suite (source « demo »). Pour présenter l'outil.
 * - off    : paiements désactivés.
 * La démo n'est jamais choisie en production sans demande explicite (PAYMENT_MODE=demo), sinon n'importe qui
 * pourrait ajouter des morceaux gratuitement.
 */
export function paymentMode(): PaymentMode {
  const wanted = (process.env.PAYMENT_MODE || '').toLowerCase()
  if (wanted === 'off') return 'off'
  if (wanted === 'demo') return 'demo'
  if (wanted === 'stripe') return process.env.STRIPE_SECRET_KEY ? 'stripe' : 'off'
  if (process.env.STRIPE_SECRET_KEY) return 'stripe'
  return process.env.NODE_ENV === 'production' ? 'off' : 'demo'
}

/**
 * Mode de paiement d'UN organisme. Le réglage global est l'interrupteur maître de Studio Existence :
 * - un organisme d'ENTRAÎNEMENT est toujours en démo (jamais Stripe), sauf si tout est fermé ;
 * - global « off » ou « demo » : s'applique à tous (tant que PAYMENT_MODE=demo, aucun vrai paiement nulle part) ;
 * - global « stripe » : un organisme en brouillon a ses dons fermés (« ouvrira bientôt » : on s'exerce sur l'entraînement) ;
 *   un organisme en ligne paie par Stripe seulement si son compte est prêt, sinon les dons sont fermés.
 */
export function paymentModeFor(org: { status: string; stripeReady: boolean; practiceOf?: string | null; showcase?: boolean }): PaymentMode {
  // Démonstration : jamais aucun don, même fictif (la démo se montre telle qu'elle est)
  if (org.showcase) return 'off'
  const global = paymentMode()
  if (org.practiceOf) return global === 'off' ? 'off' : 'demo'
  if (global !== 'stripe') return global
  return org.status === 'live' && org.stripeReady ? 'stripe' : 'off'
}

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}
