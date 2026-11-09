import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import PlatformShell from '@/components/plateforme/PlatformShell'
import LegalDoc from '@/components/plateforme/LegalDoc'

// Confidentialité de la PLATEFORME (vitrine, demandes d'invitation, comptes d'équipe ; rôle de Studio pour les donateurs).
// Texte : messages, legalPlateforme.confidentialite. Provisoire : à faire relire par un avocat.
// Les durées de conservation annoncées sont appliquées par lib/retention.ts : changer l'un, c'est changer l'autre.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPlateforme.confidentialite')
  return { title: t('titre') }
}

export default function ConfidentialitePlateforme() {
  return (
    <PlatformShell>
      <LegalDoc doc="confidentialite" />
    </PlatformShell>
  )
}
