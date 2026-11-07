// Adresses de la plateforme, sans accès à la base : utilisable par proxy.ts.

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
/** Suffixe des organismes d'entraînement ; « -- » est interdit dans l'identifiant d'un organisme réel. */
export const PRACTICE_SUFFIX = '--essai'
/** Identifiants qu'un organisme ne peut pas prendre (la même liste, plus courte, est vérifiée par la base). */
export const RESERVED_ORG_SLUGS = [
  'www', 'www2', 'admin', 'api', 'app', 'mail', 'smtp', 'ftp', 'static', 'assets', 'cdn', 'status', 'help', 'support', 'docs', 'blog',
  'dashboard', 'login', 'auth', 'console', 'donivers', 'demo', 'test', 'staging', 'preview', 'dev', 'studio', 'plateforme', 'inscription',
  'entrainement', 'essai',
] as const
/** Un identifiant qu'un NOUVEL organisme peut choisir (forme, réservés, place pour le suffixe d'entraînement). */
export const orgSlugProblem = (slug: string): 'forme' | 'reserve' | null => {
  if (!SLUG_RE.test(slug) || slug.includes('--') || slug.length + PRACTICE_SUFFIX.length > 40) return 'forme'
  return (RESERVED_ORG_SLUGS as readonly string[]).includes(slug) ? 'reserve' : null
}
export const PREVIEW_ORG_COOKIE = 'donivers_org_apercu'
/** Prévisualisation Vercel ou développement local : jamais la production. */
export const isPreviewEnv = () => process.env.VERCEL_ENV === 'preview' || (process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production')
export const platformDomain = () => (process.env.PLATFORM_DOMAIN || '').trim().toLowerCase().replace(/^\.+/, '')

const hostOf = (h: string | null | undefined) => (h ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')

/** Le domaine nu de la plateforme (ou www.) : le site de la plateforme, pas un organisme. */
export function isPlatformHost(hostHeader: string | null | undefined): boolean {
  const domain = platformDomain()
  const host = hostOf(hostHeader)
  return !!domain && !!host && (host === domain || host === `www.${domain}`)
}

/** Anciens domaines de la plateforme (LEGACY_PLATFORM_DOMAINS, séparés par des virgules) : redirigés vers le domaine actuel. */
export const legacyDomains = (): string[] =>
  (process.env.LEGACY_PLATFORM_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase().replace(/^\.+/, ''))
    .filter(d => d && d !== platformDomain())

/** Adresse sur le domaine actuel pour une requête arrivée sur un ancien domaine (chemin et paramètres gardés), sinon null. */
export function legacyRedirect(hostHeader: string | null | undefined, pathAndSearch: string): string | null {
  const domain = platformDomain()
  const host = hostOf(hostHeader)
  if (!domain || !host) return null
  for (const old of legacyDomains()) {
    if (host === old || host === `www.${old}`) return `https://${domain}${pathAndSearch}`
    if (host.endsWith(`.${old}`)) {
      const label = host.slice(0, -(old.length + 1))
      if (SLUG_RE.test(label)) return `https://${label}.${domain}${pathAndSearch}`
    }
  }
  return null
}


/**
 * En-tête interne écrit par proxy.ts (jamais repris du client) : quelle sorte de page.
 * - platform : vitrine, inscription, Studio, connexion (aucun organisme) ;
 * - console  : /admin (l'équipe garde sa langue, même si l'organisme n'en offre qu'une) ;
 * - org      : les pages publiques d'un organisme (langue limitée à celles qu'il offre).
 */
export const SURFACE_HEADER = 'x-donivers-surface'
export type Surface = 'platform' | 'console' | 'org'
const PLATFORM_PATHS = ['/plateforme', '/inscription', '/studio', '/connexion']

export function surfaceOf(host: string | null | undefined, path: string): Surface {
  if (isPlatformHost(host) || PLATFORM_PATHS.some(p => path === p || path.startsWith(`${p}/`)) || path.startsWith('/api/plateforme') || path.startsWith('/api/inscription') || path.startsWith('/api/studio')) return 'platform'
  if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin')) return 'console'
  return 'org'
}
