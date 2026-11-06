import { getDb } from './db'
import { isLocale } from '@/i18n/config'
import { sendModeration, type ModerationEvent } from './email'
import { hasLocaleColumn } from './schema'
import { getOrg, orgBaseUrl } from './tenant'

// Avis au donateur quand l'équipe publie ou retire son témoignage ou sa photo (console d'administration).
// Jamais bloquant : appelé après la réponse, et sendEmail ne lève pas d'erreur.
// Pas d'avis pour un donateur sans vraie adresse (dons comptants, d'amorçage ou de démonstration : *@donateur.invalid).

const NO_ADDRESS = /@donateur\.invalid$/i

export async function notifyModeration(donorId: string, event: ModerationEvent): Promise<boolean> {
  try {
    const db = getDb()
    const withLocale = await hasLocaleColumn()
    const cols: string = `email,organization_id${withLocale ? ',locale' : ''}`
    const { data } = await db.from('donors').select(cols).eq('id', donorId).maybeSingle()
    const donor = data as unknown as { email?: string; organization_id?: string; locale?: string } | null
    if (!donor?.email || NO_ADDRESS.test(donor.email)) return false
    const org = donor.organization_id ? await getOrg(donor.organization_id) : null
    return await sendModeration({ to: donor.email, event, locale: isLocale(donor.locale) ? donor.locale : 'fr', donorId, organizationId: donor.organization_id, baseUrl: orgBaseUrl(org?.slug) })
  } catch (e) {
    console.error("Avis de modération non envoyé :", e)
    return false
  }
}
