import type { Metadata, Viewport } from 'next'
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
