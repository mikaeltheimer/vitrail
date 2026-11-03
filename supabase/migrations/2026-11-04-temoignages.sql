-- Témoignages : le message d'un morceau devient un souvenir ou une anecdote (jusqu'à 500 caractères), modéré comme
-- les photos, avec le consentement du donateur à ce que l'organisme le cite dans ses communications.
-- À exécuter une fois dans le SQL Editor de Supabase (sans danger si on le relance).
alter table donors add column if not exists message_status text not null default 'approved';
do $$ begin
  alter table donors add constraint donors_message_status_check check (message_status in ('approved', 'pending'));
exception when duplicate_object then null; end $$;
alter table donors add column if not exists quote_consent boolean not null default false;
