-- Litiges (contestations de paiement par carte) sur les dons Stripe.
--
-- Un litige ouvert ne change pas le morceau (il reste affiché, marqué « contesté » dans la console).
-- Un litige perdu se traite comme un remboursement : `refunded_cents` (part du DON reprise au donateur, par remboursement
-- OU litige perdu) est recalculé à partir de ce que Stripe a remboursé + `dispute_lost_cents`. Les vues du vitrail, qui
-- utilisent amount_cents - refunded_cents, n'ont donc pas à changer. Notre commission est rendue au prorata (décision de Mika).
--
-- dispute_lost_cents est un montant du PAIEMENT (don + frais couverts), comme le montant du litige chez Stripe.
--
-- Additive, à exécuter UNE seule fois par base, après 2026-11-07-stripe-connect.sql. D'abord sur donivers-test.

alter table public.donations
  add column dispute_id text,
  add column dispute_status text check (dispute_status in ('open', 'won', 'lost')),
  add column dispute_due_by timestamptz,
  add column dispute_lost_cents int not null default 0 check (dispute_lost_cents >= 0);

create index donations_dispute_open_idx on public.donations (organization_id) where dispute_status = 'open';
