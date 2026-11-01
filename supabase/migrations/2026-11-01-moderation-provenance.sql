-- Modération des photos, réglages, provenance des dons et visites.
-- À exécuter une fois dans le SQL Editor de Supabase (sans danger si on le relance).

-- Photos : en mode « modération », une nouvelle photo attend l'approbation avant d'apparaître
alter table donors add column if not exists photo_status text not null default 'approved';
do $$ begin
  alter table donors add constraint donors_photo_status_check check (photo_status in ('approved', 'pending'));
exception when duplicate_object then null; end $$;

-- Réglages modifiables depuis la console (mode de publication des photos…)
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table settings enable row level security;
revoke all on settings from anon, authenticated;
insert into settings (key, value) values ('photo_moderation', 'live') on conflict (key) do nothing;

-- Provenance : d'où vient chaque don (écran, affiche de l'entrée…), et combien de visites par provenance
alter table donations add column if not exists channel text;
create table if not exists visits (
  id bigint generated always as identity primary key,
  channel text not null,
  created_at timestamptz not null default now()
);
create index if not exists visits_channel_idx on visits (channel);
alter table visits enable row level security;
revoke all on visits from anon, authenticated;
