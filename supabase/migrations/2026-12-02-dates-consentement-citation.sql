-- Consentement à la citation du témoignage (Mika, 18 nov. 2026) : comme pour la liste d'envoi (mailing_consent_at,
-- mailing_withdrawn_at), on garde la date du dernier consentement et celle du retrait. La date du don ne suffit pas : le
-- témoignage et la case peuvent changer plus tard (« Mon fragment »). Les consentements donnés avant cette migration
-- restent sans date (null). Ajoute seulement : compatible avec le code précédent, se relance sans danger.
alter table public.donors add column if not exists quote_consent_at timestamp with time zone;
alter table public.donors add column if not exists quote_withdrawn_at timestamp with time zone;
