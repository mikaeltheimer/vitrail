import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import PlatformShell from '@/components/plateforme/PlatformShell'
import LegalDoc from '@/components/plateforme/LegalDoc'

// Conditions de la plateforme pour les organismes (le contrat, y compris l'entente de traitement des renseignements des
// donateurs). Texte : messages, legalPlateforme.conditions. Provisoire : à faire relire par un avocat.
// Sa version est TERMS_VERSION (lib/terms.ts), enregistrée à l'inscription : changer le texte, c'est changer la version
// (et LEGAL_EFFECTIVE_DATES, au même endroit : lib/terms.ts).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPlateforme.conditions')
  return { title: t('titre') }
}

export default function ConditionsPlateforme() {
  return (
    <PlatformShell>
      <LegalDoc doc="conditions" />
    </PlatformShell>
  )
}
