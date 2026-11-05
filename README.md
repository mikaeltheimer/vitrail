# Donivers — le Donivers de l'École d'art de Sutton

**Donivers** (don + univers) — *La plateforme de dons de votre communauté.* · *Chaque don, un morceau d'univers.* Un produit de Studio Existence. Chaque organisme a son donivers ; un donivers contient un ou plusieurs **vitraux** (le format visuel). Branding : voir « Marque » plus bas.

Un grand écran affiche le vitrail de l'école et se met à jour à chaque nouveau don. Un QR code permet de donner depuis son téléphone et de voir aussitôt son morceau de verre s'ajouter. Un seul vitrail cumulatif : chaque don est rattaché à un événement (total et objectif par événement).

Chaque donivers a son propre déploiement, sa propre base de données et son propre compte de paiement. Le pavage est dans `lib/tiling.ts`, le rendu du verre dans `lib/glass.ts`.

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis remplir (voir ci-dessous)
npm run dev
```

1. **Supabase** : créer un projet neuf, ouvrir *SQL Editor*, lancer le contenu de `supabase/schema.sql`. Copier l'URL du projet et la clé de service dans `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
2. **Console** : définir `ADMIN_CODE` et `SESSION_SECRET` (32 caractères ou plus), puis ouvrir `/admin`, créer un événement et le mettre « en cours ».
3. **Écran** : ouvrir `/ecran` (touche F ou clic pour le plein écran).
4. **Don** : ouvrir `/vitrail` (ou `/don`, le formulaire mobile) sur un téléphone, ou dans un autre onglet.

| Page | Rôle |
|---|---|
| `/` | Redirige vers `/vitrail` |
| `/don` | Parcours de don mobile (affiches à code QR) |
| `/merci` | Remerciement : le morceau du donateur, cerclé d'or |
| `/m/[lien]` | Lien magique : modifier nom, message, couleur, ou agrandir son morceau |
| `/ecran` | Affichage plein écran : vitrail, total, objectif, QR code, annonce de chaque don |
| `/screen` | Même affichage, en anglais (voir `docs/i18n.md`) ; `/ecran` reste en français |
| `/confidentialite`, `/conditions` | Politique de confidentialité et conditions d'utilisation (FR/EN) ; coordonnées de l'organisme dans `CONFIG.legal` |
| `/admin` | Console : masquer, don comptant, événements, outils (en français seulement) |

`/ecran?url=https://…` change l'adresse encodée dans le QR code (utile en test sur le réseau local, où `localhost` ne marche pas depuis un téléphone).

## Langues (français et anglais)

Le site est bilingue : le français est la langue source et reste obligatoire, l'anglais est actif par défaut (`NEXT_PUBLIC_ENGLISH=0` le coupe). La langue vient de `?lang=`, puis du cookie `donivers_lang`, puis du navigateur ; un sélecteur FR/EN est dans l'en-tête et le pied de page. Les textes sont dans `messages/fr.json` et `messages/en.json` (`npm run check:i18n` vérifie la parité et signale le français laissé en dur ; `--strict` fait échouer le contrôle). Glossaire et conventions : `docs/i18n.md`.

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

- **Vitrail en ligne** : `/vitrail`, la rosace. En-tête : logo, nombre de morceaux, bouton doré « Ajouter mon morceau ». Ordinateur : « Derniers dons » en haut à gauche ; colonne de gauche avec recherche, « Rencontrer quelqu'un », « Trouver mon morceau » et la mini-carte (cliquer pour y aller, faire glisser le cadre, tout voir, zoom, ← → par rang) ; fiche à droite ; aperçu au survol. Téléphone : bouton doré flottant, « Rencontrer quelqu'un » en bas à gauche, mini-carte et zoom en bas à droite, un toucher choisit et un second ouvre la fiche (feuille à glisser). **Don sur place** : « Ajouter mon morceau » ouvre le panneau de don (montant au curseur, part du vitrail, rang, frais couverts, couleur, nom, photo, message) et le morceau d'aperçu apparaît en direct dans le vitrail, cadré dans l'espace libre ; `/vitrail?don` l'ouvre directement (lien à partager en ligne). Paiement chez Stripe, puis **retour sur le vitrail comme dans Pay to Exist** : bandeau « Merci », vol jusqu'au nouveau morceau, lien pour le modifier ; une annulation rouvre le panneau avec tout ce qui avait été saisi (montant, nom, photo, message). Aussi : ouverture en travelling (`?intro` pour la revoir), dérive au repos, partage, signalement, annonce d'un nouveau don. Lien direct vers un morceau : `/vitrail?d=<id>`.
- **Identité de l'école** : logo (`public/ecole-logo.png`, `public/ecole-mark.png`, versions blanches sur fond transparent) dans l'en-tête du vitrail, sur la page de don et sur l'écran. En-tête du vitrail : « 4 944 $ amassés sur 10 000 $ · 80 donateurs » avec barre de progression (objectif de l'événement en cours, réglé dans la console). Panneau **« À propos de la collecte »** : l'école, pourquoi donner (aucune subvention gouvernementale ; le bâtiment, les loyers, l'électricité, le matériel), comment ça marche, lien vers ecoleartsutton.ca. Le panneau de don rappelle où va l'argent. Textes dans `lib/config.ts` (`orgAbout`, `orgWhy`, `orgUrl`). Image d'aperçu des liens partagés : `/vitrail/opengraph-image` (logo, appel, total amassé ; mise à jour toutes les 5 min).
- **Courriels** (reçu, lien personnel ; HTML + texte, FR/EN) : `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` (adresse sur un domaine vérifié chez Resend ; l'expéditeur affiche le nom de l'organisme, les réponses vont à l'organisme). Suivi des envois : exécuter `supabase/migrations/2026-11-05-journal-courriels.sql`, puis déclarer chez Resend (Webhooks) l'adresse `/api/webhook/resend` avec les événements envoyé, livré, retardé, rebond, plainte, et mettre son secret dans `RESEND_WEBHOOK_SECRET`. Un courriel qui échoue ne bloque jamais un don ni une demande de lien.
- **Rappel du lendemain** : un seul courriel par donateur, 20 à 72 h après son dernier don (don payé, sans témoignage, morceau non masqué, adresse sans rebond), pour l'inviter à ajouter un témoignage. Vercel Cron lance `/api/cron/reminders` chaque jour à 14 h UTC (`vercel.json`) ; il faut `CRON_SECRET` (longue chaîne aléatoire) dans les variables de production, et le journal des courriels. `REMINDERS_ENABLED=0` coupe les rappels. Connecté à `/admin`, ouvrir `/api/cron/reminders` dans le navigateur fait un essai à blanc (nombre de rappels et adresses masquées, rien d'envoyé) ; `?send=1` l'envoie pour de vrai. 50 rappels au plus par passage.
- **Langue du donateur** : exécuter `supabase/migrations/2026-11-05-langue-donateur.sql` (colonne `donors.locale`, pour écrire au donateur dans sa langue). Sans elle, le site fonctionne : le reçu part dans la langue choisie au paiement et le lien personnel dans celle de la page où il est demandé.
- **Signalements** : exécuter aussi `supabase/migrations/2026-11-02-signalements.sql`. Les morceaux signalés apparaissent en tête de l'onglet En direct de la console (Masquer, Effacer le contenu, Sans suite).
- **Page merci** : « Regardez le grand écran! » — le nouveau don y passe en priorité.
- **Modération** : filtre de mots grossiers (français, sacres québécois, anglais) sur les noms et messages (`lib/profanity.ts`). Photos : interrupteur **Live / Modération** dans la console (onglet En direct). En modération, chaque nouvelle photo attend « Approuver » ; le nom et le message passent tout de suite.
- **Témoignages** : le message d'un morceau devient un témoignage (500 caractères) : « Pourquoi soutenez-vous l'École d'art ? Ajoutez votre témoignage. » (question, appel et exemple du champ dans `ORG.fr.testimonial` / `ORG.en.testimonial`, `lib/config.ts`, à adapter par organisme). Bien en vue dans le panneau de don, sous le montant, puis de nouveau **après le paiement** (bandeau « Merci » : « Publier mon témoignage » ou « Plus tard » avec le lien de modification), sur `/merci`, `/m/<lien>` et dans le courriel de confirmation. Le verre en montre le début ; l'écran l'affiche en entier (carte élargie, temps de lecture ajouté, témoignages deux fois plus souvent dans la visite). Case de consentement à la citation (Loi 25). Modéré comme les photos (console : Photos et témoignages). **Exécuter `supabase/migrations/2026-11-04-temoignages.sql`** (sans elle, le site fonctionne, mais sans modération ni consentement).
- **Accueil** : `/` mène au vitrail (`/vitrail`). La page de don classique est sur `/don` (les anciens liens `/?t=…` et `/?annule=1` y sont renvoyés).
- **Page de don** (`/don`) : « 80 personnes ont déjà leur morceau » ; « La plupart des gens donnent 25 $ » (médiane des morceaux, à partir de 8 donateurs) avec ce montant présélectionné ; case « J'ajoute 1,06 $ pour couvrir les frais » (2,9 % + 0,30 $, réglable dans `lib/config.ts`). Les frais couverts sont payés mais enregistrés à part (`fee_cents`) : le morceau, son rang et le total affiché ne comptent que le don, en chiffres ronds. Total réellement encaissé = `amount_cents + fee_cents`. **Exécuter `supabase/migrations/2026-11-03-frais.sql`** (sans elle, les dons sont enregistrés sans le détail des frais).
- **Écran** : la pause « Faites partie du vitrail » affiche la norme (« La plupart donnent 25 $ ») et le nombre de morceaux ; un nouveau don interrompt la pause.
- **Affiches** : `/affiche` crée une affiche imprimable (format lettre) par emplacement, chacune avec son code QR (`?src=cafe`…). Le QR de l'écran porte `?src=ecran`. Onglet **Provenance** de la console : visites, dons, conversion et montant par emplacement.
- **Confidentialité** : `/confidentialite` (Loi 25), avec des passages **[À COMPLÉTER]** surlignés à remplir par l'école.
- **Place dans le vitrail** : sous le montant, « Votre morceau serait plus grand que 50 % des morceaux du vitrail », et une suggestion cliquable vers le montant suivant (« À 50 $, il dépasserait 68 % d'entre eux. »). Affiché à partir de 5 morceaux ; ne compte pas les frais couverts et, avec un lien magique, tient compte de ce que le donateur a déjà donné.
- **Moins de friction** : plus de champ courriel sur la page de don (Stripe le demande au paiement, et il sert toujours à reconnaître un donateur qui revient) ; bouton « Donner » collé en bas de l'écran du téléphone. Sans choix du donateur, la couleur du verre est tirée au hasard.
- **Limites de requêtes** relevées : à un événement, des centaines de téléphones partagent la même adresse IP.

## Photos et aperçu

- À la page de don, le donateur peut ajouter une photo (recadrée en carré et réduite à ≤ 768 px dans son navigateur, JPEG ≤ 700 Ko). Elle n'est affichée que s'il consent à afficher son nom.
- Un **aperçu** montre le vrai vitrail avec le morceau à venir (taille, couleur, nom, message, photo), cerclé d'or. La position exacte peut bouger quand d'autres dons arrivent.
- Sur l'écran : plus le morceau est grand, plus il montre (couleur → photo → nom → message). Seuils réglables dans `lib/config.ts` (`photoColorFromPx`, `photoColorToPx`).
- **Base de données** : exécuter `supabase/migrations/2026-10-31-photos.sql` dans le SQL Editor de Supabase (colonne `photo_url` + bucket public `photos`). Un nouveau projet qui part de `supabase/schema.sql` l'a déjà.
- **Modération** : la console admin affiche les photos et permet « Retirer la photo » ou « Effacer le nom » (efface aussi la photo). À prévoir avant l'événement : quelqu'un qui surveille la console.

## Visite de l'écran (brillance + sortie du vitrail)

Sur `/ecran`, un morceau est **toujours** en brillance, et le vitrail ne bouge jamais (pas de zoom). Le cycle : le prochain morceau pulse en place (1 s) → s'il est petit, il **sort du vitrail** et s'agrandit au-dessus (ombre portée, reste du vitrail assombri) pendant que l'annonce apparaît → pause → il retourne à sa place → suivant. Les grands morceaux ne sortent pas : ils pulsent et l'annonce s'affiche.

L'annonce est **écrite sur le morceau agrandi** : « Merci à / nom / montant / au total / message » (ou « nom / vient de donner / montant » pour un don tout neuf), sur la photo si le donateur en a une (la photo garde alors un voile coloré du verre, légèrement assombri, avec un halo sombre derrière le texte pour rester lisible, même sur une photo très claire). Le morceau sorti vient se placer au centre de l'écran. Si tout le texte ne tient pas sur la forme du morceau (par exemple une lamelle très étroite), l'encart habituel (photo, nom, montant, message) s'affiche à la place. L'ordre est aléatoire sans répétition avant que tous soient passés ; un nouveau don passe en premier. Durées et taille de sortie : `lib/config.ts` (`tour…`).

Les noms et messages sur le verre sont toujours placés **à l'intérieur** du morceau, avec une marge : la police est réduite jusqu'à ce que chaque ligne tienne dans le cercle utile du morceau, et rien ne s'affiche si ça ne rentre pas.

## Appel à donner

Toutes les 6 mises en vedette (`ctaEvery` dans `lib/config.ts`, 0 = jamais), l'écran fait une pause de 9 s : le vitrail s'assombrit, le code QR pulse, et une carte dit « Faites partie du vitrail — Chaque don devient un morceau de verre », avec trois carrés de 10 $, 25 $ et 100 $ dessinés à l'échelle (leur taille suit `sizeExponent`) et le rappel « Dès 5 $ ». Un nouveau don passe toujours avant la pause. Le texte est dans `app/ecran/page.tsx`.

## Écran de projection

`/ecran` : la rosace du vitrail en ligne, en visite automatique pour un écran d'événement. La caméra s'envole d'un morceau à l'autre (au hasard, chacun passe avant qu'un autre revienne), le met en lumière (le reste s'assombrit, son contour pulse dans sa couleur) et une carte montre son contenu : photo (ou sa pièce de verre), nom, message. Le morceau est centré à l'écran, cadré pour ne passer ni sous la carte ni sous le code QR. **Aucun montant individuel** : la taille du verre en dit assez. Un nouveau don passe en premier (« ✦ Vient de donner »). Toutes les 6 visites, retour au vitrail entier avec « Faites partie du vitrail » et le code QR mis en évidence. En permanence : logo de l'école, total et objectif, nombre de donateurs, code QR vers le don dans le vitrail (`/vitrail?don&src=ecran`). Protections pour l'événement : dernier état gardé, reprise après coupure, écran toujours allumé, rechargement toutes les 6 h, plein écran au clic ou avec F.

Le vitrail en ligne (`/vitrail`) n'affiche plus non plus les montants des donateurs (fiches, survol, recherche, derniers dons) : seul le total collectif reste.

## Marque

- **Nom** : Donivers (nom de la plateforme) ; « le Donivers de [organisme] » ; « vitrail » = le format visuel. Dans `CONFIG.brand` (nom, descripteur, slogan, « Propulsé par Donivers », Studio Existence).
- **Palette** (`lib/theme.ts` et variables CSS de `app/globals.css`) : fond nuit `#0B0A12`, texte `#F4EFE6`, texte secondaire `#B8B2C4`, accent ambre `#F0B24A` (texte `#1A1208` dessus), lumière centrale `#FFE2A8`, cinq verres (ambre, rose `#E0657F`, turquoise `#3DB5A6`, indigo `#6A78E6`, violet `#A56BD9`). Les verres sont les seules couleurs fortes. Contrôle de contraste prêt pour la personnalisation par organisme (`onAccent`, `contrast`).
- **Typographie** (auto-hébergée, aucune requête externe) : **Fraunces** 500 pour les titres (classe `font-display`, et les `h1`), italique 400 pour le slogan (classe `slogan`) ; **DM Sans** pour l'interface, les noms des donateurs et le texte sur le verre (`lib/fonts.ts`, `LABEL_STYLE` dans `lib/render.ts`).
- **Couleurs des morceaux existants** : exécuter `supabase/migrations/2026-11-05-couleurs-donivers.sql` (les dix anciens verres → les cinq nouveaux).
- **Mentions** : « Propulsé par Donivers · Chaque don, un morceau d'univers. » en pied de page (`components/BrandFooter.tsx`) ; Studio Existence seulement dans « À propos » et la confidentialité.

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
