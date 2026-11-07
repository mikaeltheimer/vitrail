import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import type { Locale } from '@/i18n/config'
import { requestIdentity } from '@/lib/identity'
import { clampLocale, type LegalInfo } from '@/lib/identity-shared'
import BrandFooter from '@/components/BrandFooter'
import { Items, Section, legalTags } from '@/components/Legal'

// Politique de confidentialité (Loi 25, Québec). Les passages [À COMPLÉTER] sont les coordonnées que l'organisme n'a pas encore remplies (Mon vitrail) : à remplir par l'organisme
// avant la mise en ligne publique. Ce texte est un point de départ, pas un avis juridique : à faire revoir par un avocat.
// Textes : messages/fr.json et en.json, espace « confidentialite ».

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('confidentialite')
  return { title: t('metaTitre', { brand: CONFIG.brand.name }) }
}

const studioVars = {
  studioName: CONFIG.brand.studioLegal.name,
  neq: CONFIG.brand.studioLegal.neq,
  studioAddress: CONFIG.brand.studioLegal.address,
  studioEmail: CONFIG.brand.studioLegal.email,
}

export default async function ConfidentialitePage() {
  const t = await getTranslations('confidentialite')
  const tc = await getTranslations('commun')
  const { identity } = await requestIdentity()
  const locale = (identity ? clampLocale(identity.locales, (await getLocale()) as Locale) : await getLocale()) as Locale
  const org = { name: identity ? identity.texts[locale].name : CONFIG.brand.name }
  const legal: LegalInfo = identity?.legal ?? { entity: '', address: '', officerName: '', officerEmail: '', officerPhone: '', retention: '', updated: '' }
  const tags = legalTags(tc('aCompleter'), legal)
  const v = { org: org.name, brand: CONFIG.brand.name, studio: CONFIG.brand.studio, ...studioVars }
  const tr = t.rich as unknown as (key: string, values: Record<string, unknown>) => ReactNode
  const rich = (key: string) => tr(key, { ...v, ...tags })

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-8 text-[0.95rem] leading-relaxed">
      <Link href="/vitrail" className="muted text-sm underline">
        {t('retour')}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{t('titre')}</h1>
      <p className="muted mt-1 text-sm">{rich('sousTitre')}</p>

      <Section title={t('qui.titre')}>
        <p>{rich('qui.texte')}</p>
        <p className="mt-2">{rich('qui.plateforme')}</p>
      </Section>

      <Section title={t('responsable.titre')}>
        <p>
          {rich('responsable.nom')}
          <br />
          {rich('responsable.coordonnees')}
        </p>
        <p className="mt-2">{t('responsable.texte')}</p>
      </Section>

      <Section title={t('collecte.titre')}>
        <Items>
          {(['courriel', 'don', 'facultatif', 'consentement', 'paiement', 'langue', 'provenance'] as const).map(k => (
            <li key={k}>{rich(`collecte.${k}`)}</li>
          ))}
        </Items>
      </Section>

      <Section title={t('temoins.titre')}>
        <p>{t('temoins.texte')}</p>
      </Section>

      <Section title={t('acces.titre')}>
        <p>{t('acces.intro')}</p>
        <Items>
          {(['studio', 'stripe', 'supabase', 'vercel', 'resend'] as const).map(k => (
            <li key={k}>{rich(`acces.${k}`)}</li>
          ))}
        </Items>
        <p className="mt-2">{rich('acces.horsQuebec')}</p>
      </Section>

      <Section title={t('conservation.titre')}>
        <p>{rich('conservation.texte')}</p>
      </Section>

      <Section title={t('droits.titre')}>
        <p>{t('droits.intro')}</p>
        <Items>
          {(['modifier', 'acces', 'retrait'] as const).map(k => (
            <li key={k}>{t(`droits.${k}`)}</li>
          ))}
        </Items>
        <p className="mt-2">{t('droits.suite')}</p>
      </Section>

      <Section title={t('securite.titre')}>
        <p>{t('securite.texte')}</p>
      </Section>

      <Section title={t('recus.titre')}>
        <p>{rich('recus.texte')}</p>
      </Section>

      <Section title={t('modifications.titre')}>
        <p>{t('modifications.texte')}</p>
        <p className="mt-2">{rich('voirConditions')}</p>
      </Section>
      <BrandFooter className="mt-10 text-center" />
    </main>
  )
}
