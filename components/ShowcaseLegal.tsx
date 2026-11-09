import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import BrandFooter from '@/components/BrandFooter'

// Pages /confidentialite et /conditions du vitrail de démonstration : l'organisme est fictif et la page ne recueille rien.
// On ne fabrique pas de coordonnées juridiques (raison sociale, NEQ) pour un organisme qui n'existe pas.
export default async function ShowcaseLegal({ org }: { org: string }) {
  const t = await getTranslations('demoJuridique')
  const tc = await getTranslations('confidentialite')
  const email = CONFIG.brand.studioLegal.email
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-8 text-[0.95rem] leading-relaxed">
      <Link href="/vitrail" className="muted text-sm underline">
        {tc('retour')}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{t('titre')}</h1>
      <p className="mt-4">{t('texte', { org, brand: CONFIG.brand.name })}</p>
      <p className="mt-4">
        {t.rich('contact', {
          brand: CONFIG.brand.name,
          studio: CONFIG.brand.studio,
          email,
          courriel: c => (
            <a className="underline" href={`mailto:${email}`}>
              {c}
            </a>
          ),
        })}
      </p>
      <BrandFooter className="mt-12" />
    </main>
  )
}
