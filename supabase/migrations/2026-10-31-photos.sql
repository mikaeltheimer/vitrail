-- Vitrail de dons — photos de donateurs.
-- À lancer une fois dans Supabase › SQL Editor (le schéma de base doit déjà être en place).

-- 1. Adresse de la photo du donateur (affichée seulement s'il a consenti à l'affichage de son nom)
alter table public.donors add column if not exists photo_url text;

-- 2. Stockage des photos : bucket public en lecture (les photos s'affichent sur l'écran), écriture par le serveur seulement.
--    JPEG uniquement, 1 Mo au plus : le navigateur recadre et réduit la photo avant l'envoi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];
