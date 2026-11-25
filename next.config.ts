import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// L'accueil (« / ») est réglé par proxy.ts : la vitrine sur le domaine nu de la plateforme, le vitrail sur un organisme.
// L'image de partage lit ses polices et le logo sur disque : à inclure dans la fonction serveur.
//
// Intégration dans un cadre (anti-clickjacking) : aucune page ne peut être affichée dans le cadre d'un autre site (un
// site malveillant pourrait y piéger un clic, dans la console par exemple). Seule la plateforme elle-même peut intégrer
// ses pages : l'aperçu de l'écran de la démo sur l'accueil, les aperçus de la démo. Les pages faites pour être intégrées
// chez un organisme (EMBEDDABLE) s'ouvrent à tous les sites.
const platform = (process.env.PLATFORM_DOMAIN || '').trim().toLowerCase().replace(/^\.+/, '')
const ancestors = ["'self'", ...(platform ? [`https://${platform}`, `https://*.${platform}`] : [])].join(' ')
const EMBEDDABLE: string[] = []

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors ${ancestors}` }] },
      // Plus bas dans la liste : remplace la règle générale pour ces pages
      ...EMBEDDABLE.map(source => ({ source, headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }] })),
    ]
  },
  outputFileTracingIncludes: {
    '/api/og': ['./assets/fonts/**/*', './public/brand/**/*'],
  },
}

export default withNextIntl(nextConfig)
