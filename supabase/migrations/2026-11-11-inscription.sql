-- Inscription des organismes sur invitation, demandes d'invitation, vitrail d'entraînement.
--
-- - Un organisme réel a, dès l'inscription, un organisme d'ENTRAÎNEMENT caché (practice_of = l'organisme réel) : mêmes
--   nom et réglages, dons fictifs seulement (jamais Stripe), adresse <identifiant>--essai. C'est un organisme à part pour
--   que ses donateurs fictifs ne touchent jamais les vrais profils (un donateur appartient à un organisme). Les membres de
--   l'organisme réel y ont accès ; il n'a pas de membres à lui.
-- - Un organisme réel naît en brouillon : dons fermés (« ouvrira bientôt ») jusqu'à « Mettre en ligne » (compte Stripe prêt).
-- - Conditions d'utilisation : version, date et compte qui les a acceptées au nom de l'organisme.
-- - Demandes d'invitation (formulaire de la vitrine) et invitations à CRÉER un organisme (organization_id vide).
-- - Code de confirmation quand la personne invitée s'inscrit avec une autre adresse que celle de l'invitation.
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-10-liste-envoi.sql. D'abord sur donivers-test.

alter table public.organizations
  add column practice_of        uuid unique references public.organizations (id) on delete cascade,
  add column terms_version      text,
  add column terms_accepted_at  timestamptz,
  add column terms_accepted_by  uuid references public.accounts (id) on delete set null,
  add column went_live_at       timestamptz;

-- Identifiants réservés aux pages de la plateforme ; « -- » est réservé aux organismes d'entraînement (vérifié par le code)
alter table public.organization_slugs add constraint organization_slugs_platform_reserved
  check (slug <> all (array['studio', 'plateforme', 'inscription', 'entrainement', 'essai', 'www2']::text[]));

alter table public.invitations
  add column org_name  text check (length(org_name) <= 120),
  add column message   text check (length(message) <= 1000),
  add column locale    text not null default 'fr' check (locale in ('fr', 'en'));

create table public.access_requests (
  id             uuid primary key default gen_random_uuid(),
  org_name       text not null check (length(org_name) between 2 and 120),
  name           text not null check (length(name) between 2 and 80),
  email          text not null check (email = lower(email) and position('@' in email) > 1),
  message        text check (length(message) <= 1000),
  locale         text not null default 'fr' check (locale in ('fr', 'en')),
  created_at     timestamptz not null default now(),
  handled_at     timestamptz,
  outcome        text check (outcome in ('invited', 'archived')),
  invitation_id  uuid references public.invitations (id) on delete set null
);
create index access_requests_open_idx on public.access_requests (created_at desc) where handled_at is null;

create table public.signup_codes (
  id             uuid primary key default gen_random_uuid(),
  invitation_id  uuid not null references public.invitations (id) on delete cascade,
  email          text not null check (email = lower(email)),
  code_hash      text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  attempts       int not null default 0,
  verified_at    timestamptz
);
create index signup_codes_invitation_idx on public.signup_codes (invitation_id, created_at desc);

alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('receipt', 'magic_link', 'reminder', 'moderation', 'invitation', 'password_reset', 'signup_code', 'access_request'));

alter table public.access_requests enable row level security;
alter table public.signup_codes    enable row level security;
revoke all on public.access_requests, public.signup_codes from anon, authenticated;

-- Chaque organisme réel existant reçoit son organisme d'entraînement (mêmes textes, thème et logo ; brouillon ; jamais Stripe)
do $$
declare
  o record;
  p uuid;
begin
  for o in
    select org.id, org.name_fr, org.texts, org.theme, org.legal, org.logo_path, org.locales, org.photo_moderation, s.slug
    from public.organizations org
    join public.organization_slugs s on s.organization_id = org.id and s.is_current
    where org.practice_of is null
      and not exists (select 1 from public.organizations x where x.practice_of = org.id)
  loop
    if length(o.slug) + 7 > 40 then
      raise notice 'Identifiant trop long pour son entraînement : %', o.slug;
      continue;
    end if;
    insert into public.organizations (name_fr, status, texts, theme, legal, logo_path, locales, photo_moderation, practice_of)
    values (o.name_fr, 'draft', o.texts, o.theme, o.legal, o.logo_path, o.locales, o.photo_moderation, o.id)
    returning id into p;
    insert into public.organization_slugs (slug, organization_id, is_current) values (o.slug || '--essai', p, true);
    insert into public.vitraux (organization_id, kind, name) values (p, 'permanent', o.name_fr);
  end loop;
end $$;
