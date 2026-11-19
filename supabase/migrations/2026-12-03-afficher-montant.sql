-- Afficher ou masquer le montant collecté sur le vitrail (Mika, 19 nov. 2026). Un réglage par vitrail : le permanent
-- aujourd'hui (atelier), chaque vitrail de campagne plus tard. Vrai par défaut : rien ne change pour les vitraux en ligne.
-- Un vitrail avec un objectif affiche toujours le montant (le code l'impose, pas la base).
-- Ajoute seulement ; se relance sans danger.
alter table public.vitraux add column if not exists show_total boolean not null default true;
