-- Liste d'envoi de l'organisme : consentement EXPRÈS du donateur à recevoir ses nouvelles (loi canadienne anti-pourriel).
-- La case n'est jamais cochée d'avance. On garde la preuve : date, version du texte affiché, langue. Le retrait se fait depuis
-- le lien personnel du donateur, à tout moment ; un nouveau don avec la case cochée vaut un nouveau consentement.
-- Donivers n'envoie rien : l'organisme exporte la liste et utilise son propre outil, avec un lien de désabonnement.
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-09-comptes.sql. D'abord sur donivers-test.

alter table public.donors
  add column mailing_consent_at       timestamptz,
  add column mailing_consent_version  text,
  add column mailing_consent_locale   text check (mailing_consent_locale in ('fr', 'en')),
  add column mailing_withdrawn_at     timestamptz;
