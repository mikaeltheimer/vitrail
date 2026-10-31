// Limiteur en mémoire. Il freine les abus simples ; sur un déploiement serverless, chaque instance a sa propre
// mémoire, donc ce n'est pas une protection stricte (le vrai garde-fou des paiements reste Stripe).

const buckets = new Map<string, { count: number; reset: number }>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k)
    return true
  }
  b.count++
  return b.count <= max
}

export function clientKey(request: Request, scope: string): string {
  const fwd = request.headers.get('x-forwarded-for') || ''
  const ip = fwd.split(',')[0].trim() || 'local'
  return `${scope}:${ip}`
}
