import type { Metadata, Viewport } from 'next'
import '@fontsource/fraunces/latin-400-italic.css'
import '@fontsource/fraunces/latin-600.css'
import '@fontsource/fraunces/latin-700.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-700.css'
import './globals.css'
import { CONFIG } from '@/lib/config'

export const metadata: Metadata = {
  title: `${CONFIG.appName} — ${CONFIG.orgName}`,
  description: `Donnez à l'${CONFIG.orgName} et voyez votre morceau de verre s'ajouter au vitrail.`,
  robots: { index: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07060b',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  )
}
