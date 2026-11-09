-- Multi-organismes, phase « resserrer », seconde partie (annoncée dans 2026-11-15-resserrer.sql).
--
-- Retire ce qui ne sert plus depuis le passage à plusieurs organismes :
-- - `events` (et la vue `event_totals`, la colonne `donations.event_id`) : remplacés par `vitraux` ;
-- - `settings` : son seul réglage (`photo_moderation`) vit dans `organizations.photo_moderation` depuis 2026-11-06 ;
-- - `grand_total` : un total de TOUS les organismes confondus, que plus aucun code ne lit et qu'aucun ne doit lire.
-- Aucun code de la branche multi-organismes ne lit ni n'écrit ces objets (vérifié le 2026-11-09).
--
-- EN PRODUCTION : seulement APRÈS le déploiement du nouveau code, comme 2026-11-15-resserrer.sql (l'ancien code
-- lit `settings`, `events` et `grand_total`).
-- À exécuter UNE seule fois par base, après 2026-11-17-adresse-demo.sql. D'abord sur donivers-test.

-- Garde-fou : le réglage de modération doit déjà avoir été repris par chaque organisme d'origine.
do $$
begin
  if exists (select 1 from public.settings where key = 'photo_moderation' and value = 'moderation')
     and not exists (select 1 from public.organizations where photo_moderation = 'moderation') then
    raise exception 'settings.photo_moderation = moderation n''a pas été repris par un organisme : rien n''est supprimé';
  end if;
end $$;

drop view  public.event_totals;
drop view  public.grand_total;
alter table public.donations drop column event_id;   -- emporte la clé étrangère et l'index donations_event_idx
drop table public.events;
drop table public.settings;
