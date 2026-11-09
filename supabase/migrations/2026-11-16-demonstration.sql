-- Vitrail de démonstration (étape C) : un organisme FICTIF, montré par la vitrine, en lecture seule.
-- Le code (lib/env.ts, paymentModeFor) ferme ses dons ; les routes publiques refusent signalements, photos et liens ;
-- les visites n'y sont pas comptées. Ses donateurs sont générés depuis la section Studio (lib/demo.ts).
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-15-resserrer.sql. D'abord sur donivers-test.

alter table public.organizations add column showcase boolean not null default false;

-- Une démonstration n'est jamais un organisme d'entraînement
alter table public.organizations add constraint organizations_showcase_not_practice check (not (showcase and practice_of is not null));

comment on column public.organizations.showcase is
  'Vitrail de démonstration de la plateforme : organisme fictif, aucun don, aucune écriture publique.';
