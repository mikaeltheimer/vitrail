-- Identité de l'organisme en base (étape 5) : textes par langue, logo, icône, coordonnées juridiques, langues offertes.
--
-- - organizations.texts = { "fr": { name, about, why, whyShort, vitrailTitle, question, placeholder }, "en": { … } }
--   Un champ vide reprend la langue principale, puis un texte neutre de la plateforme (jamais celui d'un autre organisme).
-- - organizations.locales : langues offertes, la PREMIÈRE est la langue principale (['fr'], ['en'], ['fr','en'], ['en','fr']).
-- - organizations.legal = { entity, address, officerName, officerEmail, officerPhone, retention, updated } : exigées avant
--   « Mettre en ligne » (Loi 25), sauf updated, posé à chaque enregistrement.
-- - logo_path / icon_path : chemin dans le bucket « photos » (org/<id>/…) ou fichier statique (/ecole-logo.png).
--   theme.logoSize / theme.iconSize = [largeur, hauteur] en px (image d'aperçu des liens partagés).
-- - L'organisme d'entraînement n'a pas d'identité à lui : le code lit celle de l'organisme réel.
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-11-inscription.sql. D'abord sur donivers-test.

alter table public.organizations
  add column icon_path text;

-- L'ancienne règle exigeait le français : un organisme peut désormais être anglophone seulement
alter table public.organizations drop constraint organizations_locales_check;
alter table public.organizations add constraint organizations_locales_check
  check (array_length(locales, 1) between 1 and 2 and locales <@ array['fr', 'en']::text[]);

-- L'École d'art de Sutton : ses textes d'avant l'étape 5 (lib/config.ts), son logo et son icône (fichiers statiques), bilingue
update public.organizations
set
  locales = array['fr', 'en'],
  logo_path = '/ecole-logo.png',
  icon_path = '/ecole-mark.png',
  theme = theme || '{"logoSize": [400, 99], "iconSize": [100, 95]}'::jsonb,
  texts = jsonb_build_object(
    'fr', jsonb_build_object(
      'name', 'École d''art de Sutton',
      'about', 'L''École d''art de Sutton est un organisme à but non lucratif voué à l''éveil artistique des enfants, petits et grands, par des expériences de création. Depuis 2016, c''est aussi un centre d''art pluridisciplinaire qui fait se rencontrer artistes et enfants : explorations libres, expositions, projections, performances et résidences d''artistes en recherche-création.',
      'why', 'L''École avance sans subvention gouvernementale : c''est sa communauté qui la fait vivre. Chaque don rend possibles ses ateliers, ses expositions et ses résidences d''artistes.',
      'whyShort', 'C''est la communauté qui fait vivre l''École',
      'vitrailTitle', 'Le vitrail de la communauté',
      'question', 'Pourquoi soutenez-vous l''École d''art' || chr(160) || '?',
      'placeholder', 'Une anecdote, un événement qui vous a marqué, ce que l''École a changé pour vous.'
    ),
    'en', jsonb_build_object(
      'name', 'Sutton School of Art',
      'about', 'Sutton School of Art is a non-profit organization devoted to awakening the artistic curiosity of children, young and old, through creative experiences. Since 2016, it has also been a multidisciplinary art centre where artists and children meet: free exploration, exhibitions, screenings, performances and artist residencies in research-creation.',
      'why', 'The School runs without government funding: its community is what keeps it alive. Every donation makes its workshops, exhibitions and artist residencies possible.',
      'whyShort', 'The community keeps the School alive',
      'vitrailTitle', 'The community''s stained glass',
      'question', 'Why do you support Sutton School of Art?',
      'placeholder', 'A story, an event that stayed with you, what the School has changed for you.'
    )
  )
where id in (select organization_id from public.organization_slugs where slug = 'ecoleartsutton' and is_current)
  and texts = '{}'::jsonb;

-- Logos et icônes (PNG, transparence gardée) dans le bucket public « photos », sous org/<organisme>/.
-- Les photos des donateurs restent en JPEG : la route /api/photo le vérifie elle-même.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'photos';
