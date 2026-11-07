import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { CONFIG } from '@/lib/config'
import { requestIdentity } from '@/lib/identity'
import { translatorFor } from '@/lib/i18n'

// Métadonnées de partage : la mosaïque se promeut aussi en ligne (réseaux sociaux, infolettre), sans présence sur place.
// La langue est celle du lien partagé (?lang=, posé par le bouton « Partager ») ; l'image, la même (voir /api/og).
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale
  const t = translatorFor(locale)
  const { identity } = await requestIdentity()
  const org = identity ? identity.texts[locale].name : CONFIG.brand.name
  const title = t('meta.vitrailTitre', { org })
  const description = t('meta.vitrailDescription')
  return {
    title,
    description,
    openGraph: {
      title: t('meta.titre', { org }),
      description,
      type: 'website',
      locale: INTL_TAG[locale].replace('-', '_'),
      images: [{ url: `/api/og?lang=${locale}`, width: 1200, height: 630, alt: t('meta.titre', { org }) }],
    },
  }
}

export default function VitrailLayout({ children }: { children: React.ReactNode }) {
  return children
}
