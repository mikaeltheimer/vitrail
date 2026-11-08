-- Suppression des renseignements d'un donateur (droit à l'effacement, Loi 25), depuis sa fiche dans la console.
-- Voir lib/erase.ts. Les DONS restent (comptabilité, remboursements, commission : obligations légales) mais ne sont plus
-- rattachés qu'à une fiche vide : courriel remplacé par une adresse inexistante, nom, témoignage, photo, langue et
-- consentement à la liste d'envoi effacés ; jetons, signalements et journal des courriels supprimés.
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-13-atelier.sql. D'abord sur donivers-test.

alter table public.donors add column erased_at timestamptz;

comment on column public.donors.erased_at is
  'Renseignements supprimés à la demande (Loi 25). La fiche ne garde que l''identifiant et la couleur ; les dons restent.';
