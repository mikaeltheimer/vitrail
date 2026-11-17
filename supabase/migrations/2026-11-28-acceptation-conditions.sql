-- Historique des acceptations des conditions d'utilisation de la plateforme (16 novembre 2026, décision D8 du plan K).
-- Quand les conditions changent (nouvelle TERMS_VERSION), le propriétaire d'un organisme déjà inscrit les accepte dans
-- la console ; « Mettre en ligne » est refusé tant que la version en vigueur n'est pas acceptée (lib/launch.ts).
-- Une ligne par organisme et par version : qui, quand. Les colonnes terms_* d'organizations restent le dernier état.
-- Reprise : les acceptations déjà enregistrées à l'inscription (organismes réels seulement).
--
-- Serveur seulement (service_role). Ajout seulement ; sans danger si on la relance.

create table if not exists public.terms_acceptances (
  id uuid default gen_random_uuid() not null primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version text not null check (char_length(version) between 1 and 60),
  accepted_at timestamptz default now() not null,
  accepted_by uuid references public.accounts(id) on delete set null,
  constraint terms_acceptances_org_version unique (organization_id, version)
);

alter table public.terms_acceptances enable row level security;
revoke all on table public.terms_acceptances from public, anon, authenticated;
grant select, insert on table public.terms_acceptances to service_role;

insert into public.terms_acceptances (organization_id, version, accepted_at, accepted_by)
select id, terms_version, coalesce(terms_accepted_at, created_at), terms_accepted_by
from public.organizations
where terms_version is not null and practice_of is null
on conflict (organization_id, version) do nothing;
