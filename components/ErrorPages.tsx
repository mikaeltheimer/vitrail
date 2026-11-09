'use client'

import { useTranslations } from 'next-intl'
import AuthFrame from '@/components/AuthFrame'
import { CONFIG } from '@/lib/config'

// Pages d'erreur (404, vitrail introuvable, erreur de rendu) : le cadre des écrans d'accès, avec le logo de l'organisme
// sur son adresse et la marque de la plateforme ailleurs ; le retour et la langue en pied (AuthFrame).

export function NotFoundPage() {
  const t = useTranslations('erreurPage')
  return (
    <AuthFrame>
      <h1 className="text-xl font-semibold">{t('introuvableTitre')}</h1>
      <p className="muted mt-2 text-sm">{t('introuvableTexte')}</p>
    </AuthFrame>
  )
}

/** Adresse d'organisme qui ne mène à aucun organisme : un QR mal recopié, un identifiant inventé. */
export function OrgMissingPage({ platformHref }: { platformHref: string }) {
  const t = useTranslations('erreurPage')
  return (
    <AuthFrame back={{ href: platformHref, label: t('decouvrir', { brand: CONFIG.brand.name }) }}>
      <h1 className="text-xl font-semibold">{t('vitrailIntrouvableTitre')}</h1>
      <p className="muted mt-2 text-sm">{t('vitrailIntrouvableTexte')}</p>
    </AuthFrame>
  )
}

export function ErrorPage({ digest, reset }: { digest?: string; reset: () => void }) {
  const t = useTranslations('erreurPage')
  return (
    <AuthFrame>
      <h1 className="text-xl font-semibold">{t('erreurTitre')}</h1>
      <p className="muted mt-2 text-sm">{t('erreurTexte')}</p>
      <button className="btn mt-5" onClick={reset}>
        {t('reessayer')}
      </button>
      {digest && <p className="muted mt-4 text-xs">{t('code', { digest })}</p>}
    </AuthFrame>
  )
}
