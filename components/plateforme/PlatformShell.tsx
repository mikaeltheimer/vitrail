import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import LanguageSwitch from '@/components/LanguageSwitch'
import { CONFIG } from '@/lib/config'
import { Mark } from './Brand'

/** En-tête et pied de page des pages de la plateforme (vitrine, conditions, confidentialité). */
export default async function PlatformShell({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  const t = await getTranslations('plateforme')
  const studio = CONFIG.brand.studioLegal
  return (
    <div className="min-h-dvh text-[17px] leading-relaxed">
      <header className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link href="/plateforme" className="!text-[var(--text)] no-underline">
          <Mark />
        </Link>
        {nav && (
          <nav aria-label={t('nav.principale')} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
            <a href="/plateforme#comment" className="!text-[var(--text)] no-underline hover:underline">
              {t('nav.comment')}
            </a>
            <a href="/plateforme#tarifs" className="!text-[var(--text)] no-underline hover:underline">
              {t('nav.tarifs')}
            </a>
            <a href="/plateforme#questions" className="!text-[var(--text)] no-underline hover:underline">
              {t('nav.questions')}
            </a>
            <LanguageSwitch className="muted hover:underline" />
            <Link href="/connexion" className="!text-[var(--text)] no-underline hover:underline">
              {t('nav.connexion')}
            </Link>
            <a href="/plateforme#invitation" className="btn !w-auto !rounded-full !px-5 !py-2.5 !text-[15px] no-underline">
              {t('nav.demander')}
            </a>
          </nav>
        )}
      </header>
      {children}
      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="muted mx-auto flex max-w-[1160px] flex-wrap justify-between gap-4 px-6 py-8 text-sm">
          <span>{t('pied.projet', { brand: CONFIG.brand.name, studio: studio.name })}</span>
          <nav aria-label={t('pied.juridiques')} className="flex flex-wrap gap-5">
            <Link href="/plateforme/conditions" className="!text-[var(--muted)] hover:!text-[var(--text)]">
              {t('pied.conditions')}
            </Link>
            <Link href="/plateforme/confidentialite" className="!text-[var(--muted)] hover:!text-[var(--text)]">
              {t('pied.confidentialite')}
            </Link>
            <a href={`mailto:${studio.email}`} className="!text-[var(--muted)] hover:!text-[var(--text)]">
              {t('pied.ecrire')}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
