-- Multi-organismes, phase « resserrer » (annoncée dans 2026-11-06-multi-organismes.sql), première partie.
--
-- Retire les DEFAULT « École d'art de Sutton » posés pour la transition. Tant qu'ils existent, une écriture qui oublie
-- organization_id ne casse pas : elle range SILENCIEUSEMENT la ligne chez l'École (c'est arrivé : le journal des
-- courriels de la plateforme — demandes d'accès, codes d'inscription, invitations à créer un organisme — tombait dans
-- celui de l'École). Sans eux, l'oubli devient une erreur visible.
--
-- Le journal des courriels accepte désormais organization_id nul : un courriel de la plateforme n'appartient à aucun
-- organisme et n'apparaît dans aucune console.
--
-- EN PRODUCTION : seulement APRÈS le déploiement du nouveau code (l'ancien code n'écrit pas ces colonnes). La suppression
-- de `events` et de `settings` (seconde partie) viendra avec le plan de mise en production (étape F).
-- À exécuter UNE seule fois par base, après 2026-11-14-suppression-donateur.sql. D'abord sur donivers-test.

alter table public.donors    alter column organization_id drop default;
alter table public.donations alter column organization_id drop default,
                             alter column vitrail_id drop default;
alter table public.visits    alter column organization_id drop default,
                             alter column vitrail_id drop default;
alter table public.reports   alter column organization_id drop default;
alter table public.email_log alter column organization_id drop default,
                             alter column organization_id drop not null;

-- Courriels de la plateforme déjà rangés par erreur chez un organisme : rendus à la plateforme.
-- Sûrs : une demande d'accès et un code d'inscription n'appartiennent jamais à un organisme.
update public.email_log set organization_id = null
 where donor_id is null and kind in ('access_request', 'signup_code');
-- Invitation à CRÉER un organisme (sans organisme), quand l'adresse n'a jamais été invitée dans l'équipe de celui-ci.
update public.email_log l set organization_id = null
 where l.donor_id is null and l.kind = 'invitation'
   and exists (select 1 from public.invitations i where i.email = l.to_email and i.organization_id is null)
   and not exists (select 1 from public.invitations i where i.email = l.to_email and i.organization_id = l.organization_id);
