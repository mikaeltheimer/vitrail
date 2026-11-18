// Témoignages reçus (console › Modération, export CSV) : tous les témoignages affichés sur le vitrail, et ceux que
// l'organisme peut citer dans ses communications (Mika, 18 nov. 2026). Partagé par le navigateur et le serveur.
//
// Affiché = un texte, approuvé (ou publié tout de suite), donateur ni masqué ni effacé. Citable = affiché et la case de
// consentement cochée. Le consentement couvre le TEXTE, signé comme le donateur l'a choisi (son nom affiché, sinon
// anonyme) : pas la photo, pas le courriel.

export interface TestimonialDonor {
  id: string
  display_name?: string | null
  show_name?: boolean | null
  message?: string | null
  message_status?: string | null
  message_question?: string | null
  quote_consent?: boolean | null
  quote_consent_at?: string | null
  photo_url?: string | null
  photo_status?: string | null
  hidden?: boolean | null
  erased_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export const isShownTestimonial = (d: TestimonialDonor): boolean => !!d.message?.trim() && (d.message_status ?? 'approved') === 'approved' && !d.hidden && !d.erased_at

export const isQuotable = (d: TestimonialDonor): boolean => isShownTestimonial(d) && d.quote_consent === true

/** Le nom à mettre sous une citation : le nom affiché, sinon null (anonyme). */
export const signatureOf = (d: TestimonialDonor): string | null => (d.show_name && d.display_name?.trim() ? d.display_name.trim() : null)

/** Les témoignages affichés, du plus récent au plus ancien (date de la dernière modification du morceau). */
export function shownTestimonials<T extends TestimonialDonor>(donors: T[]): T[] {
  const at = (d: T) => d.updated_at ?? d.created_at ?? ''
  return donors.filter(isShownTestimonial).sort((a, b) => at(b).localeCompare(at(a)))
}
