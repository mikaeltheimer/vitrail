// Variables d'environnement, lues à l'usage (jamais à l'import) pour que le build passe sans configuration.

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
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

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}
