-- Droits des deux fonctions de déclencheur créées par 2026-11-06-multi-organismes.sql (vitraux_guard, donations_guard).
-- Cette migration ne leur avait pas retiré les droits accordés par défaut : sur les bases hébergées, PUBLIC, anon et
-- authenticated pouvaient les exécuter. Sans effet pratique (une fonction de déclencheur ne s'appelle pas directement),
-- mais contraire à la règle du projet (serveur seulement) et à schema.sql, qui les retire déjà : la migration aligne
-- les bases en service sur le fichier. Même geste que 2026-11-17-adresse-demo.sql pour ses deux fonctions.
--
-- Retrait de droits seulement, sans danger si on la relance. D'abord sur donivers-test, puis en production.

revoke all on function public.vitraux_guard()   from public, anon, authenticated;
revoke all on function public.donations_guard() from public, anon, authenticated;
