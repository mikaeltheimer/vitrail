# Donivers — feuille de route et répartition

Source commune de « qui fait quoi ». Mise à jour dans la PR quand une tâche commence ou se termine (règles : `CLAUDE.md`).

**Échéance** : lancement bêta le **4 décembre 2026** (École d'art de Sutton + un 2e organisme, sur invitation).

## En cours

| Qui | Tâche | Branche | Fichiers principaux |
|---|---|---|---|
| Mika | Écran : visite sans morceaux vides ; question gardée avec le témoignage (jusqu'à 3 questions) ; démo « Centre communautaire du Village » — migration `2026-11-21-question-temoignage`, K1 prendra la suivante | `mika/cycle-ecran` | `app/ecran/page.tsx`, `lib/stageDeck.ts`, `lib/demo-data.ts`, `components/vitrail/QuestionPicker.tsx`, `lib/donations.ts`, `lib/identity-shared.ts` |
| Mika | Étape K1 : moteur de la nouvelle commission (seuil de 100 donateurs, plafond de 495 $) — démarre après l'accord sur le modèle d'affaires | `mika/k1-commission` | `lib/platform-fee.ts`, `lib/payments.ts`, `lib/refunds.ts`, webhook Stripe, migration 21 |

## Prochaines tâches proposées pour Joaquim (avant le 4 décembre)

Choisies pour ne pas croiser le chemin critique (paiements, commission, migrations).

1. **Intégration continue** : action GitHub sur chaque PR qui lance `npm ci`, `npm run typecheck`, `npx eslint .`, `npm test`, `npm run check:i18n -- --strict`, `npx next build`. Valide le circuit complet (branche → aperçu → relecture → fusion). Ensuite, Mika rend ces vérifications obligatoires dans le ruleset de `main`.
2. **Mise en route locale documentée** : vérifier que `supabase start` + `supabase/schema.sql` donnent une base qui fonctionne, et écrire la marche à suivre (premier compte, compte Studio, démo) dans le README. Mettre à jour le README, qui décrit encore l'ancienne console (`ADMIN_CODE`, onglets).
3. **Courriels des aperçus** : sur un aperçu (`isPreviewEnv()` dans `lib/hosts.ts`), n'envoyer qu'aux adresses d'une liste permise (variable d'environnement) ; les autres vont au journal. Zone sensible : en parler avec Mika avant.
4. **Reprise visuelle** de l'inscription, de la connexion et de Studio (pistes et maquettes d'abord, validées par Mika).
5. **Performance** : mesure réelle des pages publiques (vitrail, don, écran) et correctifs.

## Avant le 4 décembre (Mika)

- K1 : moteur de la commission. K2 : affichage (carte « Votre forfait », Réglages › Paiements, export), acceptation des conditions dans la console, avis au 100e donateur.
- Lancement de l'École : Stripe réel, coordonnées juridiques, `PAYMENT_MODE=stripe`, purge des dons de démo, « Mettre en ligne », forfait Supabase Pro.

## Après le lancement (à répartir)

- L1 Paiement anticipé du solde · L2 Campagnes (création, clôture, fusion) · L3 Pro : facturation annuelle · L4 Remerciement personnalisé · L5 Domaine d'expéditeur · L6 Message d'impact · L7 Reçus fiscaux (avocat ; statut d'organisme de bienfaisance requis) · L8 Forme du vitrail (prototype sur 10 logos) · L9 Infolettre, rapports, rôles.
- Plus petits : suppression demandée par le donateur depuis `/m`, nettoyage des photos sans don, animation de chargement, retrait des vérifications de schéma devenues inutiles (`lib/schema.ts`).

## Terminé récemment

- Bilingue, multi-organismes, Stripe Connect, comptes, atelier, vitrine, démo, marque (palette, logo, signature), image de partage, affiche « La place libre », vitrine au nouveau modèle d'affaires (`09b7269`).
