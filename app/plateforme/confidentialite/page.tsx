import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import PlatformShell from '@/components/plateforme/PlatformShell'
import { CONFIG } from '@/lib/config'

// Confidentialité de la PLATEFORME (vitrine, demandes d'invitation, comptes d'équipe). Version provisoire (avocat).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('plateforme.legal')
  return { title: t('confTitre') }
}

export default async function ConfidentialitePlateforme() {
  const t = await getTranslations('plateforme')
  const s = CONFIG.brand.studioLegal
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[760px] space-y-5 px-6 pb-20 pt-6">
        <h1 className="m-0 text-[36px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          {t('legal.confTitre')}
        </h1>
        <p className="card text-sm" style={{ borderColor: 'rgba(240,178,74,0.45)' }}>
          {t('provisoire')}
        </p>
        <p>{t('legal.confIntro', { brand: CONFIG.brand.name })}</p>
        <p>{t('legal.confCollecte')}</p>
        <p>{t('legal.confUsage')}</p>
        <p>{t('legal.confDroits', { email: s.email })}</p>
        <p className="muted">{t('legal.confResponsable', { studio: s.name, address: s.address })}</p>
      </main>
    </PlatformShell>
  )
}
