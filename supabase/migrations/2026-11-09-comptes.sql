-- Comptes des administrateurs : une personne (courriel + mot de passe) membre d'un ou plusieurs organismes.
-- Remplace le code d'accès commun (ADMIN_CODE) et la table org_members, prévue pour Supabase Auth et jamais utilisée.
--
--   accounts ── memberships ── organizations   (rôle : owner = propriétaire, volunteer = bénévole)
--      ├─ sessions          (jeton de session : seule son empreinte SHA-256 est gardée ; révocable)
--      ├─ password_resets   (lien « mot de passe oublié », 1 h, usage unique ; empreinte seulement)
--      └─ invitations       (lien d'invitation, 7 jours ; organization_id vide = inviter à CRÉER un organisme)
--   login_failures          (échecs de connexion récents, pour freiner les essais en série sur un courriel)
--
-- Aucun jeton ni mot de passe en clair : les mots de passe sont des empreintes scrypt, les jetons des empreintes SHA-256.
-- Studio Existence n'a AUCUN accès aux consoles par défaut (is_studio ne sert qu'à la page de gestion des organismes) :
-- un organisme qui veut de l'aide invite Studio comme membre, puis le retire.
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-08-litiges.sql. D'abord sur donivers-test.

do $$
begin
  if exists (select 1 from public.org_members) then
    raise exception 'org_members contient des lignes : à migrer à la main avant de la supprimer';
  end if;
end $$;
drop table public.org_members;

create table public.accounts (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique check (email = lower(email) and position('@' in email) > 1),
  name                 text not null default '' check (length(name) <= 80),
  password_hash        text,                       -- null : compte pas encore activé
  is_studio            boolean not null default false,
  created_at           timestamptz not null default now(),
  password_changed_at  timestamptz,
  last_login_at        timestamptz
);

create table public.memberships (
  account_id       uuid not null references public.accounts (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  role             text not null check (role in ('owner', 'volunteer')),
  created_at       timestamptz not null default now(),
  primary key (account_id, organization_id)
);
create index memberships_org_idx on public.memberships (organization_id);

create table public.sessions (
  token_hash    text primary key,
  account_id    uuid not null references public.accounts (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  user_agent    text
);
create index sessions_account_idx on public.sessions (account_id);

create table public.password_resets (
  token_hash  text primary key,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  email            text not null check (email = lower(email) and position('@' in email) > 1),
  organization_id  uuid references public.organizations (id) on delete cascade,
  role             text not null check (role in ('owner', 'volunteer')),
  token_hash       text not null unique,
  invited_by       uuid references public.accounts (id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  revoked_at       timestamptz
);
create index invitations_email_idx on public.invitations (email) where accepted_at is null and revoked_at is null;

create table public.login_failures (
  id          bigserial primary key,
  email       text not null,
  created_at  timestamptz not null default now()
);
create index login_failures_email_idx on public.login_failures (email, created_at);

-- Le journal des courriels accueille les courriels des comptes
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('receipt', 'magic_link', 'reminder', 'moderation', 'invitation', 'password_reset'));

alter table public.accounts         enable row level security;
alter table public.memberships      enable row level security;
alter table public.sessions         enable row level security;
alter table public.password_resets  enable row level security;
alter table public.invitations      enable row level security;
alter table public.login_failures   enable row level security;
revoke all on public.accounts, public.memberships, public.sessions, public.password_resets, public.invitations, public.login_failures from anon, authenticated;
revoke all on sequence public.login_failures_id_seq from anon, authenticated;
