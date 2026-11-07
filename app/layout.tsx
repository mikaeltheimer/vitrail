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
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { brandFor, CONFIG } from '@/lib/config'
import { requestIdentity } from '@/lib/identity'
import { OrgIdentityProvider } from '@/components/OrgIdentity'
import Atelier from '@/components/atelier/Atelier'
import { siteUrl } from '@/lib/env'
import { translatorFor } from '@/lib/i18n'

// Titre et description dans la langue de la requête ; l'image de partage est celle de la même langue (/api/og).
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale
  const t = translatorFor(locale)
  const { identity } = await requestIdentity()
  const org = identity ? identity.texts[locale].name : CONFIG.brand.name
  const title = t('meta.titre', { org })
  return {
    metadataBase: new URL(siteUrl()),
    title,
    description: t('meta.description', { org, slogan: brandFor(locale).slogan }),
    robots: { index: false },
    openGraph: { title, type: 'website', locale: INTL_TAG[locale].replace('-', '_'), images: [{ url: `/api/og?lang=${locale}`, width: 1200, height: 630, alt: title }] },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0A12',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale
  const { identity, surface, atelier } = await requestIdentity()
  return (
    <html lang={INTL_TAG[locale]}>
      <body>
        <NextIntlClientProvider>
          <OrgIdentityProvider identity={identity} surface={surface}>
            {atelier && surface === 'org' && identity ? <Atelier>{children}</Atelier> : children}
          </OrgIdentityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
