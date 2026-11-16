-- Moteur de la commission plafonnée (étape K1) et contribution facultative du donateur (16 novembre 2026).
--
-- Spécification : claude/donivers-2026-11-16-contribution-donateur.md (fait foi) et claude/donivers-plan-etape-k.md
-- (seuil de 100 donateurs, verrous, décisions D2 à D8). Rappel de la règle, pour un don Stripe au vitrail principal :
--   S = surplus de la contribution une fois les frais Stripe couverts (jamais plafonné) ;
--   P = part de l'organisme = min(max(0, commission − S), max(0, reste avant le plafond − S)) ;
--   Donivers reçoit S + P (application_fee_amount, déjà rangé dans platform_fee_cents) ;
--   le plafond de 495 $ compte S + P, taxes incluses, dès le premier donateur.
--
-- PR A1 : rien n'est branché. L'ancien code continue de calculer l'ancienne grille et ignore tout ce qui est ajouté ici.
-- Ajout seulement ; sans danger si on la relance. Numéro 27 : la 23 reste vide (règle du 14 novembre).
--
-- Contenu :
-- 1. platform_settings (+ historique) : tranches de la contribution, estimation des frais Stripe, taux de taxes.
-- 2. organizations : verrous fee_threshold_reached_at et fee_settled_at, province des taxes.
-- 3. donations : contribution, suggestion montrée, frais Stripe, surplus, taxes, excédent rendu, règlement.
-- 4. Vue organization_billing : une seule définition du compteur de donateurs et du cumul.
-- 5. settle_platform_fee : règlement d'un don sous verrou par organisme (paiements simultanés près du plafond).
-- 6. studio_org_stats : lit le compteur de la vue, et la commission nette retire l'excédent rendu.
--
-- organizations.fee_schedule n'est pas modifié : une grille sans « model » vaut le modèle plafonné par défaut
-- (lib/platform-fee.ts, parseBillingSchedule, et le même défaut ici en SQL). L'exemption de l'École sera posée en A2.

-- ── 1. Réglages de la plateforme ───────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.platform_settings (
  key text primary key check (key ~ '^[a-z_]{1,60}$'),
  value jsonb not null,
  updated_at timestamptz default now() not null,
  updated_by uuid references public.accounts(id) on delete set null
);

create table if not exists public.platform_settings_history (
  id bigint generated always as identity primary key,
  key text not null,
  old_value jsonb,
  new_value jsonb not null,
  changed_at timestamptz default now() not null,
  changed_by uuid
);

create index if not exists platform_settings_history_key on public.platform_settings_history (key, changed_at);

-- Qui, quand, ancienne valeur : chaque écriture est gardée (section 5.1), quelle que soit la façon de modifier la ligne.
-- AFTER : un « insert … on conflict do nothing » écarté (relance de cette migration) n'écrit rien dans l'historique.
create or replace function public.platform_settings_log()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_when = 'BEFORE' then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return null;
  end if;
  insert into public.platform_settings_history (key, old_value, new_value, changed_by)
  values (new.key, case when tg_op = 'UPDATE' then old.value end, new.value, new.updated_by);
  return null;
end;
$$;

drop trigger if exists platform_settings_log on public.platform_settings;
drop trigger if exists platform_settings_touch on public.platform_settings;
create trigger platform_settings_touch before update on public.platform_settings
  for each row execute function public.platform_settings_log();
create trigger platform_settings_log after insert or update on public.platform_settings
  for each row execute function public.platform_settings_log();

insert into public.platform_settings (key, value) values
  ('contribution_brackets', '{
     "version": "2026-11-16",
     "brackets": [{"upToCents": 25000, "rate": 0.15}, {"upToCents": 100000, "rate": 0.08}, {"rate": 0.07}],
     "menuRates": [0.05, 0.10, 0.15],
     "stripeFeeEstimate": {"rate": 0.029, "fixedCents": 30}
   }'::jsonb),
  -- À confirmer avec le comptable (lib/tax.ts) : TPS + TVQ au Québec, TVH dans les provinces harmonisées, TPS ailleurs
  ('tax_rates', '{"AB": 0.05, "BC": 0.05, "MB": 0.05, "NB": 0.15, "NL": 0.15, "NS": 0.14, "NT": 0.05, "NU": 0.05,
                  "ON": 0.13, "PE": 0.15, "QC": 0.14975, "SK": 0.05, "YT": 0.05}'::jsonb)
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;
alter table public.platform_settings_history enable row level security;
revoke all on table public.platform_settings, public.platform_settings_history from public, anon, authenticated;
grant select, insert, update on table public.platform_settings to service_role;
grant select on table public.platform_settings_history to service_role;
revoke all on function public.platform_settings_log() from public, anon, authenticated;

-- ── 2. Organismes ─────────────────────────────────────────────────────────────────────────────────────────────────────

alter table public.organizations
  -- Posé la première fois que le compte atteint le seuil (100) : une fusion ou un effacement ne le fait jamais reculer
  add column if not exists fee_threshold_reached_at timestamptz,
  -- « Acquitté » : posé quand le cumul atteint le plafond ; pour toujours (D4)
  add column if not exists fee_settled_at timestamptz,
  -- Province de l'organisme, lue sur son compte Stripe (adresse vérifiée) : taux des taxes comprises
  add column if not exists tax_province text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_tax_province_check') then
    alter table public.organizations add constraint organizations_tax_province_check
      check (tax_province is null or tax_province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'));
  end if;
end $$;

-- ── 3. Dons ───────────────────────────────────────────────────────────────────────────────────────────────────────────

alter table public.donations
  -- C : contribution choisie par le donateur (0 : « Ne rien ajouter », ou pas de bloc)
  add column if not exists donor_contribution_cents integer default 0 not null,
  -- Suggestion montrée et version des tranches : pour mesurer le taux d'acceptation (null : aucun bloc montré)
  add column if not exists contribution_suggested_cents integer,
  add column if not exists contribution_brackets_version text,
  -- F estimé à la création du paiement (tarif standard), et réel une fois connu (balance transaction)
  add column if not exists stripe_fee_estimated_cents integer,
  add column if not exists stripe_fee_actual_cents integer,
  -- S : surplus de la contribution gardé par Donivers (compris dans platform_fee_cents)
  add column if not exists contribution_surplus_cents integer default 0 not null,
  -- Taxes comprises dans ce que garde Donivers (S + P), et la province de leur taux
  add column if not exists tax_province text,
  add column if not exists tax_included_cents integer default 0 not null,
  -- Excédent rendu à l'organisme au règlement (plafond dépassé par des paiements simultanés, ou frais réels plus élevés)
  add column if not exists platform_fee_waived_cents integer default 0 not null,
  -- Règlement fait (idempotence : un webhook rejoué ne règle pas deux fois)
  add column if not exists platform_fee_settled_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'donations_contribution_checks') then
    alter table public.donations add constraint donations_contribution_checks check (
      donor_contribution_cents >= 0
      and (contribution_suggested_cents is null or contribution_suggested_cents >= 0)
      and (stripe_fee_estimated_cents is null or stripe_fee_estimated_cents >= 0)
      and (stripe_fee_actual_cents is null or stripe_fee_actual_cents >= 0)
      and contribution_surplus_cents >= 0
      and tax_included_cents >= 0
      and platform_fee_waived_cents >= 0
    );
  end if;
  -- Ce qui est rendu (remboursement + excédent) ne dépasse jamais ce que Stripe a prélevé, et S en fait partie
  if not exists (select 1 from pg_constraint where conname = 'donations_platform_fee_balance') then
    alter table public.donations add constraint donations_platform_fee_balance check (
      platform_fee_refunded_cents + platform_fee_waived_cents <= platform_fee_cents
      and contribution_surplus_cents <= platform_fee_cents
      and tax_included_cents <= platform_fee_cents
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'donations_tax_province_check') then
    alter table public.donations add constraint donations_tax_province_check
      check (tax_province is null or tax_province in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'));
  end if;
end $$;

-- ── 4. Vue organization_billing ───────────────────────────────────────────────────────────────────────────────────────
-- Une seule définition, lue par la console, le paiement et Studio.
-- - donors_counted : donateurs (une fiche par adresse et par organisme) ayant au moins un don stripe, cash ou seed,
--   fiches effacées comprises (D5) ; jamais demo. Tous les vitraux de l'organisme (campagnes désactivées, D6).
-- - Seuls les dons RÉGLÉS comptent (platform_fee_settled_at) : un paiement en cours n'a pas encore son montant définitif ;
--   le compter à son montant brut rendrait trop et poserait l'acquittement trop tôt (vu à l'essai de deux règlements
--   simultanés). Un paiement en cours peut donc être un peu trop prélevé au départ : son règlement corrige (D3).
-- - Par don Stripe du vitrail principal : gardé = prélevé − excédent rendu − commission rendue ;
--   la part des donateurs est le surplus S, réduit dans la même proportion que ce qui a été rendu ;
--   la part de l'organisme est le reste.
-- - cumul_cents : ce qui compte pour le plafond (gardé, ou seulement la part de l'organisme si la grille exclut les
--   contributions). Taxes incluses.
-- La grille par défaut (sans « model ») est le modèle plafonné : 100 donateurs, 495 $.

create or replace view public.organization_billing with (security_invoker='true') as
with dons as (
  select
    d.organization_id,
    d.platform_fee_cents - d.platform_fee_waived_cents - d.platform_fee_refunded_cents as retained,
    case when d.platform_fee_cents - d.platform_fee_waived_cents > 0
      then round(d.contribution_surplus_cents::numeric * (d.platform_fee_cents - d.platform_fee_waived_cents - d.platform_fee_refunded_cents)
                 / (d.platform_fee_cents - d.platform_fee_waived_cents))::bigint
      else 0 end as donor_part
  from public.donations d
  join public.vitraux v on v.id = d.vitrail_id and v.kind = 'permanent'
  where d.source = 'stripe' and d.platform_fee_settled_at is not null
),
totaux as (
  select organization_id,
    coalesce(sum(retained), 0)::bigint as retained_cents,
    coalesce(sum(donor_part), 0)::bigint as donor_covered_cents
  from dons
  group by organization_id
),
donateurs as (
  select d.organization_id, count(distinct d.donor_id)::bigint as donors_counted
  from public.donations d
  where d.source in ('stripe', 'cash', 'seed')
  group by d.organization_id
)
select
  o.id as organization_id,
  coalesce(o.fee_schedule->>'model', 'capped') as fee_model,
  coalesce(case when jsonb_typeof(o.fee_schedule->'freeDonors') = 'number' then (o.fee_schedule->>'freeDonors')::integer end, 100) as free_donors,
  coalesce(case when jsonb_typeof(o.fee_schedule->'capCents') = 'number' then (o.fee_schedule->>'capCents')::integer end, 49500) as cap_cents,
  coalesce(case when jsonb_typeof(o.fee_schedule->'contributionCountsTowardCap') = 'boolean'
    then (o.fee_schedule->>'contributionCountsTowardCap')::boolean end, true) as contribution_counts_toward_cap,
  coalesce(dn.donors_counted, 0) as donors_counted,
  coalesce(t.retained_cents, 0) - coalesce(t.donor_covered_cents, 0) as fees_net_cents,
  coalesce(t.donor_covered_cents, 0) as donor_covered_cents,
  case when coalesce(case when jsonb_typeof(o.fee_schedule->'contributionCountsTowardCap') = 'boolean'
         then (o.fee_schedule->>'contributionCountsTowardCap')::boolean end, true)
    then coalesce(t.retained_cents, 0)
    else coalesce(t.retained_cents, 0) - coalesce(t.donor_covered_cents, 0) end as cumul_cents,
  o.fee_threshold_reached_at,
  o.fee_settled_at
from public.organizations o
left join totaux t on t.organization_id = o.id
left join donateurs dn on dn.organization_id = o.id;

revoke all on table public.organization_billing from public, anon, authenticated;
grant select on table public.organization_billing to service_role;

-- ── 5. Règlement d'un don ─────────────────────────────────────────────────────────────────────────────────────────────
-- Appelé par le webhook une fois le don enregistré (PR A2), sous un verrou par organisme : deux paiements ouverts près du
-- plafond ne peuvent pas le dépasser à eux deux (D3 : correction au paiement, l'excédent est rendu par Stripe).
--
-- p_stripe_fee_actual (facultatif) : frais Stripe réels. S'ils dépassent l'estimation, le surplus réel est plus petit
-- et la différence est rendue à l'organisme : la contribution couvre toujours d'abord les frais réels (validé par Mika
-- le 16 nov.). Des frais réels plus bas ne changent rien : Stripe ne permet pas d'augmenter la commission après coup ;
-- un organisme au tarif réduit connu a sa propre estimation (fee_schedule.stripeFeeEstimate).
--
-- Renvoie l'excédent total à rendre chez Stripe (le webhook rend la différence avec ce qui l'est déjà), le surplus gardé,
-- si ce don a acquitté l'organisme, et si le don était déjà réglé (rejeu). Idempotent.

create or replace function public.settle_platform_fee(p_donation uuid, p_stripe_fee_actual integer default null)
returns table (waived_cents integer, surplus_cents integer, settled_now boolean, already_settled boolean)
language plpgsql
set search_path to ''
as $$
declare
  v_org uuid;
  d record;
  o record;
  v_model text;
  v_cap bigint;
  v_free bigint;
  v_counts boolean;
  v_principal boolean;
  v_s integer;
  v_p_charged integer;
  v_p_allowed integer;
  v_cumul bigint := 0;
  v_waived integer;
  v_donors bigint;
  v_settled_now boolean := false;
begin
  select organization_id into v_org from public.donations where id = p_donation;
  if v_org is null then
    raise exception 'Don inconnu : %', p_donation using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('donivers-platform-fee:' || v_org::text, 0));

  select dn.id, dn.source, dn.vitrail_id, dn.platform_fee_cents, dn.platform_fee_waived_cents, dn.platform_fee_settled_at,
         dn.donor_contribution_cents, dn.contribution_surplus_cents
    into d from public.donations dn where dn.id = p_donation for update;
  if d.platform_fee_settled_at is not null then
    return query select d.platform_fee_waived_cents, d.contribution_surplus_cents, false, true;
    return;
  end if;

  select og.fee_schedule, og.fee_settled_at, og.fee_threshold_reached_at into o
    from public.organizations og where og.id = v_org for update;
  v_model := coalesce(o.fee_schedule->>'model', 'capped');
  v_cap := coalesce(case when jsonb_typeof(o.fee_schedule->'capCents') = 'number' then (o.fee_schedule->>'capCents')::bigint end, 49500);
  v_free := coalesce(case when jsonb_typeof(o.fee_schedule->'freeDonors') = 'number' then (o.fee_schedule->>'freeDonors')::bigint end, 100);
  v_counts := coalesce(case when jsonb_typeof(o.fee_schedule->'contributionCountsTowardCap') = 'boolean'
                then (o.fee_schedule->>'contributionCountsTowardCap')::boolean end, true);
  select v.kind = 'permanent' into v_principal from public.vitraux v where v.id = d.vitrail_id;

  -- Surplus réel : jamais plus que l'estimé (Stripe ne permet pas d'augmenter la commission après coup)
  v_s := d.contribution_surplus_cents;
  if p_stripe_fee_actual is not null then
    v_s := least(v_s, greatest(0, d.donor_contribution_cents - p_stripe_fee_actual));
  end if;
  v_p_charged := greatest(0, d.platform_fee_cents - d.contribution_surplus_cents);

  if d.source <> 'stripe' or not coalesce(v_principal, false) then
    v_p_allowed := v_p_charged; -- hors du vitrail principal : rien à corriger ici (campagnes : étape L2)
  elsif v_model = 'exempt' or o.fee_settled_at is not null then
    v_p_allowed := 0;
  else
    -- Cumul des autres dons déjà réglés (même définition que organization_billing), ce don exclu
    select coalesce(sum(case when v_counts
             then x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents
             else x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents
                  - case when x.platform_fee_cents - x.platform_fee_waived_cents > 0
                      then round(x.contribution_surplus_cents::numeric * (x.platform_fee_cents - x.platform_fee_waived_cents - x.platform_fee_refunded_cents)
                                 / (x.platform_fee_cents - x.platform_fee_waived_cents))::bigint
                      else 0 end
             end), 0)
      into v_cumul
      from public.donations x
      join public.vitraux v on v.id = x.vitrail_id and v.kind = 'permanent'
      where x.organization_id = v_org and x.source = 'stripe' and x.id <> p_donation and x.platform_fee_settled_at is not null;
    v_p_allowed := least(v_p_charged, greatest(0, v_cap - v_cumul - case when v_counts then v_s else 0 end))::integer;
  end if;

  v_waived := (v_p_charged - v_p_allowed) + (d.contribution_surplus_cents - v_s);

  update public.donations
     set platform_fee_waived_cents = v_waived,
         contribution_surplus_cents = v_s,
         stripe_fee_actual_cents = coalesce(p_stripe_fee_actual, stripe_fee_actual_cents),
         platform_fee_settled_at = now()
   where id = p_donation;

  -- Verrous (jamais retirés)
  if d.source = 'stripe' and coalesce(v_principal, false) and v_model <> 'exempt' and o.fee_settled_at is null
     and v_cumul + (case when v_counts then v_s else 0 end) + v_p_allowed >= v_cap then
    update public.organizations set fee_settled_at = now() where id = v_org and fee_settled_at is null;
    v_settled_now := found;
  end if;
  if o.fee_threshold_reached_at is null then
    select count(distinct dn.donor_id) into v_donors from public.donations dn
      where dn.organization_id = v_org and dn.source in ('stripe', 'cash', 'seed');
    if v_donors >= v_free then
      update public.organizations set fee_threshold_reached_at = now() where id = v_org and fee_threshold_reached_at is null;
    end if;
  end if;

  return query select v_waived, v_s, v_settled_now, false;
end;
$$;

revoke all on function public.settle_platform_fee(uuid, integer) from public, anon, authenticated;
grant execute on function public.settle_platform_fee(uuid, integer) to service_role;

-- ── 6. Studio ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Même signature : seuls changent la source du compteur de donateurs (organization_billing) et la commission nette,
-- qui retire maintenant l'excédent rendu. La commission nette est ce que garde Donivers (S + P, net de ce qui est rendu).

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
      (d.platform_fee_cents - d.platform_fee_waived_cents - d.platform_fee_refunded_cents)::bigint as fee
    from public.donations d
    join orgs on orgs.id = d.organization_id
    where d.source in ('stripe', 'cash', 'seed')
  ),
  dons as (
    select
      d.organization_id,
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
    coalesce(b.donors_counted, 0),
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
  left join public.organization_billing b on b.organization_id = orgs.id
  left join dons on dons.organization_id = orgs.id
  left join premiers on premiers.organization_id = orgs.id
  left join membres on membres.organization_id = orgs.id
  left join courriels on courriels.organization_id = orgs.id
$$;

revoke all on function public.studio_org_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.studio_org_stats(timestamptz) to service_role;
