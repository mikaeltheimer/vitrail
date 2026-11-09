'use client'

import { useTranslations } from 'next-intl'
import LanguageSwitch from '@/components/LanguageSwitch'
import { OrgLogo } from '@/components/OrgBrand'
import { useIdentityContext } from '@/components/OrgIdentity'
import { Mark } from '@/components/plateforme/Brand'

/**
 * Cadre des écrans d'accès (connexion, mot de passe, invitation, pas d'accès) : une carte centrée, avec en tête la
 * marque de la plateforme, ou le logo de l'organisme sur son adresse ; en pied, le retour et la langue.
 */
export default function AuthFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations('acces')
  const { identity } = useIdentityContext()
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">{identity ? <OrgLogo style={{ maxWidth: 220, maxHeight: 72, width: 'auto' }} /> : <Mark size={24} />}</div>
        <div className="card !rounded-[20px] !p-7">{children}</div>
        <p className="muted mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          <a href={identity ? '/vitrail' : '/plateforme'} className="!text-[var(--muted)] hover:!text-[var(--text)]">
            {identity ? t('retourVitrail') : t('retourAccueil')}
          </a>
          <LanguageSwitch className="hover:underline" />
        </p>
      </div>
    </main>
  )
}
