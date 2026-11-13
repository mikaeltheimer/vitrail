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
import { headers } from 'next/headers'
import { permanentRedirect } from 'next/navigation'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { brandFor, CONFIG } from '@/lib/config'
import { requestIdentity } from '@/lib/identity'
import { OrgIdentityProvider } from '@/components/OrgIdentity'
import Atelier from '@/components/atelier/Atelier'
import { OrgMissingPage } from '@/components/ErrorPages'
import { platformUrl } from '@/lib/tenant'
import { isPreviewEnv } from '@/lib/hosts'
import { siteUrl } from '@/lib/env'
import { translatorFor } from '@/lib/i18n'

async function pageBase(): Promise<URL> {
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim()
  if (!host) return new URL(siteUrl())
  const proto = (h.get('x-forwarded-proto') || '').split(',')[0].trim() || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
  try {
    return new URL(`${proto}://${host}`)
  } catch {
    return new URL(siteUrl())
  }
}

// Titre et description dans la langue de la requête ; l'image de partage est celle de la même langue (/api/og).
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale
  const t = translatorFor(locale)
  const { identity, surface } = await requestIdentity()
  const org = identity ? identity.texts[locale].name : CONFIG.brand.name
  const title = t('meta.titre', { org })
  return {
    // L'adresse de la PAGE (sous-domaine de l'organisme, ou plateforme) : l'image de partage doit être demandée là,
    // sinon /api/og ne sait pas de quel organisme il s'agit. siteUrl() seulement à défaut d'en-tête.
    metadataBase: await pageBase(),
    title,
    description: t('meta.description', { org, slogan: brandFor(locale).slogan }),
    robots: { index: false },
    // Icône d'onglet : celle de l'organisme s'il en a téléversé une, sinon le symbole de Donivers
    icons: identity?.iconUrl
      ? { icon: identity.iconUrl, apple: identity.iconUrl }
      : { icon: [{ url: '/brand/donivers-symbole.svg', type: 'image/svg+xml' }, { url: '/brand/icon-32.png', sizes: '32x32', type: 'image/png' }], apple: '/brand/apple-touch-icon.png' },
    openGraph: { title, type: 'website', locale: INTL_TAG[locale].replace('-', '_'), images: [{ url: surface === 'platform' ? `/api/og?plateforme&lang=${locale}` : `/api/og?lang=${locale}`, width: 1200, height: 630, alt: title }] },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0A12',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale
  const { identity, surface, atelier, missing, redirect, slug } = await requestIdentity()
  // Ancien identifiant de l'organisme : même page à son adresse actuelle (les QR imprimés ne cassent pas)
  if (redirect) permanentRedirect(redirect)
  const platform = platformUrl(new Request('https://x/', { headers: await headers() }))
  // Signature « propulsé par » : la vitrine (/plateforme en prévisualisation, où le domaine nu n'existe pas), avec la
  // provenance, pour savoir quels vitraux amènent des demandes d'invitation
  const brandHref = `${platform}${isPreviewEnv() ? '/plateforme' : '/'}${slug ? `?ref=${encodeURIComponent(slug)}` : ''}`
  const page = missing ? <OrgMissingPage platformHref={platform} /> : atelier && surface === 'org' && identity ? <Atelier>{children}</Atelier> : children
  return (
    <html lang={INTL_TAG[locale]}>
      <body>
        <NextIntlClientProvider>
          <OrgIdentityProvider identity={identity} surface={surface} brandHref={brandHref}>
            {page}
          </OrgIdentityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
