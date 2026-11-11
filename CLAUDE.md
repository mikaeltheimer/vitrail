# Donivers — règles du dépôt

Lu automatiquement par Claude Code. S'applique à **tout le monde** : Mikael (Mika), Joaquim, et leurs agents. En cas de doute, demander plutôt que deviner.

Donivers est une plateforme de dons « vitrail » de Studio Existence inc. : chaque organisme a son vitrail sur `<organisme>.donivers.com`, chaque don y ajoute un morceau de verre. Next.js 16, Supabase, Stripe Connect, Resend, Vercel. Feuille de route et répartition du travail : `docs/feuille-de-route.md`.

## 1. Production

- **`main` est la production.** Chaque fusion part sur donivers.com devant de vrais organismes.
- Personne ne pousse directement sur `main`. Tout passe par une PR. **Seul Mika fusionne dans `main`.** Joaquim et son agent ne fusionnent jamais, même avec l'accès en écriture.
- Jamais de force-push sur `main`, jamais de suppression de `main`.
- Rien ne touche la base de production, les variables de Vercel en production ni les webhooks sans l'accord explicite de Mika pour ce geste précis.
- Si une fusion casse la production : retour à la version précédente dans Vercel (Instant Rollback), puis correction sur une branche. **Le retour arrière ne défait pas une migration** : voir section 4.

## 2. Flux de travail

1. **Annoncer avant de coder** : « je prends X » dans `docs/feuille-de-route.md` (section « En cours ») ou dans le fil commun. Deux personnes ne travaillent pas sur les mêmes fichiers en même temps.
2. **Une branche par changement**, partie du `main` à jour : `mika/<sujet>`, `joaquim/<sujet>`. Durée de vie courte (1 à 3 jours).
3. **Mettre la branche à jour souvent** (`git fetch origin main && git rebase origin/main`), au moins chaque jour et toujours avant d'ouvrir ou de fusionner une PR. Les conflits se résolvent sur la branche, jamais sur `main` ; c'est la deuxième PR qui les résout.
4. **Une PR petite et lisible** : quoi, pourquoi, comment c'est testé, captures si l'interface change, migration éventuelle nommée en tête.
5. **Vérifications avant la PR** (section 7), toutes vertes.
6. **Essai sur l'aperçu Vercel** de la PR, par l'auteur puis par la personne qui relit.
7. **Relecture puis fusion par Mika.** Les PR de Mika sont relues par Joaquim quand il le peut, sans bloquer.

Une branche par personne, jamais de travail directement sur la branche d'un autre. La branche `multi-organismes` n'est plus une branche de travail : elle sert seulement d'alias fixe pour les essais de paiement Stripe en mode test (section 6), et seul Mika y pousse.

## 3. Zones sensibles : en parler avant d'y toucher

- Paiements et commission : `lib/payments.ts`, `lib/platform-fee.ts`, `lib/refunds.ts`, `lib/connect.ts`, `app/api/webhook/stripe`.
- Comptes, invitations, accès : `lib/auth.ts`, `lib/signup.ts`, `app/connexion`, `app/inscription`, `app/studio`.
- Isolation entre organismes : `lib/tenant.ts`, `lib/hosts.ts`, `proxy.ts`, et toute requête qui ne filtre pas par organisme.
- Renseignements personnels (Loi 25) : `lib/erase.ts`, `lib/retention.ts`, `lib/consent.ts`, pages juridiques.
- Base de données : `supabase/migrations/`, `supabase/schema.sql`.
- Courriels et tâches planifiées : `lib/email.ts`, `app/api/cron`, `app/api/webhook/resend`.
- Variables d'environnement, `vercel.json`, nouvelles dépendances.

Jusqu'au lancement de l'École d'art (4 décembre 2026), **Mika garde les paiements, la commission et les migrations**.

## 4. Base de données et migrations

- Trois bases : **production** (Supabase `effmzcbjfwrcqvajyedz`, Mika seulement), **donivers-test** (`mqoifxqtuborbktnokih`, partagée par les aperçus Vercel), et **une base locale** par développeur.
- **En local, on travaille sur sa propre base** (Supabase en local, `supabase start`, puis `supabase/schema.sql`), pas sur donivers-test : on peut la casser sans gêner personne.
- **Une seule personne écrit des migrations à la fois** (Mika jusqu'au 4 décembre). Besoin d'une colonne ? On la demande.
- Les fichiers de `supabase/migrations/` portent un numéro d'ordre en forme de date (`2026-11-21-…`), pas la date du jour : prendre le suivant de la liste.
- Une migration n'est **jamais** appliquée à donivers-test depuis une branche non fusionnée. Mika l'applique à donivers-test, puis en production, au moment convenu dans la PR.
- **Compatible avec le code précédent** : on ajoute d'abord (colonne, table) ; on retire seulement dans une PR suivante, une fois le nouveau code en production. Sinon un retour arrière Vercel casse le site.
- `supabase/schema.sql` est **généré** à partir d'une base où toutes les migrations sont appliquées : régénéré seulement par la personne qui fusionne la migration, jamais à la main dans une PR ordinaire.
- Les suppressions (table, colonne, contrainte) demandent une confirmation de Mika dans l'outil Supabase.

## 5. Données, secrets, Loi 25

- Aucun secret dans git (`.env*` est ignoré, sauf `.env.example`). En local : `.env.local` avec des **clés de test seulement** (`sk_test_…`).
- Jamais de clé de production ni de vraie donnée de donateur en local, dans une capture, une PR, un ticket ou une conversation avec un agent.
- Ne jamais copier de courriels de donateurs hors de la base (pas d'export « pour tester »).
- Ne jamais afficher la valeur d'une variable d'environnement, même en débogage.

## 6. Paiements et courriels hors production

- Aperçus Vercel : base donivers-test, Stripe en mode test, `PAYMENT_MODE` de test. Aucun vrai paiement possible.
- **Les paiements Stripe ne se testent pas sur l'aperçu d'une branche** : la protection de déploiement bloque les webhooks sur `*.vercel.app` et le webhook de test vise l'alias fixe de `multi-organismes`. Pour un essai de bout en bout, Mika pousse la branche vers `multi-organismes`. En local : `stripe listen --forward-to localhost:3000/api/webhook/stripe`.
- Courriels : en local, laisser `RESEND_API_KEY` vide (le courriel s'écrit dans la console du serveur). Sur les aperçus, la clé Resend est la même qu'en production : n'envoyer qu'aux adresses de l'équipe, jamais aux adresses fictives de la démo (les rebonds abîment la réputation du domaine d'envoi). `REMINDERS_ENABLED=0` en local.
- Les tâches planifiées Vercel (`vercel.json`) ne tournent qu'en production.

## 7. Vérifications avant chaque PR

```bash
npm run typecheck             # tsc --noEmit
npx eslint .
npm test
npm run check:i18n -- --strict
npx next build                # aucun avertissement attendu
```

## 8. Conventions du code

- npm. Français comme langue source ; l'anglais doit avoir la même qualité.
- **Tous les textes visibles** sont dans `messages/fr.json` et `messages/en.json` (parité obligatoire). Ajouter ses clés dans son propre espace de noms, sans réordonner le fichier. Conventions : `docs/i18n.md` (nom d'organisme jamais précédé d'un article, pluriels ICU, espace insécable U+00A0 avant `: ; ? ! »` et après `«`). Exceptions : la section Studio est en français seulement.
- Ne pas reformater un fichier qu'on ne modifie pas. Pas de configuration Prettier dans le dépôt : si on formate, `--single-quote --no-semi --print-width 200 --arrow-parens avoid`.
- Le domaine de la plateforme vient de `PLATFORM_DOMAIN`, jamais écrit en dur. L'organisme vient de l'hôte de la requête.
- Palette, logo, signature « propulsé par » : ne pas changer sans Mika. Aucun faux témoignage présenté comme preuve sur la vitrine.
- Tout ce qui est visuel ou éditorial : proposer 2 ou 3 pistes avec une maquette ou un rendu réel **avant** de coder ; Mika tranche.

## 9. Tests : pièges connus

- La fausse base des tests (`tests/fake-db.ts`) ne connaît **aucune contrainte SQL** : avant de livrer une écriture nouvelle, relire les contraintes des tables touchées dans `schema.sql`. Elle partage les lignes par référence : figer les valeurs avant d'écrire ; enchaîner les suppressions plutôt que de les lancer en parallèle.
- Une route testée avec `NextRequest` doit recevoir l'en-tête `host` (l'organisme vient de l'hôte).
- Scripts `tsx` d'essai : les placer dans le dépôt (sinon `next` ne se résout pas), jamais commités.
- Captures : Playwright depuis le dépôt, API simulée par `page.route` ; page d'essai temporaire sortie de `app/` avant `npm test`.
- Le serveur de développement garde `messages/*.json` en cache : le redémarrer après les avoir modifiés. `rm -rf .next` si les types sont périmés.
- Arrêter les serveurs de développement avant de committer.

## 10. Pour les agents

- Lire ce fichier et `docs/feuille-de-route.md` au début de chaque session.
- Communiquer en français. Signaler les incertitudes ([Certain], [Likely], [Guessing]) plutôt que deviner.
- Ne jamais demander ni afficher de secret.
- Ne jamais pousser sur `main`, fusionner une PR, appliquer une migration hors de sa base locale, ou modifier Vercel, Stripe, Resend ou Supabase hébergé, sans l'accord explicite de Mika pour ce geste.
- Mettre à jour `docs/feuille-de-route.md` dans la PR quand une tâche commence ou se termine.
