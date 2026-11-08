import { getDb } from './db'
import { ANON_LABEL } from './config'
import { removePhotoFile } from './photos'

// Suppression des renseignements d'un donateur (droit à l'effacement, Loi 25 ; promis par la page de confidentialité).
// Voir supabase/migrations/2026-11-14-suppression-donateur.sql.
//
// Ce qui part : courriel, nom, témoignage, photo (et son fichier), consentement à la liste d'envoi, liens personnels,
// signalements, journal des courriels. Ce qui reste : ses DONS (montant, date, référence Stripe), que l'organisme doit
// garder pour sa comptabilité, ses remboursements et la commission ; ils ne sont plus rattachés qu'à une fiche vide.
// Le morceau reste sur le vitrail, anonyme (l'argent a bien été reçu).
//
// Idempotent : on peut relancer sur une fiche déjà supprimée (reprise après une erreur à mi-chemin).

/** Domaine réservé (RFC 2606) : une adresse en « .invalid » ne peut recevoir aucun courriel. */
export const ERASED_EMAIL_DOMAIN = 'supprime.invalid'

/** Adresse de remplacement, unique par donateur (la contrainte organisme + courriel tient toujours). */
export const erasedEmail = (donorId: string): string => `${donorId}@${ERASED_EMAIL_DOMAIN}`

/** Vrai si l'adresse est celle d'une fiche supprimée : aucun courriel n'y part, aucun journal n'est écrit. */
export const isErasedEmail = (email: string | null | undefined): boolean =>
  !!email && email.trim().toLowerCase().endsWith(`@${ERASED_EMAIL_DOMAIN}`)

export type EraseResult = { ok: true } | { ok: false; status: 404 | 500; error: string }

export async function eraseDonor(orgId: string, donorId: string): Promise<EraseResult> {
  const db = getDb()
  const { data: before, error: readError } = await db
    .from('donors')
    .select('id,email,photo_url')
    .eq('id', donorId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (readError) return { ok: false, status: 500, error: readError.message }
  if (!before) return { ok: false, status: 404, error: 'not_found' }
  // Copiés AVANT la mise à jour : ce sont les valeurs à effacer ailleurs (journal, fichier)
  const oldEmail = String((before as { email: string }).email)
  const oldPhotoUrl = (before as { photo_url: string | null }).photo_url

  // 1. La fiche d'abord : dès cette ligne, plus rien ne peut écrire à cette personne ni la retrouver par son courriel.
  const now = new Date().toISOString()
  const { error: updateError } = await db
    .from('donors')
    .update({
      email: erasedEmail(donorId),
      display_name: ANON_LABEL,
      show_name: false,
      message: null,
      message_status: 'approved',
      quote_consent: false,
      photo_url: null,
      photo_status: 'approved',
      locale: 'fr',
      mailing_consent_at: null,
      mailing_consent_version: null,
      mailing_consent_locale: null,
      mailing_withdrawn_at: null,
      erased_at: now,
      updated_at: now,
    })
    .eq('id', donorId)
    .eq('organization_id', orgId)
  if (updateError) return { ok: false, status: 500, error: updateError.message }

  // 2. Ce qui pointe encore vers la personne. Le journal est aussi effacé par adresse : un reçu a pu être consigné avant
  //    que la fiche existe. Toujours borné à l'organisme (l'adresse peut exister ailleurs, chez un autre organisme).
  //    Une étape à la fois : à la première erreur on s'arrête, et la console peut relancer.
  const steps = [
    () => db.from('edit_tokens').delete().eq('donor_id', donorId),
    () => db.from('reports').delete().eq('donor_id', donorId).eq('organization_id', orgId),
    () => db.from('email_log').delete().eq('donor_id', donorId).eq('organization_id', orgId),
    ...(isErasedEmail(oldEmail) ? [] : [() => db.from('email_log').delete().eq('to_email', oldEmail).eq('organization_id', orgId)]),
  ]
  for (const step of steps) {
    const { error } = await step()
    if (error) return { ok: false, status: 500, error: error.message }
  }

  // 3. Le fichier de la photo, en dernier (sans gravité s'il échoue : plus rien n'y renvoie)
  await removePhotoFile(oldPhotoUrl, orgId)
  return { ok: true }
}
