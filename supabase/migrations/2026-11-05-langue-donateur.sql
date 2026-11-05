-- Langue du donateur (fr ou en) : celle de son dernier don, pour lui écrire dans sa langue (reçu, lien personnel).
-- Les donateurs existants restent en français. Tant que cette migration n'est pas passée, le site fonctionne
-- sans (les courriels partent alors en français).
alter table donors add column if not exists locale text not null default 'fr';
do $$ begin
  alter table donors add constraint donors_locale_check check (locale in ('fr', 'en'));
exception when duplicate_object then null; end $$;
