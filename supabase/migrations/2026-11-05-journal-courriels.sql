-- Journal des courriels envoyés (reçu, lien personnel, rappel, avis de modération) et de leur sort chez le fournisseur
-- (envoyé, livré, rebond, plainte), alimenté par l'envoi et par le webhook Resend (/api/webhook/resend).
-- Tant que cette migration n'est pas passée, les courriels partent quand même, sans journal.
create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  donor_id     uuid references public.donors (id) on delete set null,
  to_email     text not null,
  kind         text not null check (kind in ('receipt', 'magic_link', 'reminder', 'moderation')),
  locale       text not null default 'fr' check (locale in ('fr', 'en')),
  subject      text not null,
  -- Identifiant du courriel chez Resend : sert à rattacher ses événements (livré, rebond…)
  provider_id  text unique,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'skipped')),
  error        text
);
create index if not exists email_log_donor_idx on public.email_log (donor_id, kind);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;
