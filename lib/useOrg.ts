import { useLocale } from 'next-intl'
import { brandFor, orgFor, type BrandTexts, type OrgTexts } from './config'
import type { Locale } from '@/i18n/config'

// Textes de l'organisme et de la marque dans la langue de la page (composants serveur non asynchrones et composants client).
// Dans le code asynchrone (métadonnées, routes) : orgFor(await getLocale()) ou orgFor(localeOf(request)).

export function useOrg(): OrgTexts {
  return orgFor(useLocale() as Locale)
}

export function useBrand(): BrandTexts {
  return brandFor(useLocale() as Locale)
}
