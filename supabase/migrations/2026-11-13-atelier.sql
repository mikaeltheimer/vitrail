-- L'atelier : brouillon de l'identité (langues, textes, logo, icône), modifié dans le vitrail d'entraînement et publié
-- d'un geste sur le vrai vitrail (voir lib/atelier.ts).
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-12-identite.sql. D'abord sur donivers-test.

alter table public.organizations
  add column draft             jsonb,
  add column draft_updated_at  timestamptz,
  add column published_at      timestamptz;

-- Un organisme dont l'identité est déjà rédigée (l'École) est considéré comme publié
update public.organizations set published_at = now() where practice_of is null and texts <> '{}'::jsonb;
