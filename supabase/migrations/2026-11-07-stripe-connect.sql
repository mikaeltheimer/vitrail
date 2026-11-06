-- Stripe Connect (option A : paiements directs sur le compte de l'organisme, qui paie lui-même les frais de Stripe).
-- Studio Existence ne prélève que sa commission (application_fee) : 2,8 % du don, puis 0,5 % une fois 5 000 $ de
-- commissions cumulées pour l'organisme (à vie). Une commission remboursée est retranchée du cumul.
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-06-multi-organismes.sql. D'abord sur donivers-test.

-- La grille de l'organisme (négociable au cas par cas) : taux de base, seuil (en cents de commissions cumulées), taux après le seuil
alter table public.organizations
  add column fee_schedule jsonb not null
    default '{"rate": 0.028, "tierAfterCents": 500000, "tierRate": 0.005}'::jsonb;

-- Commission perçue sur chaque don, et la part déjà rendue à l'organisme (remboursement)
alter table public.donations
  add column platform_fee_cents int not null default 0 check (platform_fee_cents >= 0),
  add column platform_fee_refunded_cents int not null default 0 check (platform_fee_refunded_cents >= 0),
  add constraint donations_fee_refund_le_fee check (platform_fee_refunded_cents <= platform_fee_cents);

-- Commissions cumulées nettes par organisme : ce qui décide du palier
create view public.organization_fee_totals with (security_invoker = true) as
  select o.id as organization_id,
         coalesce(sum(d.platform_fee_cents - d.platform_fee_refunded_cents), 0)::bigint as fees_cents
  from public.organizations o
  left join public.donations d on d.organization_id = o.id
  group by o.id;
revoke all on public.organization_fee_totals from anon, authenticated;
