import type { Metadata } from 'next'
import { CONFIG } from '@/lib/config'

// Métadonnées de partage : la mosaïque se promeut aussi en ligne (réseaux sociaux, infolettre), sans présence sur place.
export const metadata: Metadata = {
  title: `Le vitrail — ${CONFIG.orgName}`,
  description: `Chaque don à l'${CONFIG.orgName} devient un morceau de verre. Explorez le vitrail et ajoutez le vôtre.`,
  openGraph: {
    title: `${CONFIG.appName} — ${CONFIG.orgName}`,
    description: `Chaque don devient un morceau de verre. Explorez le vitrail et ajoutez le vôtre.`,
    type: 'website',
    locale: 'fr_CA',
  },
}

export default function VitrailLayout({ children }: { children: React.ReactNode }) {
  return children
}
