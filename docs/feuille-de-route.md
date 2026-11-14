# Donivers — feuille de route et répartition

Source commune de « qui fait quoi ». Mise à jour dans la PR quand une tâche commence ou se termine (règles : `CLAUDE.md`).

**Échéance** : lancement bêta le **4 décembre 2026** (École d'art de Sutton + un 2e organisme, sur invitation).

## En cours

| Qui | Tâche | Branche | Fichiers principaux |
|---|---|---|---|
| Mika | Étape K1 : moteur de la nouvelle commission (seuil de 100 donateurs, plafond de 495 $) — démarre après l'accord sur le modèle d'affaires | `mika/k1-commission` | `lib/platform-fee.ts`, `lib/payments.ts`, `lib/refunds.ts`, webhook Stripe, migration : le numéro libre au moment de l'écrire (la 23 reste vide, voir « Règles qui durent ») |
| Mika | Studio : page « Parcours » (à traiter, organismes par étape, fiche), onglet Chiffres, fonction SQL des totaux ; textes restés sur « Plus » / « Mon vitrail » | `mika/studio` | `app/studio`, `components/studio/`, `lib/studio-stats.ts`, `app/api/studio`, migration `2026-11-25-studio-totaux` |
| Mika | Nouveau symbole « B » (5 pièces, plomb 2, lumière du vitrail), un seul symbole à toutes les tailles | `mika/logo-b` | `scripts/logo.py`, `public/brand/`, `components/plateforme/Brand.tsx`, `components/Signature.tsx`, `lib/shareImage.tsx`, `app/layout.tsx` |

## Prochaines tâches proposées pour Joaquim (avant le 4 décembre)

Choisies pour ne pas croiser le chemin critique (paiements, commission, migrations).

1. **Intégration continue** : action GitHub sur chaque PR qui lance `npm ci`, `npm run typecheck`, `npx eslint .`, `npm test`, `npm run check:i18n -- --strict`, `npx next build`. Valide le circuit complet (branche → aperçu → relecture → fusion). Ensuite, Mika rend ces vérifications obligatoires dans le ruleset de `main`.
2. **Mise en route locale documentée** : vérifier que `supabase start` + `supabase/schema.sql` donnent une base qui fonctionne, et écrire la marche à suivre (premier compte, compte Studio, démo) dans le README. Mettre à jour le README, qui décrit encore l'ancienne console (`ADMIN_CODE`, onglets).
3. **Courriels des aperçus** : sur un aperçu (`isPreviewEnv()` dans `lib/hosts.ts`), n'envoyer qu'aux adresses d'une liste permise (variable d'environnement) ; les autres vont au journal. Zone sensible : en parler avec Mika avant.
4. **Reprise visuelle** de l'inscription et de la connexion (pistes et maquettes d'abord, validées par Mika).
5. **Performance** : mesure réelle des pages publiques (vitrail, don, écran) et correctifs.

## Avant le 4 décembre (Mika)

- K1 : moteur de la commission. K2 : affichage (carte « Votre forfait », Réglages › Paiements, export), acceptation des conditions dans la console, avis au 100e donateur.
- Lancement de l'École : Stripe réel, coordonnées juridiques, `PAYMENT_MODE=stripe`, purge des dons de démo, « Mettre en ligne », forfait Supabase Pro.

## Règles qui durent

- **Numéros de migration** : une migration prend le numéro suivant de `supabase/migrations/` **au moment où on l'écrit**, jamais à l'avance pour une tâche planifiée. Les numéros suivent ainsi l'ordre d'application en production, et un rejeu depuis les fichiers (base locale, `schema.sql`) donne la même base. Un trou (la 23) est sans conséquence. Décision de Mika, 14 nov.
- **Captures du tiroir des outils de la démo** (`public/demo/console-*.png` et `public/demo/ecran-*.jpg`) : relancer `npm run captures:demo` après tout changement visible de la console (Accueil, Modération, barre d'onglets, textes) ou de l'écran de projection, et committer les images avec le changement. Le script rend les vraies pages avec les données fictives de la démo, sans base.

## Après le lancement (à répartir)

- L1 Paiement anticipé du solde · L2 Campagnes (création, clôture, fusion) · L3 Pro : facturation annuelle · L4 Remerciement personnalisé · L5 Domaine d'expéditeur · L6 Message d'impact · L7 Reçus fiscaux (avocat ; statut d'organisme de bienfaisance requis) · L8 Forme du vitrail (prototype sur 10 logos) · L9 Infolettre, rapports, rôles.
- Studio : passer de la piste C « Parcours » à la piste A (tableau, une ligne par organisme, chiffres en tête) quand il y aura plusieurs organismes — repère : au-delà d'environ 8 organismes en ligne ; « À traiter » et les colonnes d'accueil restent au-dessus (demande de Mika, 12 nov.).
- Plus petits : suppression demandée par le donateur depuis `/m`, nettoyage des photos sans don, animation de chargement, retrait des vérifications de schéma devenues inutiles (`lib/schema.ts`).

## Terminé récemment

- Écran jumelé de la démo (#12) : le QR de `/ecran` de la démo porte un code de séance ; les dons d'essai faits par ce QR n'apparaissent que sur cet écran (12 h, 60 par séance ; migration 26, table `demo_screen_pieces`, appliquée à donivers-test et en production le 14 nov.). Règles : migration d'ajout permise sur donivers-test avant la fusion (`CLAUDE.md`, section 4), numéro de migration pris au moment de l'écrire.
- Anglais : « donation » au lieu de « gift », « stained glass » en nom de matière (jamais « a stained glass », pas de « window »), « atelier » → « sandbox », tournures de la vitrine corrigées ; glossaire de `docs/i18n.md` à jour.
- Console : changement d'adresse du vitrail (Réglages › Adresse et site web ; libre en brouillon, 2 changements une fois en ligne, anciennes adresses gardées et redirigées ; migration 24, fonction `change_org_slug`) et « Plus » devenu « Réglages », menu groupé avec un écran par sujet (#7).
- Fiche du morceau (#5) : numéro et date d'arrivée (paliers ✦) au lieu du rang par montant, navigation dans l'ordre d'arrivée, « Un morceau au hasard », « Signaler » discret ; vitrail de la vitrine fixe sur téléphone.
- Vitrine nuit puis papier : sections alternées, vitrail de la démo et rayons de l'affiche au passage, cadre « Essayez-le », bande des garanties ; sur téléphone, le vitrail suit le titre.
- Outils de la démo : bandeau « tout est fictif » et tiroir des outils de l'organisme sur /vitrail de la démo (écran, console, image de partage, affiche, courriel) ; captures par `npm run captures:demo`.
- `schema.sql` régénéré par rejeu complet (migrations jusqu'à la 22) ; migration 22 : droits des fonctions de déclencheur alignés sur `schema.sql` (appliquée sur donivers-test et en production le 11 nov.).

- Bilingue, multi-organismes, Stripe Connect, comptes, atelier, vitrine, démo, marque (palette, logo, signature), image de partage, affiche « La place libre », vitrine au nouveau modèle d'affaires (`09b7269`).
