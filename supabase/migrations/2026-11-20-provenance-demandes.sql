-- Provenance des demandes d'invitation : le vitrail dont la signature « propulsé par » a mené à la vitrine (?ref=).
-- Ajout seulement (aucune suppression). Même forme que cleanChannel (lib/validate.ts). Sans danger si on la relance.
alter table public.access_requests
  add column if not exists source text
  constraint access_requests_source_check check (source ~ '^[a-z0-9][a-z0-9-]{0,39}$');
