# Vitrail de dons — École d'art de Sutton

Un grand écran affiche le vitrail de l'école et se met à jour à chaque nouveau don. Un QR code permet de donner depuis son téléphone et de voir aussitôt son morceau de verre s'ajouter. Un seul vitrail cumulatif : chaque don est rattaché à un événement (total et objectif par événement).

Produit séparé de Pay to Exist : son propre déploiement, sa propre base de données, son propre compte de paiement. Le pavage (`lib/tiling.ts`) et le rendu du verre (`lib/glass.ts`) viennent de Pay to Exist.

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis remplir (voir ci-dessous)
npm run dev
```

1. **Supabase** : créer un projet neuf, ouvrir *SQL Editor*, lancer le contenu de `supabase/schema.sql`. Copier l'URL du projet et la clé de service dans `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
2. **Console** : définir `ADMIN_CODE` et `SESSION_SECRET` (32 caractères ou plus), puis ouvrir `/admin`, créer un événement et le mettre « en cours ».
3. **Écran** : ouvrir `/ecran` (touche F ou clic pour le plein écran).
4. **Don** : ouvrir `/` sur un téléphone, ou dans un autre onglet.

| Page | Rôle |
|---|---|
| `/` | Parcours de don mobile (QR code de l'écran) |
| `/merci` | Remerciement : le morceau du donateur, cerclé d'or |
| `/m/[lien]` | Lien magique : modifier nom, message, couleur, ou agrandir son morceau |
| `/ecran` | Affichage plein écran : vitrail, total, objectif, QR code, annonce de chaque don |
| `/admin` | Console : masquer, don comptant, événements, outils |

`/ecran?url=https://…` change l'adresse encodée dans le QR code (utile en test sur le réseau local, où `localhost` ne marche pas depuis un téléphone).

## Modes de paiement

`PAYMENT_MODE` choisit le fournisseur. **Le mode démo n'enregistre aucun paiement** : il sert à présenter l'outil à l'école. Il affiche un bandeau « MODE DÉMO » sur l'écran et sur la page de don, et marque les dons `demo`. Avant l'événement, l'onglet *Outils* de la console supprime tous les dons de démo.

- **demo** : le don est enregistré tout de suite, sans paiement.
- **stripe** : Stripe Checkout (carte, Apple Pay, Google Pay), en dollars canadiens. Avec les clés de test (`sk_test_…`), aucun argent réel.
  - En local : `stripe listen --forward-to localhost:3000/api/webhook/stripe`, puis copier le secret `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
  - En ligne : créer un point de terminaison webhook vers `https://<domaine>/api/webhook/stripe` pour l'événement `checkout.session.completed`.
- **off** : paiements désactivés.

Tout ce qui touche le fournisseur est dans `lib/payments.ts`. Pour passer à Square, ajouter un fournisseur qui renvoie une URL de paiement et appelle `recordDonation()` à la confirmation : le reste ne bouge pas.

**Production** : les clés Stripe de l'école vont dans les variables d'environnement du déploiement, jamais celles d'un compte personnel. Sinon les dons deviennent un revenu de la personne titulaire du compte.

## Comment ça marche

- **Identité sans compte** : le courriel donné au paiement identifie le donateur. Un nouveau don avec le même courriel agrandit le même morceau. Le nom, le message et la couleur ne se changent que par lien magique (courriel), jamais en retapant un courriel : quelqu'un qui saisit le courriel d'un autre ne fait qu'ajouter de l'argent à son morceau.
- **Consentement** : le nom n'est affiché que si le donateur le demande (case non cochée par défaut). Sinon : « Anonyme », sans message. Le courriel n'est jamais exposé par l'API publique.
- **Temps réel** : l'écran interroge `/api/vitrail` toutes les 3 s plutôt que de garder une connexion ouverte (plus fiable sur un Wi-Fi d'événement). Il garde le dernier état en mémoire locale, affiche « connexion perdue » et se resynchronise tout seul. Écran maintenu allumé (Wake Lock), rechargement automatique toutes les 6 h.
- **Taille des morceaux** (`lib/config.ts`) : l'aire suit `montant ^ 0,5` avec un plancher à 40 % de la taille moyenne. Simulé avec 250 donateurs (médiane 24 $, de 5 $ à 302 $) sur un écran 1080p : le plus petit morceau mesure 38 px, le plus grand 103 px ; en strictement linéaire, 20 px et 158 px. Avec 1000 donateurs, le plus petit tombe à 19 px.
- **Modération** : *Masquer* retire le morceau de l'écran en 3 s ; l'argent reste compté dans les totaux. *Effacer le nom* garde le morceau mais le rend anonyme. Les liens sont refusés dans le nom et le message.
- **Reçus fiscaux** : l'école n'est pas encore un organisme enregistré. La page de don et le courriel de confirmation le disent. Plus tard : ajouter adresse, numéro de reçu (sur `donors` et `donations`).

## Photos et aperçu

- À la page de don, le donateur peut ajouter une photo (recadrée en carré et réduite à ≤ 768 px dans son navigateur, JPEG ≤ 700 Ko). Elle n'est affichée que s'il consent à afficher son nom.
- Un **aperçu** montre le vrai vitrail avec le morceau à venir (taille, couleur, nom, message, photo), cerclé d'or. La position exacte peut bouger quand d'autres dons arrivent.
- Sur l'écran, comme dans Pay to Exist : plus le morceau est grand, plus il montre (couleur → photo → nom → message). Seuils réglables dans `lib/config.ts` (`photoColorFromPx`, `photoColorToPx`).
- **Base de données** : exécuter `supabase/migrations/2026-10-31-photos.sql` dans le SQL Editor de Supabase (colonne `photo_url` + bucket public `photos`). Un nouveau projet qui part de `supabase/schema.sql` l'a déjà.
- **Modération** : la console admin affiche les photos et permet « Retirer la photo » ou « Effacer le nom » (efface aussi la photo). À prévoir avant l'événement : quelqu'un qui surveille la console.

## Visite de l'écran (brillance + zoom)

Sur `/ecran`, un morceau est **toujours** en brillance. Le cycle : vue d'ensemble du vitrail (le prochain morceau s'allume déjà) → zoom sur le morceau (les petits sont zoomés jusqu'à occuper environ 20 % de la hauteur de l'écran, les grands ne bougent pas) → pause → dézoom complet → morceau suivant. L'ordre est aléatoire sans répétition avant que tous soient passés ; un nouveau don passe en premier (après au plus quelques secondes). Les morceaux anonymes ont une pause plus courte. Les durées sont dans `lib/config.ts` (`tour…`).

Les noms et messages sont toujours placés **à l'intérieur** du morceau, avec une marge : la police est réduite jusqu'à ce que chaque ligne tienne dans le cercle utile du morceau, et rien ne s'affiche si ça ne rentre pas.

## Le jour J

- Ordinateur de l'écran **sur câble Ethernet** si possible ; sinon Wi-Fi + partage de connexion en plan B.
- `/ecran` en plein écran, avec le bon `NEXT_PUBLIC_SITE_URL` (le QR code encode cette adresse). Tester le QR avec un téléphone en données cellulaires, pas sur le Wi-Fi de l'école.
- Le Wi-Fi sera saturé par ~2000 visiteurs : la page de don est légère, et le paiement se fait sur la page hébergée de Stripe.
- Dons de démo supprimés, événement en cours défini, objectif réglé, vitrail amorcé (dons « Amorçage » entrés depuis la console).
- Une personne avec la console `/admin` ouverte sur un téléphone, pour masquer en direct.

## À valider avec l'école

Nom et identité visuelle de l'édition, montants suggérés et objectif (`lib/config.ts`), dates des deux fins de semaine, affichage des messages sur l'écran (`showMessagesOnScreen`), matériel (écran, ordinateur, réseau, affiches avec QR code).

## Développement

```bash
npm run typecheck && npm run lint && npm run build
```
