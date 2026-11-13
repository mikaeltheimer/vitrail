-- Totaux par organisme pour la section Studio (comptes is_studio), en lecture seule.
--
-- Principe (décision du 12 novembre 2026) : Studio voit des TOTAUX, jamais des personnes. Cette fonction ne renvoie
-- aucun nom, courriel, témoignage, photo ni montant de don pris un par un.
--
-- Règles de calcul :
-- - Organismes réels seulement : la démo (showcase) et les ateliers (practice_of) sont exclus.
-- - Dons comptés : stripe, cash et seed (amorçage : vrais dons faits avant l'ouverture) ; jamais demo.
--   La part hors Stripe (cash + seed, déclarée par l'organisme) est rendue à part.
-- - Montant net d'un don : montant − remboursé − perdu en litige (jamais sous zéro).
-- - Donateurs : lignes de donors (une par adresse et par organisme) ayant au moins un don compté. Un même courriel chez
--   deux organismes compte deux fois : le seuil de 100 donateurs est propre à chaque organisme.
-- - Commission nette : commission prélevée − commission rendue. C'est le SEUL endroit où Studio la calcule.
--   K1 (nouvelle commission) : soustraire ici l'excédent rendu au plafond (platform_fee_waived_cents).
-- - Fenêtre : les colonnes « _since » ne comptent que ce qui est postérieur à p_since (le serveur passe « il y a 30 jours »).
--
-- Serveur seulement (service_role). Ajout seulement ; sans danger si on la relance.
-- Numéro 25 : le 23 est annoncé pour K1 (commission), le 24 est le changement d'adresse.

create or replace function public.studio_org_stats(p_since timestamptz)
returns table (
  organization_id uuid,
  donors bigint,
  donors_since bigint,
  donations bigint,
  donations_since bigint,
  net_cents bigint,
  net_since_cents bigint,
  offline_net_cents bigint,
  fee_cents bigint,
  fee_since_cents bigint,
  disputes_open bigint,
  last_donation_at timestamptz,
  owners bigint,
  volunteers bigint,
  last_login_at timestamptz,
  bounces bigint,
  bounces_since bigint,
  complaints bigint,
  complaints_since bigint
)
language sql
stable
set search_path to ''
as $$
  with orgs as (
    select o.id from public.organizations o where o.practice_of is null and not o.showcase
  ),
  d as (
    select
      d.organization_id,
      d.donor_id,
      d.created_at,
      d.source,
      d.dispute_status,
      greatest(d.amount_cents - d.refunded_cents - d.dispute_lost_cents, 0)::bigint as net,
      (d.platform_fee_cents - d.platform_fee_refunded_cents)::bigint as fee
    from public.donations d
    join orgs on orgs.id = d.organization_id
    where d.source in ('stripe', 'cash', 'seed')
  ),
  dons as (
    select
      d.organization_id,
      count(distinct d.donor_id) as donors,
      count(*) as donations,
      count(*) filter (where d.created_at > p_since) as donations_since,
      coalesce(sum(d.net), 0)::bigint as net_cents,
      coalesce(sum(d.net) filter (where d.created_at > p_since), 0)::bigint as net_since_cents,
      coalesce(sum(d.net) filter (where d.source in ('cash', 'seed')), 0)::bigint as offline_net_cents,
      coalesce(sum(d.fee), 0)::bigint as fee_cents,
      coalesce(sum(d.fee) filter (where d.created_at > p_since), 0)::bigint as fee_since_cents,
      count(*) filter (where d.dispute_status = 'open') as disputes_open,
      max(d.created_at) as last_donation_at
    from d
    group by d.organization_id
  ),
  -- Nouveaux donateurs de la fenêtre : premier don compté postérieur à p_since
  premiers as (
    select d.organization_id, count(*) as donors_since
    from (select d.organization_id, d.donor_id, min(d.created_at) as first_at from d group by d.organization_id, d.donor_id) d
    where d.first_at > p_since
    group by d.organization_id
  ),
  membres as (
    select
      m.organization_id,
      count(*) filter (where m.role = 'owner') as owners,
      count(*) filter (where m.role = 'volunteer') as volunteers,
      max(a.last_login_at) as last_login_at
    from public.memberships m
    join orgs on orgs.id = m.organization_id
    join public.accounts a on a.id = m.account_id
    group by m.organization_id
  ),
  courriels as (
    select
      e.organization_id,
      count(*) filter (where e.status = 'bounced') as bounces,
      count(*) filter (where e.status = 'bounced' and e.updated_at > p_since) as bounces_since,
      count(*) filter (where e.status = 'complained') as complaints,
      count(*) filter (where e.status = 'complained' and e.updated_at > p_since) as complaints_since
    from public.email_log e
    join orgs on orgs.id = e.organization_id
    where e.status in ('bounced', 'complained')
    group by e.organization_id
  )
  select
    orgs.id,
    coalesce(dons.donors, 0),
    coalesce(premiers.donors_since, 0),
    coalesce(dons.donations, 0),
    coalesce(dons.donations_since, 0),
    coalesce(dons.net_cents, 0),
    coalesce(dons.net_since_cents, 0),
    coalesce(dons.offline_net_cents, 0),
    coalesce(dons.fee_cents, 0),
    coalesce(dons.fee_since_cents, 0),
    coalesce(dons.disputes_open, 0),
    dons.last_donation_at,
    coalesce(membres.owners, 0),
    coalesce(membres.volunteers, 0),
    membres.last_login_at,
    coalesce(courriels.bounces, 0),
    coalesce(courriels.bounces_since, 0),
    coalesce(courriels.complaints, 0),
    coalesce(courriels.complaints_since, 0)
  from orgs
  left join dons on dons.organization_id = orgs.id
  left join premiers on premiers.organization_id = orgs.id
  left join membres on membres.organization_id = orgs.id
  left join courriels on courriels.organization_id = orgs.id
$$;

revoke all on function public.studio_org_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.studio_org_stats(timestamptz) to service_role;
