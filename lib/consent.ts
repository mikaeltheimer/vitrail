import { getDb } from './db'
import type { Locale } from '@/i18n/config'

// Liste d'envoi de l'organisme (voir supabase/migrations/2026-11-10-liste-envoi.sql).
// À CHAQUE changement du texte de la case (messages/*.json : claim.listeEnvoi, gerer.listeEnvoi), changer la version : c'est la
// preuve de ce que le donateur a accepté. Texte provisoire tant que l'avocat ne l'a pas validé.
export const MAILING_CONSENT_VERSION = '2026-11-06-provisoire'

/** Le donateur accepte (case cochée au don, ou depuis son lien personnel). Jamais bloquant pour le don. */
export async function grantMailingConsent(donorId: string, locale: Locale): Promise<void> {
  const { error } = await getDb()
    .from('donors')
    .update({ mailing_consent_at: new Date().toISOString(), mailing_consent_version: MAILING_CONSENT_VERSION, mailing_consent_locale: locale, mailing_withdrawn_at: null })
    .eq('id', donorId)
  if (error) console.error('Consentement à la liste d’envoi non enregistré :', error.message)
}

/** Le donateur se retire de la liste. La date du consentement reste (preuve de l'historique), le retrait la neutralise. */
export async function withdrawMailingConsent(donorId: string): Promise<void> {
  const { error } = await getDb().from('donors').update({ mailing_withdrawn_at: new Date().toISOString() }).eq('id', donorId)
  if (error) throw error
}

export const isSubscribed = (d: { mailing_consent_at?: unknown; mailing_withdrawn_at?: unknown }): boolean => !!d.mailing_consent_at && !d.mailing_withdrawn_at
