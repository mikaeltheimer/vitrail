import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// L'accueil (« / ») est réglé par proxy.ts : la vitrine sur le domaine nu de la plateforme, le vitrail sur un organisme.
const nextConfig: NextConfig = {}

export default withNextIntl(nextConfig)
