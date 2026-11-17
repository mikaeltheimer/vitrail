-- Avis au 100e donateur et totaux de Studio (C, 16 novembre 2026 ; accord de Mika pour donivers-test avant la fusion).
--
-- 1. organizations.fee_threshold_notified_at : l'avis au propriétaire quand le seuil gratuit est franchi part UNE fois
--    (pose atomique « where … is null » par lib/billing-notice.ts). Les organismes qui l'ont déjà franchi sont marqués
--    comme avisés : aucun courriel rétroactif.
-- 2. email_log_kind_check : nouveau type de courriel « fee_threshold ». ATTENTION : modifie une contrainte (la retire puis
--    la remet, élargie). Sans danger si on la relance ; un retour arrière du code n'est pas gêné (liste plus large).
-- 3. studio_tax_totals : taxes comprises dans ce que garde Donivers, par province, nettes des remboursements (dons réglés
--    des organismes réels). Totaux seulement, comme studio_org_stats.
-- 4. studio_suggestion_stats : taux d'acceptation de la contribution suggérée, par tranche de montant du don.
--
-- Serveur seulement (service_role).

alter table public.organizations add column if not exists fee_threshold_notified_at timestamptz;

update public.organizations
   set fee_threshold_notified_at = fee_threshold_reached_at
 where fee_threshold_reached_at is not null and fee_threshold_notified_at is null;

alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check check (kind = any (array[
  'receipt', 'magic_link', 'reminder', 'moderation', 'invitation', 'password_reset', 'signup_code', 'access_request', 'fee_threshold'
]::text[]));

create or replace function public.studio_tax_totals(p_since timestamptz)
returns table (tax_province text, tax_cents bigint, tax_since_cents bigint)
language sql
stable
set search_path to ''
as $$
  with d as (
    select
      x.tax_province,
      x.created_at,
      case when x.platform_fee_cents - x.platform_fee_waived_cents > 0
        then round(x.tax_included_cents::numeric
                   * greatest(0, x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents)
                   / (x.platform_fee_cents - x.platform_fee_waived_cents))::bigint
        else 0 end as tax_net
    from public.donations x
    join public.organizations o on o.id = x.organization_id and o.practice_of is null and not o.showcase
    where x.source = 'stripe' and x.platform_fee_settled_at is not null and x.tax_province is not null
  )
  select tax_province,
         coalesce(sum(tax_net), 0)::bigint,
         coalesce(sum(tax_net) filter (where created_at >= p_since), 0)::bigint
  from d
  group by tax_province
  order by tax_province
$$;

create or replace function public.studio_suggestion_stats(p_since timestamptz)
returns table (tranche text, donations bigint, accepted bigint, nothing bigint, donations_since bigint, accepted_since bigint)
language sql
stable
set search_path to ''
as $$
  with d as (
    select
      case when x.amount_cents < 25000 then 'moins-250' when x.amount_cents <= 100000 then '250-1000' else 'plus-1000' end as tranche,
      x.donor_contribution_cents = x.contribution_suggested_cents as accepted,
      x.donor_contribution_cents = 0 as nothing,
      x.created_at
    from public.donations x
    join public.organizations o on o.id = x.organization_id and o.practice_of is null and not o.showcase
    where x.source = 'stripe' and coalesce(x.contribution_suggested_cents, 0) > 0
  )
  select tranche,
         count(*)::bigint,
         count(*) filter (where accepted)::bigint,
         count(*) filter (where nothing)::bigint,
         count(*) filter (where created_at >= p_since)::bigint,
         count(*) filter (where accepted and created_at >= p_since)::bigint
  from d
  group by tranche
$$;

revoke all on function public.studio_tax_totals(timestamptz) from public, anon, authenticated;
grant execute on function public.studio_tax_totals(timestamptz) to service_role;
revoke all on function public.studio_suggestion_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.studio_suggestion_stats(timestamptz) to service_role;
