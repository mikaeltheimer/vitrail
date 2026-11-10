import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// L'accueil (« / ») est réglé par proxy.ts : la vitrine sur le domaine nu de la plateforme, le vitrail sur un organisme.
// L'image de partage lit ses polices et le logo sur disque : à inclure dans la fonction serveur.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/og': ['./assets/fonts/**/*', './public/brand/**/*'],
  },
}

export default withNextIntl(nextConfig)
