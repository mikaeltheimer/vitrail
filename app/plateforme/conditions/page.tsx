import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import PlatformShell from '@/components/plateforme/PlatformShell'
import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import { DEFAULT_FEE_SCHEDULE } from '@/lib/platform-fee'
import { TERMS_VERSION } from '@/lib/signup'
import type { Locale } from '@/i18n/config'

// Conditions de la plateforme pour les organismes : version PROVISOIRE (avocat). Sa version (TERMS_VERSION) est celle
// que l'inscription enregistre : changer l'une, c'est changer l'autre.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('plateforme.legal')
  return { title: t('conditionsTitre') }
}

export default async function ConditionsPlateforme() {
  const t = await getTranslations('plateforme')
  const ti = await getTranslations('inscription.conditions')
  const locale = (await getLocale()) as Locale
  const fee = DEFAULT_FEE_SCHEDULE
  const pct = (r: number) => new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { style: 'percent', maximumFractionDigits: 1 }).format(r)
  const b = (c: React.ReactNode) => <b>{c}</b>
  return (
    <PlatformShell>
      <main className="mx-auto max-w-[760px] space-y-6 px-6 pb-20 pt-6">
        <h1 className="m-0 text-[36px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          {t('legal.conditionsTitre')}
        </h1>
        <p className="card text-sm" style={{ borderColor: 'rgba(240,178,74,0.45)' }}>
          {t('provisoire')} · {TERMS_VERSION}
        </p>
        <p>{t('legal.conditionsIntro', { brand: CONFIG.brand.name })}</p>
        <ul className="space-y-3 pl-5">
          <li>{ti.rich('l1', { taux: pct(fee.rate), palier: pct(fee.tierRate), seuil: formatMoney(fee.tierAfterCents, locale), b })}</li>
          <li>{ti.rich('l2', { b })}</li>
          <li>{ti.rich('l3', { b })}</li>
          <li>{ti('l4')}</li>
          <li>{t('tarifs.rembourse')}</li>
          <li>{t('tarifs.direct', { brand: CONFIG.brand.name })}</li>
        </ul>
        <p className="muted">{t('legal.conditionsContact', { email: CONFIG.brand.studioLegal.email })}</p>
      </main>
    </PlatformShell>
  )
}
