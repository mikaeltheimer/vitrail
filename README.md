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

## Ajouts du 1er novembre 2026

**À faire une fois dans Supabase (SQL Editor) :** `supabase/migrations/2026-11-01-moderation-provenance.sql` (statut des photos, réglages, provenance des dons, visites). Sans elle, le site ne fonctionne plus.

- **Vitrail en ligne** : `/vitrail`, sur téléphone ou ordinateur. On glisse, on pince (ou molette) pour zoomer, on touche un morceau pour voir nom, montant, message et photo ; recherche par nom ; bouton « Ajouter mon morceau ». Après un don, la page merci y mène directement, centrée sur le morceau du donateur (`/vitrail?d=…`). Sert aussi à promouvoir la collecte en ligne (métadonnées de partage incluses).
- **Page merci** : « Regardez le grand écran! » — le nouveau don y passe en priorité.
- **Modération** : filtre de mots grossiers (français, sacres québécois, anglais) sur les noms et messages (`lib/profanity.ts`). Photos : interrupteur **Live / Modération** dans la console (onglet En direct). En modération, chaque nouvelle photo attend « Approuver » ; le nom et le message passent tout de suite.
- **Page de don** : « 80 personnes ont déjà leur morceau » ; « La plupart des gens donnent 25 $ » (médiane des morceaux, à partir de 8 donateurs) avec ce montant présélectionné ; case « J'ajoute 1,06 $ pour couvrir les frais » (2,9 % + 0,30 $, réglable dans `lib/config.ts`). Le montant enregistré est ce que le donateur a payé, frais compris.
- **Écran** : la pause « Faites partie du vitrail » affiche la norme (« La plupart donnent 25 $ ») et le nombre de morceaux ; un nouveau don interrompt la pause.
- **Affiches** : `/affiche` crée une affiche imprimable (format lettre) par emplacement, chacune avec son code QR (`?src=cafe`…). Le QR de l'écran porte `?src=ecran`. Onglet **Provenance** de la console : visites, dons, conversion et montant par emplacement.
- **Confidentialité** : `/confidentialite` (Loi 25), avec des passages **[À COMPLÉTER]** surlignés à remplir par l'école.
- **Moins de friction** : plus de champ courriel sur la page de don (Stripe le demande au paiement, et il sert toujours à reconnaître un donateur qui revient) ; bouton « Donner » collé en bas de l'écran du téléphone. Sans choix du donateur, la couleur du verre est tirée au hasard.
- **Limites de requêtes** relevées : à un événement, des centaines de téléphones partagent la même adresse IP.

## Photos et aperçu

- À la page de don, le donateur peut ajouter une photo (recadrée en carré et réduite à ≤ 768 px dans son navigateur, JPEG ≤ 700 Ko). Elle n'est affichée que s'il consent à afficher son nom.
- Un **aperçu** montre le vrai vitrail avec le morceau à venir (taille, couleur, nom, message, photo), cerclé d'or. La position exacte peut bouger quand d'autres dons arrivent.
- Sur l'écran, comme dans Pay to Exist : plus le morceau est grand, plus il montre (couleur → photo → nom → message). Seuils réglables dans `lib/config.ts` (`photoColorFromPx`, `photoColorToPx`).
- **Base de données** : exécuter `supabase/migrations/2026-10-31-photos.sql` dans le SQL Editor de Supabase (colonne `photo_url` + bucket public `photos`). Un nouveau projet qui part de `supabase/schema.sql` l'a déjà.
- **Modération** : la console admin affiche les photos et permet « Retirer la photo » ou « Effacer le nom » (efface aussi la photo). À prévoir avant l'événement : quelqu'un qui surveille la console.

## Visite de l'écran (brillance + sortie du vitrail)

Sur `/ecran`, un morceau est **toujours** en brillance, et le vitrail ne bouge jamais (pas de zoom). Le cycle : le prochain morceau pulse en place (1 s) → s'il est petit, il **sort du vitrail** et s'agrandit au-dessus (ombre portée, reste du vitrail assombri) pendant que l'annonce apparaît → pause → il retourne à sa place → suivant. Les grands morceaux ne sortent pas : ils pulsent et l'annonce s'affiche.

L'annonce est **écrite sur le morceau agrandi** : « Merci à / nom / montant / au total / message » (ou « nom / vient de donner / montant » pour un don tout neuf), sur la photo si le donateur en a une (la photo garde alors un voile coloré du verre, légèrement assombri, avec un halo sombre derrière le texte pour rester lisible, même sur une photo très claire). Le morceau sorti vient se placer au centre de l'écran. Si tout le texte ne tient pas sur la forme du morceau (par exemple une lamelle très étroite), l'encart habituel (photo, nom, montant, message) s'affiche à la place. L'ordre est aléatoire sans répétition avant que tous soient passés ; un nouveau don passe en premier. Durées et taille de sortie : `lib/config.ts` (`tour…`).

Les noms et messages sur le verre sont toujours placés **à l'intérieur** du morceau, avec une marge : la police est réduite jusqu'à ce que chaque ligne tienne dans le cercle utile du morceau, et rien ne s'affiche si ça ne rentre pas.

## Appel à donner

Toutes les 6 mises en vedette (`ctaEvery` dans `lib/config.ts`, 0 = jamais), l'écran fait une pause de 9 s : le vitrail s'assombrit, le code QR pulse, et une carte dit « Faites partie du vitrail — Chaque don devient un morceau de verre », avec trois carrés de 10 $, 25 $ et 100 $ dessinés à l'échelle (leur taille suit `sizeExponent`) et le rappel « Dès 5 $ ». Un nouveau don passe toujours avant la pause. Le texte est dans `app/ecran/page.tsx`.

## Typographie

Une seule famille, **Space Grotesk**, auto-hébergée (paquet `@fontsource/space-grotesk`, aucune requête externe : l'écran n'en dépend pas du Wi-Fi), en plusieurs graisses : demi-gras pour les noms, gras pour les montants et les titres, romain pour les messages, et capitales espacées pour les petites mentions (« MERCI À », « AU TOTAL »). Couleurs chaudes : crème pour les noms, or pâle pour les montants, avec un fin contour sombre pour la lisibilité sur n'importe quel verre. Les définitions sont dans `lib/fonts.ts` (familles) et `lib/render.ts` (`LABEL_STYLE` : tailles, graisses, couleurs, espacement).

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
