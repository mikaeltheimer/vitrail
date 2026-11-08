import { useLocale } from 'next-intl'
import { brandFor, CONFIG, type BrandTexts } from './config'
import { useIdentityContext } from '@/components/OrgIdentity'
import { clampLocale, type Identity, type OrgTexts } from './identity-shared'
import type { Locale } from '@/i18n/config'

// Identité de l'organisme dans la langue de la page (composants client). Elle vient de la base, par le gabarit racine.
// Dans le code serveur : requestIdentity() ou getIdentity(org) (lib/identity.ts).

const EMPTY: OrgTexts = {
  name: CONFIG.brand.name,
  url: '',
  about: '',
  why: '',
  vitrailTitle: '',
  testimonial: { question: '', cta: '', placeholder: '', lead: '', consent: '' },
}

export function useOrg(): OrgTexts {
  const locale = useLocale() as Locale
  const { identity } = useIdentityContext()
  return identity ? identity.texts[clampLocale(identity.locales, locale)] ?? identity.texts[identity.locales[0]] : EMPTY
}

/** Logo, icône, coordonnées juridiques et langues de l'organisme de la page ; null hors organisme. */
export function useIdentity(): Identity | null {
  return useIdentityContext().identity
}

export function useBrand(): BrandTexts {
  return brandFor(useLocale() as Locale)
}
