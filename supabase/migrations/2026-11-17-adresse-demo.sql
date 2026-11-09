-- L'adresse « demo » (étape C) : réservée depuis 2026-11-06 pour qu'aucun organisme réel ne la prenne, elle sert au
-- vitrail de démonstration de la plateforme. La contrainte d'origine l'interdisait à TOUS ; on la remplace par une
-- règle plus précise : « demo » seulement pour un organisme de démonstration (showcase), vérifiée par la base.
-- Les autres identifiants réservés de la contrainte d'origine restent interdits à tous.
--
-- À exécuter UNE seule fois par base, après 2026-11-16-demonstration.sql. D'abord sur donivers-test.

alter table public.organization_slugs drop constraint organization_slugs_slug_check1;
alter table public.organization_slugs add constraint organization_slugs_slug_check1 check (slug <> all (array[
  'www', 'admin', 'api', 'app', 'mail', 'smtp', 'ftp', 'static', 'assets', 'cdn', 'status', 'help', 'support', 'docs', 'blog',
  'dashboard', 'login', 'auth', 'console', 'donivers', 'test', 'staging', 'preview', 'dev'
]::text[]));

create function public.organization_slugs_demo_guard() returns trigger language plpgsql as $$
begin
  if new.slug = 'demo' and not exists (select 1 from public.organizations o where o.id = new.organization_id and o.showcase) then
    raise exception 'L''adresse « demo » est réservée au vitrail de démonstration.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger organization_slugs_demo_guard before insert or update of slug, organization_id on public.organization_slugs
  for each row execute function public.organization_slugs_demo_guard();

-- Une démonstration ne redevient pas un organisme réel tant qu'elle porte « demo »
create function public.organizations_demo_guard() returns trigger language plpgsql as $$
begin
  if old.showcase and not new.showcase and exists (select 1 from public.organization_slugs s where s.organization_id = new.id and s.slug = 'demo') then
    raise exception 'Cet organisme porte l''adresse « demo » : il reste une démonstration.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger organizations_demo_guard before update of showcase on public.organizations
  for each row execute function public.organizations_demo_guard();

revoke all on function public.organization_slugs_demo_guard() from public, anon, authenticated;
revoke all on function public.organizations_demo_guard() from public, anon, authenticated;
