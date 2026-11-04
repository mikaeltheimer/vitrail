import type { Metadata, Viewport } from 'next'
// Polices Donivers, auto-hébergées (aucune requête externe : important sur un Wi-Fi d'événement)
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/dm-sans/latin-ext-400.css'
import '@fontsource/dm-sans/latin-ext-600.css'
import '@fontsource/fraunces/latin-500.css'
import '@fontsource/fraunces/latin-400-italic.css'
import './globals.css'
import { CONFIG } from '@/lib/config'

export const metadata: Metadata = {
  title: `${CONFIG.brand.name} — ${CONFIG.orgName}`,
  description: `Le Donivers de l'${CONFIG.orgName} : chaque don devient un morceau du vitrail. ${CONFIG.brand.slogan}`,
  robots: { index: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0A12',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  )
}
