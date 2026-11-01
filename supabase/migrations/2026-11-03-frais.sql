-- Frais couverts : le donateur peut ajouter les frais de transaction à son don. Ils sont payés, mais restent hors
-- du montant du don (amount_cents) : la taille du morceau et le total affiché gardent des chiffres ronds.
-- Total réellement encaissé = sum(amount_cents + fee_cents) ; Stripe prélève ensuite ses frais sur ce total.
-- À exécuter une fois dans le SQL Editor de Supabase (sans danger si on le relance).
alter table donations add column if not exists fee_cents integer not null default 0 check (fee_cents >= 0);
