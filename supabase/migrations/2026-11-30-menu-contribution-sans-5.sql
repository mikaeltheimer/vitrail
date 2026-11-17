-- Menu de la contribution : 5 % retiré (Mika, 17 nov. 2026, PR #24). Les tranches ne changent pas.
-- Nouvelle version pour distinguer l'ancien menu dans les statistiques d'acceptation (donations.contribution_brackets_version).
-- Ne touche la ligne que si elle a encore le menu d'origine : se relance sans danger, n'écrase pas un réglage changé depuis.
update public.platform_settings
   set value = jsonb_set(jsonb_set(value, '{menuRates}', '[0.10, 0.15]'::jsonb), '{version}', '"2026-11-17"'::jsonb)
 where key = 'contribution_brackets'
   and value -> 'menuRates' = '[0.05, 0.10, 0.15]'::jsonb;
