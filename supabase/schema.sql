-- Vitrail de dons — École d'art de Sutton
-- À lancer une fois dans Supabase › SQL Editor, sur un projet NEUF (distinct de celui de Pay to Exist).
-- Personne n'accède à ces tables depuis le navigateur : seul le serveur (clé de service) les lit et les écrit.

create extension if not exists pgcrypto;

-- ── Événements ────────────────────────────────────────────────────────────
-- Un seul vitrail cumulatif ; chaque don est rattaché à un événement (total et objectif par événement).
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_on   date,
  goal_cents  integer not null default 0 check (goal_cents >= 0),
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Au plus un événement « en cours »
create unique index if not exists events_one_current on public.events (is_current) where is_current;

-- ── Donateurs : un morceau de vitrail par courriel ────────────────────────
create table if not exists public.donors (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(email)),
  display_name  text not null default 'Anonyme',
  show_name     boolean not null default false,   -- consentement à l'affichage public du nom
  message       text,
  color         text not null,
  hidden        boolean not null default false,   -- masqué en direct par l'admin
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists donors_email_key on public.donors (email);

-- ── Dons ──────────────────────────────────────────────────────────────────
-- Prévoir les reçus fiscaux plus tard : l'adresse et le numéro de reçu s'ajouteront ici ou sur donors.
create table if not exists public.donations (
  id            uuid primary key default gen_random_uuid(),
  donor_id      uuid not null references public.donors(id) on delete restrict,
  event_id      uuid references public.events(id) on delete set null,
  amount_cents  integer not null check (amount_cents > 0),
  source        text not null check (source in ('stripe', 'cash', 'seed', 'demo')),
  -- Identifiant côté fournisseur (session Stripe, plus tard Square…). Unique : un rappel du webhook ne double rien.
  provider_ref  text unique,
  created_at    timestamptz not null default now()
);
create index if not exists donations_donor_idx on public.donations (donor_id);
create index if not exists donations_event_idx on public.donations (event_id);
create index if not exists donations_created_idx on public.donations (created_at desc);

-- ── Liens magiques (modifier son nom ou son message sans compte) ──────────
-- On ne garde que l'empreinte du jeton, jamais le jeton lui-même.
create table if not exists public.edit_tokens (
  token_hash  text primary key,
  donor_id    uuid not null references public.donors(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ── Totaux (vues calculées côté base, pour ne pas dépendre de la limite de 1000 lignes) ──
create or replace view public.donor_totals with (security_invoker = true) as
  select d.id as donor_id, coalesce(sum(n.amount_cents), 0)::bigint as total_cents, max(n.created_at) as last_donation_at
  from public.donors d
  left join public.donations n on n.donor_id = d.id
  group by d.id;

create or replace view public.event_totals with (security_invoker = true) as
  select e.id as event_id, coalesce(sum(n.amount_cents), 0)::bigint as total_cents, count(n.id)::bigint as donations_count
  from public.events e
  left join public.donations n on n.event_id = e.id
  group by e.id;

create or replace view public.grand_total with (security_invoker = true) as
  select coalesce(sum(amount_cents), 0)::bigint as total_cents, count(*)::bigint as donations_count
  from public.donations;

-- ── Accès : serveur seulement ─────────────────────────────────────────────
alter table public.events      enable row level security;
alter table public.donors      enable row level security;
alter table public.donations   enable row level security;
alter table public.edit_tokens enable row level security;

revoke all on public.events, public.donors, public.donations, public.edit_tokens from anon, authenticated;
revoke all on public.donor_totals, public.event_totals, public.grand_total from anon, authenticated;
