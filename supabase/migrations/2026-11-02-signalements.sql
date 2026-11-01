-- Signalements : un visiteur du vitrail en ligne signale un morceau (nom, message ou photo inappropriés).
-- À exécuter une fois dans le SQL Editor de Supabase (sans danger si on le relance).
create table if not exists reports (
  id bigint generated always as identity primary key,
  donor_id uuid not null references donors (id) on delete cascade,
  reason text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reports_open_idx on reports (resolved, created_at desc);
alter table reports enable row level security;
revoke all on reports from anon, authenticated;
