-- Mon compte (Mika, 17 nov. 2026) : changement d'adresse courriel d'un compte, confirmé par un lien envoyé à la NOUVELLE
-- adresse (24 h). La base ne garde que l'empreinte du jeton. Une seule demande en cours par compte (les précédentes sont
-- effacées à chaque nouvelle demande). L'ancienne adresse est prévenue après le changement.
-- Ajoute seulement (table, index) et élargit la contrainte des types de courriels : compatible avec le code précédent,
-- se relance sans danger.
create table if not exists public.email_changes (
    token_hash text primary key,
    account_id uuid not null references public.accounts(id) on delete cascade,
    old_email text not null,
    new_email text not null,
    created_at timestamp with time zone not null default now(),
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone,
    constraint email_changes_new_email_check check (new_email = lower(new_email) and position('@' in new_email) > 1)
);
create index if not exists email_changes_account_id_idx on public.email_changes (account_id);

alter table public.email_changes enable row level security;
revoke all on table public.email_changes from public, anon, authenticated;
grant select, insert, update, delete on table public.email_changes to service_role;

-- Deux nouveaux types de courriels : la confirmation (nouvelle adresse) et l'avis (ancienne adresse)
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind = any (array[
    'receipt', 'magic_link', 'reminder', 'moderation', 'invitation', 'password_reset', 'signup_code', 'access_request',
    'fee_threshold', 'email_change', 'email_changed'
]::text[]));
