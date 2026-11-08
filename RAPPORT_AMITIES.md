# Rapport de réalisation — Demandes d’amitié

**Projet :** Yacu  
**Date :** 8 novembre 2026  
**Périmètre :** demandes d’amitié, liste d’amis, RLS et intégration dans Contacts et les profils.

## 1. Synthèse

Le parcours d’amitié a été implémenté côté application et préparé côté base de
données. Un utilisateur peut envoyer une demande, en recevoir une, l’accepter,
la refuser ou l’annuler, puis retirer un ami. Les demandes croisées sont
acceptées automatiquement dans la fonction SQL prévue à cet effet. La
messagerie reste indépendante de l’amitié : le bouton « Envoyer un message »
n’a pas été supprimé ni conditionné à la relation.

La migration SQL est écrite, mais **n’a pas été appliquée à la base**. Les
tests SQL de sécurité, les parcours réels avec deux comptes et les tests de
régression fonctionnelle restent à effectuer.

## 2. Fichiers créés

| Chemin | Rôle |
|---|---|
| `supabase/migrations/20261108113800_create_friendships.sql` | Table, index, RLS, fonctions serveur, triggers, publication Realtime, requêtes de test et instructions de retour arrière. |
| `src/services/friendship.service.ts` | Types et accès Supabase pour les relations, actions, listes et abonnement Realtime. Traduit les codes serveur en messages français. |
| `src/features/contacts/hooks/useFriendships.ts` | État des relations, listes, compteur, rechargement au focus, actions, abonnement et nettoyage du canal. |
| `src/features/contacts/components/FriendActionButton.tsx` | Actions contextuelles Ajouter, Demande envoyée, Accepter/Refuser et confirmation de retrait. |
| `RAPPORT_AMITIES.md` | Présent rapport de réalisation. |

## 3. Fichiers modifiés pour cette fonctionnalité

| Chemin | Modification |
|---|---|
| `src/app/(app)/(tabs)/contacts.tsx` | Ajout des sections Découvrir, Demandes et Amis, du compteur de demandes reçues, des actions sur les utilisateurs et des états vides. La recherche existante est conservée. |
| `src/app/(app)/(tabs)/_layout.tsx` | Ajout de `tabBarBadge` sur Contacts lorsque le nombre de demandes reçues est supérieur à zéro. |
| `src/app/(app)/user/[id].tsx` | Ajout du bouton de relation sur le profil d’un autre utilisateur, masqué sur son propre profil et si l’utilisateur courant l’a bloqué. Les contrôles message, blocage et signalement restent présents. |
| `README.md` | Ajout de la section « État du projet » signalant l’implémentation et les vérifications restantes. |

## 4. Contenu de la migration

La migration `20261108113800_create_friendships.sql` définit :

- `public.friendships`, avec les champs `id`, `requester_id`, `addressee_id`,
  `status`, `created_at` et `updated_at`, et des références en cascade vers
  `profiles`.
- L’interdiction d’une relation avec soi-même et un index unique sur la paire
  d’identifiants indépendamment de leur ordre, afin d’empêcher les doublons
  directs ou inversés.
- Les index de recherche sur `requester_id` et `addressee_id`.
- RLS activée, avec une politique `SELECT` limitée aux deux participants.
  `anon` et `authenticated` n’ont pas d’écriture directe ; `authenticated`
  reçoit uniquement le droit de lecture.
- Les fonctions `security definer` `send_friend_request`,
  `respond_friend_request`, `cancel_friend_request` et `remove_friend`.
  Elles utilisent `auth.uid()` pour identifier l’appelant et appliquent
  notamment les contrôles d’identité, de blocage, de demande croisée et la
  limite de 50 demandes en attente.
- Un trigger dédié à la mise à jour de `updated_at`.
- Un trigger `AFTER INSERT` sur `blocked_users` qui supprime toute relation
  d’amitié ou demande entre les deux utilisateurs bloqués. C’est l’unique
  ajout sur une table existante ; son service et ses politiques n’ont pas été
  modifiés.
- L’ajout idempotent de `friendships` à la publication `supabase_realtime`.
  Le client s’abonne aux événements `INSERT` et `UPDATE` filtrés sur les deux
  colonnes de participant ; il ne s’abonne pas aux suppressions.
- Des exemples de tests SQL de sécurité et des instructions de retour arrière
  en commentaires.

La migration utilise `CREATE ... IF NOT EXISTS`, remplace la politique de
lecture de façon contrôlée et vérifie l’existence des triggers et de la table
dans la publication avant de les ajouter.

## 5. Comportement côté application

- **Recherche Contacts :** la recherche existante reste accessible sous
  « Découvrir » ; chaque résultat propose « Voir » et une action de relation.
- **Demandes :** affichage séparé des demandes reçues et envoyées. Les actions
  disponibles sont Accepter, Refuser et Annuler.
- **Amis :** liste avec avatar, nom et identifiant `@username`. Le profil
  s’ouvre au toucher ; le retrait demande confirmation dans l’interface.
- **Profil utilisateur :** l’action d’amitié est ajoutée sans altérer la
  messagerie ni les contrôles de modération.
- **Temps réel :** INSERT et UPDATE déclenchent un rechargement groupé ; les
  listes sont également rechargées au retour sur l’écran et après les actions.
- **Erreurs :** les codes SQL connus sont présentés avec des messages français,
  dont la demande supprimée entre-temps et la limite d’envoi. Les erreurs
  réseau ne sont pas transformées en réussite.
- **Compatibilité :** aucun nouvel outil d’état ou package n’a été ajouté.
  Les confirmations sont intégrées à l’interface, sans `Alert.alert`.

## 6. Éléments existants préservés

Avant le travail, le dépôt contenait déjà des modifications locales non
commitées, notamment dans `contacts.tsx` et `user/[id].tsx` pour les avatars et
les métadonnées de profil, ainsi que dans les écrans Paramètres, blocage et
conversation. Ces changements ont été conservés et intégrés ; ils ne sont pas
attribués à la fonctionnalité d’amitié.

Aucun changement n’a été effectué aux tables ou politiques RLS de
`messages`, `conversations`, `conversation_members`, `reports`, `user_settings`
ou `user_presence`. Le service de blocage existant est resté inchangé.

## 7. Vérifications effectuées

| Vérification | Résultat |
|---|---|
| `npx tsc --noEmit` | Réussi, aucune erreur TypeScript. |
| `npx expo start --clear` | Metro a démarré ; son endpoint local `/status` a répondu HTTP 200. Le serveur a ensuite été arrêté. |
| `git diff --check` | Réussi, aucune erreur d’espacement détectée. |
| Dépendances | Aucun package n’a été ajouté ; aucun changement final à `package.json` ou `package-lock.json`. |

`npx expo lint` a été tenté, mais le projet ne possède pas de configuration
ESLint installée. Expo a proposé d’ajouter `eslint` et `eslint-config-expo` ;
l’installation a été interrompue afin de respecter la consigne « aucune
nouvelle dépendance ». Les changements temporaires au manifeste ont été
annulés.

## 8. Vérifications restantes et critères de clôture

Les éléments suivants n’ont **pas** été exécutés ni confirmés :

1. Appliquer la migration à la base Supabase de test puis vérifier qu’elle
   s’exécute correctement.
2. Exécuter les tests SQL de privilèges, RLS, autorisations, unicité,
   blocages et limite de 50 demandes avec des comptes de test.
3. Vérifier les scénarios fonctionnels avec deux utilisateurs connectés,
   notamment la réception Realtime sur téléphone et Web.
4. Tester le refus, l’annulation, les demandes croisées, le retrait d’un ami,
   le blocage pendant une relation et le comportement hors ligne.
5. Exécuter les tests de régression de la messagerie, recherche, avatars,
   présence, édition, blocage et signalement.
6. Exécuter un lint lorsque la configuration ESLint du projet sera disponible
   ou explicitement autorisée.

En conséquence, le code client est vérifié par TypeScript, mais la définition
de terminé du cahier des charges — notamment la migration appliquée et les
tests SQL confirmés — **n’est pas encore atteinte**.
