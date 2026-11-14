-- Écran jumelé de la démonstration (14 novembre 2026).
-- Sur la démo, un don d'essai reste dans l'onglet du téléphone (sessionStorage) : l'écran de projection ne le voyait
-- jamais. Désormais, /ecran de la démo génère un code de séance qu'il met dans son QR ; un don d'essai fait par ce QR
-- est aussi envoyé ici, et SEUL l'écran qui porte ce code l'affiche (ni le vitrail public de la démo, ni les autres
-- visiteurs). Les morceaux s'affichent 12 h, sont effacés après 24 h (à chaque nouvel envoi), 60 au plus par séance.
-- Rien ne rattache un morceau à une personne : pas de courriel, pas de compte, pas d'adresse IP.
--
-- Réservé à l'organisme de démonstration (vérifié par le serveur, lib/demo-screen.ts). Serveur seulement (service_role).
-- Numéro 26 : la 23 reste libre (elle avait été annoncée pour K1, qui prendra le numéro libre au moment d'être écrit).
-- Ajout seulement ; sans danger si on la relance.

create table if not exists public.demo_screen_pieces (
  id uuid default gen_random_uuid() not null primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  screen_code text not null check (screen_code ~ '^[a-z0-9]{12}$'),
  name text check (char_length(name) <= 60),
  message text check (char_length(message) <= 1000),
  question text check (char_length(question) <= 300),
  color text not null check (char_length(color) <= 40),
  amount_cents integer not null check (amount_cents > 0),
  photo text check (char_length(photo) <= 1000000 and photo like 'data:image/jpeg;base64,%'),
  has_photo boolean not null default false,
  created_at timestamptz default now() not null,
  constraint demo_screen_pieces_photo_flag check (has_photo = (photo is not null))
);

create index if not exists demo_screen_pieces_screen on public.demo_screen_pieces (organization_id, screen_code, created_at);
create index if not exists demo_screen_pieces_created on public.demo_screen_pieces (created_at);

alter table public.demo_screen_pieces enable row level security;
revoke all on table public.demo_screen_pieces from public, anon, authenticated;
grant select, insert, delete on table public.demo_screen_pieces to service_role;
