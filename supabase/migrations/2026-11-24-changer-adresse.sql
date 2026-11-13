-- Changer l'adresse (sous-domaine) d'un organisme depuis sa console, en une seule transaction : l'organisme n'est jamais
-- sans adresse actuelle (index organization_slugs_one_current), et son atelier (<adresse>--essai) suit.
--
-- Règles (décisions du 12 novembre 2026) :
-- - Brouillon (went_live_at vide) : changements libres ; l'ancienne adresse est LIBÉRÉE (rien n'a été imprimé).
-- - En ligne : l'ancienne adresse reste à l'organisme pour toujours et redirige vers l'actuelle (lookupSlug) ;
--   au plus p_max nouvelles adresses après la mise en ligne. Revenir à une ancienne adresse de l'organisme est
--   toujours permis et ne compte pas (aucune nouvelle adresse n'est prise).
-- - Jamais pour l'atelier lui-même, la démo, un organisme suspendu.
-- La forme de l'adresse (pas de « -- », longueur avec le suffixe) est vérifiée par le serveur (orgSlugProblem) ;
-- les contraintes de la table (forme, réservés, « demo ») s'appliquent en plus.
--
-- Réponse : 'ok', 'meme', 'pris', 'limite' ou 'impossible'. Serveur seulement (service_role).
-- Numéro 24 : le 23 est annoncé pour K1 (commission). Ajout seulement ; sans danger si on la relance.

create or replace function public.change_org_slug(p_org uuid, p_slug text, p_max integer)
returns text
language plpgsql
set search_path to ''
as $$
declare
  v_org record;
  v_draft boolean;
  v_practice uuid;
  v_holder uuid;
  v_used integer;
  v_target record;
  v_slug text;
  v_n integer;
begin
  select id, status, went_live_at, practice_of, showcase into v_org from public.organizations where id = p_org for update;
  if not found or v_org.practice_of is not null or v_org.showcase or v_org.status = 'suspended' then
    return 'impossible';
  end if;
  v_draft := v_org.went_live_at is null;

  if exists (select 1 from public.organization_slugs s where s.organization_id = p_org and s.is_current and s.slug = p_slug) then
    return 'meme';
  end if;

  select id into v_practice from public.organizations where practice_of = p_org limit 1;

  select organization_id into v_holder from public.organization_slugs where slug = p_slug;
  if v_holder is not null and v_holder <> p_org then
    return 'pris';
  end if;
  if exists (select 1 from public.organization_slugs s where s.slug = p_slug || '--essai' and s.organization_id is distinct from v_practice) then
    return 'pris';
  end if;

  -- Nouvelle adresse après la mise en ligne : limitée (un retour à une ancienne adresse ne compte pas)
  if not v_draft and v_holder is null then
    select count(*) into v_used from public.organization_slugs s where s.organization_id = p_org and s.created_at > v_org.went_live_at;
    if v_used >= p_max then
      return 'limite';
    end if;
  end if;

  -- L'organisme, puis son atelier
  for v_target in
    select p_org as id, p_slug as slug
    union all
    select v_practice, p_slug || '--essai' where v_practice is not null
  loop
    update public.organization_slugs set is_current = false where organization_id = v_target.id and is_current;
    if v_draft then
      delete from public.organization_slugs where organization_id = v_target.id and not is_current;
    end if;
    v_slug := v_target.slug;
    insert into public.organization_slugs (slug, organization_id, is_current, created_at)
      values (v_slug, v_target.id, true, now())
      on conflict (slug) do update set is_current = true where public.organization_slugs.organization_id = v_target.id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      -- Prise entre-temps par un autre organisme : tout est annulé
      raise exception 'Adresse déjà prise : %', v_slug using errcode = 'unique_violation';
    end if;
  end loop;

  return 'ok';
end $$;

revoke all on function public.change_org_slug(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.change_org_slug(uuid, text, integer) to service_role;
