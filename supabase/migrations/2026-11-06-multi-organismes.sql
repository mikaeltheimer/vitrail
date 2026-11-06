-- Multi-organismes (étape 3), phase « élargir ».
--
-- Purement additive : le code actuel (un seul organisme) continue de fonctionner pendant la bascule, parce que les
-- nouvelles colonnes ont pour DEFAULT l'École d'art de Sutton et son vitrail permanent. Ces DEFAULT sont retirés à la
-- phase « resserrer » (après le déploiement du nouveau code), avec la table `events` et le réglage global `settings`.
--
-- À exécuter UNE seule fois par base (une seconde exécution échoue, volontairement, et annule tout).
-- Toujours répéter d'abord sur donivers-test, jamais directement en production.
--
-- Modèle :
--   organizations ─┬─ organization_slugs  (sous-domaines ; un ancien identifiant reste réservé et redirige)
--                  ├─ org_members         (équipe : propriétaire, bénévole)
--                  ├─ vitraux             (un permanent + des campagnes : active ou close)
--                  └─ donors ── donations (chaque don appartient à UN vitrail, celui où il a été fait, pour toujours)
--
-- Affichage : un vitrail de campagne montre ses propres dons. Le vitrail permanent montre TOUS les dons de l'organisme,
-- sauf ceux des campagnes privées (in_main = false), qui n'y apparaissent ni ne s'y comptent jamais. La pièce d'un donateur
-- dans un vitrail est la somme de ses dons affichés dans ce vitrail. Pas de fusion : rien à décider en fin de campagne.
--
-- L'isolation entre organismes est garantie par la base elle-même : clés étrangères composées (id, organization_id).

-- ── Organismes ──────────────────────────────────────────────────────────────
create table public.organizations (
  id                uuid primary key default gen_random_uuid(),
  -- draft : mode démo permis, non indexé ; live : en ligne ; suspended : désactivé par Studio Existence
  status            text not null default 'draft' check (status in ('draft', 'live', 'suspended')),
  name_fr           text not null,
  website_url       text,
  -- Textes éditables par l'organisme, par langue : { "fr": {...}, "en": {...} } (anglais facultatif, repli sur le français)
  texts             jsonb not null default '{}'::jsonb,
  -- Accent et cinq verres : { "accent": "#...", "glasses": [...] }
  theme             jsonb not null default '{}'::jsonb,
  -- Coordonnées juridiques (CONFIG.legal) : entity, address, officerName, officerEmail, officerPhone, updated, retention…
  legal             jsonb not null default '{}'::jsonb,
  logo_path         text,
  locales           text[] not null default array['fr']::text[]
                      check (locales <@ array['fr', 'en']::text[] and 'fr' = any (locales)),
  photo_moderation  text not null default 'live' check (photo_moderation in ('live', 'moderation')),
  -- Nom affiché de l'expéditeur des courriels et adresse de réponse (l'adresse technique d'envoi reste celle de la plateforme)
  sender_name       text,
  reply_to          text,
  stripe_account_id text unique,
  stripe_ready      boolean not null default false,
  created_at        timestamptz not null default now()
);

create table public.organization_slugs (
  slug             text primary key
                     check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
                     check (slug <> all (array['www', 'admin', 'api', 'app', 'mail', 'smtp', 'ftp', 'static', 'assets', 'cdn',
                                               'status', 'help', 'support', 'docs', 'blog', 'dashboard', 'login', 'auth',
                                               'console', 'donivers', 'demo', 'test', 'staging', 'preview', 'dev']::text[])),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  is_current       boolean not null default true,
  created_at       timestamptz not null default now()
);
-- Un seul identifiant courant par organisme ; les anciens restent réservés et servent aux redirections permanentes.
create unique index organization_slugs_one_current on public.organization_slugs (organization_id) where is_current;

create table public.org_members (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('owner', 'volunteer')),
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ── Vitraux ─────────────────────────────────────────────────────────────────
create table public.vitraux (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  kind             text not null check (kind in ('permanent', 'campaign')),
  -- Adresse d'une campagne (…/<slug>) ; le permanent n'en a pas. Un identifiant de campagne n'est jamais réutilisé.
  slug             text check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  name             text not null,
  -- Une campagne close reste en ligne (remerciement, total) mais n'accepte plus de dons.
  state            text not null default 'active' check (state in ('active', 'closed')),
  -- false = campagne PRIVÉE : jamais affichée ni comptée dans le vitrail permanent. Fixé avant le premier don
  -- (le consentement des donateurs en dépend) ; pas d'interface à ce sujet au lancement.
  in_main          boolean not null default true,
  -- 0 = pas d'objectif
  goal_cents       integer not null default 0 check (goal_cents >= 0),
  starts_on        date,
  ends_on          date,
  -- Surcharges des textes de l'organisme pour ce vitrail, par langue
  texts            jsonb not null default '{}'::jsonb,
  -- Montants suggérés, messages sur l'écran, frais couverts… (copiés du permanent à la création d'une campagne)
  settings         jsonb not null default '{}'::jsonb,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (id, organization_id),
  check ((kind = 'permanent') = (slug is null)),
  -- Le permanent ne se clôt pas et compte évidemment ses propres dons : seules les campagnes ont un cycle de vie
  check (kind = 'campaign' or (state = 'active' and in_main))
);
create unique index vitraux_one_permanent on public.vitraux (organization_id) where kind = 'permanent';
create unique index vitraux_slug_per_org on public.vitraux (organization_id, slug) where slug is not null;

create function public.vitraux_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id or new.kind <> old.kind then
    raise exception 'L''organisme et le type d''un vitrail ne changent jamais';
  end if;
  if new.in_main <> old.in_main and exists (select 1 from public.donations d where d.vitrail_id = old.id) then
    raise exception 'Une campagne qui a reçu des dons ne change plus de visibilité (privée ou non)';
  end if;
  return new;
end $$;
create trigger vitraux_guard before update on public.vitraux
  for each row execute function public.vitraux_guard();

-- ── Colonnes d'organisme sur les tables existantes (d'abord nullables, remplies plus bas) ──────────────
alter table public.donors    add column organization_id uuid references public.organizations (id) on delete restrict;
alter table public.donations add column organization_id uuid references public.organizations (id) on delete restrict,
                             -- Le vitrail où le don a été fait : il ne change jamais (rapports, consentement du donateur).
                             add column vitrail_id uuid,
                             -- Remboursement (total ou partiel) : le don net = amount_cents - refunded_cents ; à 0, le morceau disparaît.
                             add column refunded_cents integer not null default 0 check (refunded_cents >= 0),
                             add constraint donations_refund_le_amount check (refunded_cents <= amount_cents);
alter table public.visits    add column organization_id uuid references public.organizations (id) on delete restrict,
                             add column vitrail_id uuid;
alter table public.reports   add column organization_id uuid references public.organizations (id) on delete restrict;
alter table public.email_log add column organization_id uuid references public.organizations (id) on delete restrict;

-- ── L'École d'art de Sutton et son vitrail permanent, puis remplissage de l'existant ──────────────────
do $$
declare
  org uuid;
  perm uuid;
  moderation text;
begin
  insert into public.organizations (status, name_fr, website_url)
    values ('live', 'École d''art de Sutton', 'https://ecoleartsutton.ca/')
    returning id into org;
  insert into public.organization_slugs (slug, organization_id) values ('ecoleartsutton', org);
  insert into public.vitraux (organization_id, kind, name)
    values (org, 'permanent', 'Le vitrail de la communauté')
    returning id into perm;

  -- Le réglage global de modération devient celui de l'organisme
  select value into moderation from public.settings where key = 'photo_moderation';
  update public.organizations set photo_moderation = case when moderation = 'moderation' then 'moderation' else 'live' end where id = org;

  update public.donors    set organization_id = org where organization_id is null;
  update public.donations set organization_id = org, vitrail_id = perm where organization_id is null;
  update public.visits    set organization_id = org, vitrail_id = perm where organization_id is null;
  update public.reports   set organization_id = org where organization_id is null;
  update public.email_log set organization_id = org where organization_id is null;

  -- Transition : le code actuel n'écrit pas ces colonnes, la base les remplit par défaut (retiré à la phase « resserrer »)
  execute format('alter table public.donors    alter column organization_id set default %L', org);
  execute format('alter table public.donations alter column organization_id set default %L', org);
  execute format('alter table public.donations alter column vitrail_id set default %L', perm);
  execute format('alter table public.visits    alter column organization_id set default %L', org);
  execute format('alter table public.visits    alter column vitrail_id set default %L', perm);
  execute format('alter table public.reports   alter column organization_id set default %L', org);
  execute format('alter table public.email_log alter column organization_id set default %L', org);
end $$;

alter table public.donors    alter column organization_id set not null;
alter table public.donations alter column organization_id set not null,
                             alter column vitrail_id set not null;
alter table public.visits    alter column organization_id set not null,
                             alter column vitrail_id set not null;
alter table public.reports   alter column organization_id set not null;
alter table public.email_log alter column organization_id set not null;

-- ── Isolation par la base : un don ne peut lier que des objets du même organisme ───────────────────────
-- Un donateur est propre à son organisme : le courriel est unique par organisme, pas globalement.
-- (donors_email_key est un index unique, pas une contrainte, dans les bases actuelles : on gère les deux cas)
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.donors'::regclass and conname = 'donors_email_key') then
    alter table public.donors drop constraint donors_email_key;
  else
    drop index public.donors_email_key;
  end if;
end $$;
alter table public.donors add constraint donors_org_email_key unique (organization_id, email);
alter table public.donors add constraint donors_id_org_key unique (id, organization_id);

alter table public.donations
  add constraint donations_donor_org_fk  foreign key (donor_id, organization_id)   references public.donors (id, organization_id),
  add constraint donations_vitrail_org_fk foreign key (vitrail_id, organization_id) references public.vitraux (id, organization_id);
alter table public.visits
  add constraint visits_vitrail_org_fk foreign key (vitrail_id, organization_id) references public.vitraux (id, organization_id);
alter table public.reports
  add constraint reports_donor_org_fk foreign key (donor_id, organization_id) references public.donors (id, organization_id);
-- email_log : la clé simple (on delete set null) est remplacée par la composite, qui garde ce comportement
alter table public.email_log drop constraint email_log_donor_id_fkey;
alter table public.email_log
  add constraint email_log_donor_org_fk foreign key (donor_id, organization_id)
    references public.donors (id, organization_id) on delete set null (donor_id);

-- Un don ne change jamais d'organisme ni de vitrail (une erreur de saisie se corrige en supprimant puis en recréant le don).
create function public.donations_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id or new.vitrail_id <> old.vitrail_id then
    raise exception 'L''organisme et le vitrail d''un don ne changent jamais';
  end if;
  return new;
end $$;
create trigger donations_guard before update on public.donations
  for each row execute function public.donations_guard();

create index donations_vitrail_idx on public.donations (vitrail_id);
create index visits_vitrail_idx    on public.visits (vitrail_id, channel);
create index email_log_org_idx     on public.email_log (organization_id, created_at desc);
create index reports_org_open_idx  on public.reports (organization_id, resolved, created_at desc);

-- ── Totaux : le don net (remboursements déduits) ; un morceau remboursé en entier disparaît ────────────
-- Les vues existantes gardent leurs colonnes (le code actuel les lit toujours) ; event_totals disparaît à la phase « resserrer ».
create or replace view public.donor_totals with (security_invoker = true) as
  select d.id as donor_id,
         coalesce(sum(n.amount_cents - n.refunded_cents), 0)::bigint as total_cents,
         max(n.created_at) as last_donation_at
  from public.donors d
  left join public.donations n on n.donor_id = d.id
  group by d.id;

create or replace view public.grand_total with (security_invoker = true) as
  select coalesce(sum(amount_cents - refunded_cents), 0)::bigint as total_cents,
         count(*) filter (where amount_cents > refunded_cents) as donations_count
  from public.donations;

-- Quels dons chaque vitrail affiche : la source unique de toutes les règles d'affichage.
create view public.vitrail_donations with (security_invoker = true) as
  -- chaque don, dans le vitrail où il a été fait
  select n.id as donation_id, n.vitrail_id, n.organization_id, n.donor_id,
         n.amount_cents - n.refunded_cents as net_cents, n.created_at
  from public.donations n
  union all
  -- et, si sa campagne n'est pas privée, dans le vitrail permanent de l'organisme
  select n.id, p.id, n.organization_id, n.donor_id,
         n.amount_cents - n.refunded_cents, n.created_at
  from public.donations n
  join public.vitraux c on c.id = n.vitrail_id and c.kind = 'campaign' and c.in_main
  join public.vitraux p on p.organization_id = n.organization_id and p.kind = 'permanent';

-- Total et nombre de dons d'un vitrail (celui d'une campagne = ce qu'elle a levé)
create view public.vitrail_totals with (security_invoker = true) as
  select v.id as vitrail_id, v.organization_id,
         coalesce(sum(d.net_cents), 0)::bigint as total_cents,
         count(d.donation_id) filter (where d.net_cents > 0) as donations_count
  from public.vitraux v
  left join public.vitrail_donations d on d.vitrail_id = v.id
  group by v.id, v.organization_id;

-- Les morceaux d'un vitrail : la somme des dons d'un donateur affichés dans CE vitrail
create view public.vitrail_donor_totals with (security_invoker = true) as
  select d.vitrail_id, d.organization_id, d.donor_id,
         sum(d.net_cents)::bigint as total_cents,
         max(d.created_at) as last_donation_at
  from public.vitrail_donations d
  group by d.vitrail_id, d.organization_id, d.donor_id
  having sum(d.net_cents) > 0;

-- ── Accès : serveur seulement (service_role), comme le reste ───────────────────────────────────────────
alter table public.organizations       enable row level security;
alter table public.organization_slugs  enable row level security;
alter table public.org_members         enable row level security;
alter table public.vitraux             enable row level security;
revoke all on public.organizations, public.organization_slugs, public.org_members, public.vitraux from anon, authenticated;
revoke all on public.vitrail_donations, public.vitrail_totals, public.vitrail_donor_totals from anon, authenticated;
