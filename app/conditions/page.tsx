import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/lib/format'
import { requestIdentity } from '@/lib/identity'
import { clampLocale, type LegalInfo } from '@/lib/identity-shared'
import BrandFooter from '@/components/BrandFooter'
import { Items, Section, legalTags } from '@/components/Legal'

// Conditions d'utilisation. Les passages [À COMPLÉTER] sont les coordonnées que l'organisme n'a pas encore remplies (Mon vitrail) ou sont à confirmer par l'organisme.
// Point de départ, pas un avis juridique : à faire revoir par un avocat avant l'ouverture à d'autres organismes.
// Textes : messages/fr.json et en.json, espace « conditions ».

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('conditions')
  return { title: t('metaTitre', { brand: CONFIG.brand.name }) }
}

const studioVars = {
  studioName: CONFIG.brand.studioLegal.name,
  neq: CONFIG.brand.studioLegal.neq,
  studioAddress: CONFIG.brand.studioLegal.address,
  studioEmail: CONFIG.brand.studioLegal.email,
}

export default async function ConditionsPage() {
  const t = await getTranslations('conditions')
  const tc = await getTranslations('commun')
  const { identity } = await requestIdentity()
  const locale = (identity ? clampLocale(identity.locales, (await getLocale()) as Locale) : await getLocale()) as Locale
  const org = { name: identity ? identity.texts[locale].name : CONFIG.brand.name }
  const legal: LegalInfo = identity?.legal ?? { entity: '', neq: '', address: '', officerName: '', officerEmail: '', officerPhone: '', retention: '', updated: '' }
  const tags = legalTags(tc('aCompleter'), legal, (await getTranslations('confidentialite'))('retentionDefaut', { org: org.name }))
  const v = {
    org: org.name,
    brand: CONFIG.brand.name,
    studio: CONFIG.brand.studio,
    ...studioVars,
    min: formatMoney(CONFIG.minAmountCents, locale),
    max: formatMoney(CONFIG.maxAmountCents, locale),
  }
  const tr = t.rich as unknown as (key: string, values: Record<string, unknown>) => ReactNode
  const rich = (key: string) => tr(key, { ...v, ...tags })

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-8 text-[0.95rem] leading-relaxed">
      <Link href="/vitrail" className="muted text-sm underline">
        {t('retour')}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{t('titre')}</h1>
      <p className="muted mt-1 text-sm">{rich('sousTitre')}</p>
      <p className="mt-4">{rich('intro')}</p>

      <Section title={t('service.titre')}>
        <p>{rich('service.texte')}</p>
      </Section>

      <Section title={t('dons.titre')}>
        <Items>
          {(['paiement', 'frais', 'definitif', 'recus', 'taille'] as const).map(k => (
            <li key={k}>{rich(`dons.${k}`)}</li>
          ))}
        </Items>
      </Section>

      <Section title={t('contenu.titre')}>
        <Items>
          {(['facultatif', 'droits', 'interdit', 'moderation', 'citation'] as const).map(k => (
            <li key={k}>{rich(`contenu.${k}`)}</li>
          ))}
        </Items>
      </Section>

      {(['lien', 'usage', 'propriete', 'responsabilite', 'modifications', 'droit', 'contact'] as const).map(k => (
        <Section key={k} title={t(`${k}.titre`)}>
          <p>{rich(`${k}.texte`)}</p>
          {k === 'contact' && <p className="mt-2">{rich('contact.plateforme')}</p>}
        </Section>
      ))}
      <BrandFooter className="mt-10 text-center" />
    </main>
  )
}
