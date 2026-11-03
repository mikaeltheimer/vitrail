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

/** Côté navigateur : l'adresse configurée, sauf si elle pointe vers localhost alors que la page est en ligne. */
export function browserOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
  const here = window.location.origin
  if (!configured || (isLocal(configured) && !isLocal(here))) return here
  return configured.replace(/\/$/, '')
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
