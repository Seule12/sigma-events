# 🛡️ Sigma Security — Contrôle d'accès événementiel

Plateforme SaaS **mobile-first** de sécurité des biens et des personnes au Bénin.
Ce MVP couvre le **module événementiel** : billets à QR code, contrôle d'accès en
temps réel par les agents (caméra du téléphone), jauge de capacité, et anti-fraude.

---

## 🚀 Démarrage rapide (développement — SQLite)

```bash
npm install
cp .env.example .env   # si absent : DATABASE_URL=file:./dev.db
npx prisma db push      # applique le schéma à la base (SQLite)
npm run db:seed         # données de démo (comptes + événement + billets)
npm run dev             # http://localhost:3000
```

## 🗄️ Production — PostgreSQL (Supabase)

Le code bascule automatiquement sur Postgres quand `DATABASE_URL` commence par
`postgresql://` (schéma `prisma/schema.postgres.prisma`, client `prisma-pg`, adapter
`@prisma/adapter-pg`). Le développement local et les tests restent sur SQLite.

```bash
# 1. Après chaque modification du schéma SQLite : resynchroniser le schéma Postgres
npm run db:sync:pg          # scripts/sync-postgres-schema.mjs
npm run db:generate:pg      # régénère le client Prisma Postgres

# 2. Chaîne de connexion (Supabase → Settings → Database → Connection string)
#    DATABASE_URL = pooler (runtime) ; DIRECT_URL = connexion directe (CLI migrations)
#    NB : ajouter ?sslmode=no-verify si le certificat Supabase n'est pas reconnu.
#    Exemple (pooler) :
#    DATABASE_URL="postgresql://postgres.<ref>:<mdp>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=no-verify"

# 3. Migrations + seed contre la base de production
npm run db:deploy:pg        # prisma migrate deploy (applique prisma/migrations-pg)
npm run db:seed:pg          # données de démo sur Postgres
```

> ⚠️ **IPv6** : les connexions *directes* Supabase (`db.<ref>.supabase.co`) sont
> IPv6-only. Si votre machine/réseau n'a pas d'IPv6, utilisez le **pooler**
> (`aws-0-<region>.pooler.supabase.com`, port 5432). Pour trouver la région du
> projet : tester `aws-0-eu-west-2.pooler.supabase.com` puis les autres régions
> jusqu'à ce que le nom d'utilisateur `postgres.<ref>` soit reconnu.

## 🏠 Site public

- **Page d'accueil** (`/`) : vitrine produit (hero, fonctionnalités, réseaux mobile
  money, « comment ça marche », CTA). Les utilisateurs connectés sont redirigés vers
  leur espace (dashboard / scan).
- **Inscription en 3 étapes** (`/register`) : ① nom + email + téléphone, ② **vérification
  du numéro par code OTP à 6 chiffres envoyé par SMS** (10 min de validité), ③ création
  du code PIN → compte organisateur créé et connecté. Les agents, eux, sont créés par
  leur organisateur depuis l'événement.

## 👤 Comptes de démo

| Rôle | Téléphone | PIN | Accès |
|------|-----------|-----|-------|
| **Super admin** | `96 00 00 00` | `1234` | Espace /admin : stats plateforme, organisateurs, commissions |
| **Organisateur** | `97 00 00 00` | `1234` | Dashboard, événements, invités, rapports |
| **Organisateur** | `97 55 44 33` | `1234` | Second compte (tests admin : blocage, commission) |
| **Agent** | `97 11 22 33` | `1234` | App de scan (assigné à l'événement démo) |
| **Agent** | `97 22 33 44` | `1234` | App de scan |

**Billets de test** : `DEMO-VIP-0001` → `DEMO-VIP-0003` (VIP), `DEMO-STD-0001` → `DEMO-STD-0003` (Standard).
Le billet public est visible sur `/t/<code>` (ex. `http://localhost:3000/t/DEMO-VIP-0001`).

**Invitations de démo** : chaque billet démo a un **cycle de vie** différent (Entrée,
Envoyée, Ouverte, Confirmée, Générée, Annulée) — visibles sur la page événement.
L'invitation publique est sur `/i/<code>` (ex. `http://localhost:3000/i/DEMO-STD-0001`).

**Boutique en ligne (démo)** : `http://localhost:3000/acheter/gbediga-vodoun-night`
— le client choisit son billet (VIP 15 000 F / Standard 5 000 F), **choisit comment
recevoir son billet** (téléchargement / email / WhatsApp), paie en mode démo mobile
money, puis reçoit facture + billet QR. L'événement démo est en **mode combiné**
(billetterie + invitations).

Le seed ajoute 4 ventes de démonstration (CA ≈ 40 000 FCFA) pour alimenter la page
**Profil & ventes** (`/profil`).

> ⚠️ L'événement démo est « live » (commencé il y a 2 h) : relance `npm run db:seed`
> pour remettre sa date dans la fenêtre d'ouverture.

> 🧪 Migration : après un changement de schéma (ex. `Order.quantity`, `Ticket.orderId`),
> relance `npx prisma db push` puis `npm run db:seed`. La démo remet les données à jour ;
> pour de vraies données, prévoir une migration Prisma (les commandes PAID antérieures à
> la relation `Ticket.orderId` ont leurs billets orphelins).

## ✨ Fonctionnalités (MVP)

### Super admin (espace /admin)
- **Vue d'ensemble** : chiffre d'affaires global, commissions Sigma totales, organisateurs/agents,
  événements, billets émis, entrées validées, paiements en attente, graphique CA 14 jours,
  ventes récentes (toutes plateformes)
- **Gérer les organisateurs** (`/admin/organisateurs`) : liste des comptes avec CA et commission,
  **bloquer / débloquer** un compte (sessions détruites, connexion refusée), ajuster le
  **taux de commission** (%) de chaque organisateur
- **Voir tous les événements** (`/admin/evenements`) : nom, organisateur, date, statut, jauge,
  billets, ventes — contrôle global de la plateforme
- Un compte super admin ne peut pas être bloqué (ni par un autre admin)

### Organisateur (dashboard web)
- **Sidebar de navigation** (back-office) : tableau de bord, profil & ventes,
  **transactions**, **notifications**, liste des événements, thème clair/sombre,
  déconnexion — drawer sur mobile et **repliable en rail d'icônes sur desktop**
  (préférence mémorisée), bouton « Nouvel événement »
- **Transactions** (`/transactions`) : solde généré, commission Sigma (3 %), montant
  reversé + liste complète des commandes (payées / en attente / annulées) avec
  référence, client, billet, date et statut (maquette écran 23)
- **Notifications** (`/notifications`) : alertes de jauge (80/90/100 %), paiements
  reçus (7 jours), billets générés (24 h) et accès aux rapports (maquette écran 24)
- **Profil & ventes** (`/profil`) : chiffre d'affaires total, billets vendus en ligne,
  paiements en attente, évolution du CA sur 14 jours, ventes par événement et par type
  de billet, liste des ventes récentes
- Création d'événement (nom, type, lieu, date, capacité, statut + **types de billets avec prix FCFA**)
  → **lien de boutique en ligne généré automatiquement** (/acheter/<slug>)
- **Configuration complète** (`/events/[id]/edit`) : infos + **description**, **image de couverture**,
  **ouverture des portes**, **contact WhatsApp**, **vente à la porte** (on/off), **quantité max par
  client** (1-10) + catégories (nom, prix, places) — capacités bornées aux billets déjà émis
- **Cycle de vie de l'événement** : 📝 Brouillon (boutique cachée) / 📣 Annoncé (ventes ouvertes) /
  🏁 Terminé (ventes fermées) — changeable en un clic depuis la page événement
- **Fermer / rouvrir les ventes en ligne** en un clic (la boutique affiche alors « Ventes fermées »)
- **Mode d'accès de l'événement** : 🛒 Billetterie publique / 🎟️ Invitations privées
  (aucun paiement, boutique masquée) / 🎭 Combiné — choisi à la création, modifiable à l'édition
- **Cycle de vie des invitations** (concept « gestion des accès ») :
  CRÉÉ → GÉNÉRÉ → ENVOYÉ → OUVERT → CONFIRMÉ → ENTRÉ (+ ANNULÉE), avec compteurs
  affichés sur la page événement et badges de statut sur chaque invité
- **Invitation nominative publique** (`/i/<code>`) : l'invité reçoit un lien qui affiche
  son invitation + QR ; son ouverture passe le statut à « Ouverte »
- **Envoi groupé des invitations** : cases à cocher + canal **WhatsApp ou Email** — les
  liens `wa.me` / `mailto` pré-remplis s'ouvrent, les invitations passent « Envoyées »
- **Le « +1 »** : chaque invitation autorise plusieurs personnes (1 à 10, champs email
  et personnes dans l'ajout manuel et le CSV). À l'entrée, l'agent enregistre les
  passages un à un (« Entrée partielle 2/4 ») ; quand toutes les personnes sont entrées,
  l'invitation est consommée (tout scan supplémentaire refusé)
- **Import CSV** des invités (`nom ; téléphone ; catégorie ; email (opt.) ; personnes (opt.)`,
  1 ligne par invité, doublons ignorés) avec **modèle CSV téléchargeable** (`/api/csv-template`) ;
  ajout manuel d'un invité → **billet QR unique** généré (doublons nom + téléphone refusés)
- **Partage WhatsApp du lien de vente** en un clic (bouton vert à côté du lien)
- Envoi du billet / de l'invitation par **WhatsApp** ou **email** (liens `wa.me` / `mailto`)
- **Réservations en attente** : les commandes non payées (PENDING) sont listées avec leur
  horaire d'expiration et un bouton **« Libérer »** (annuler pour rendre les places dispo)
- **Génération du lien de vente** pour un événement créé avant cette fonctionnalité
  (bouton « Générer le lien de vente » si le slug est absent)
- **Impression des billets** (A4, découpe) — exclut la liste noire
- **Export PNG des billets** (`/events/[id]/billets`) : téléchargement d&apos;un billet
  en image (bouton « PNG » sous chaque carte) ou de tous les billets d&apos;un coup
  (« Tout exporter en PNG », avec progression) — fichiers nommés
  `Billet_SIGMA_SIG-XXXXXX_Nom.png`, fond blanc, haute résolution (2×)
- **Export CSV** du journal des entrées (compatible Excel) + **rapport PDF imprimable**
- **Alertes de jauge** automatiques à **80 / 90 / 100 %**
- Liste noire (refus définitif d'un billet, avec motif)
- **Gestion des agents** : créer un compte agent (téléphone + **PIN généré affiché une seule fois**),
  l'assigner à l'événement, suivre son activité (scans validés), le retirer, et
  **réinitialiser le PIN** (nouveau code affiché une seule fois si l'agent a oublié le sien)

### Agent (PWA mobile)
- Connexion téléphone + PIN à 4 chiffres (sans email)
- Scan par **caméra** ou saisie manuelle du code
- **Recherche de billet par nom ou téléphone** : retrouve le billet d'un client qui l'a
  perdu, puis « Valider » déclenche le contrôle anti-fraude normal
- Résultat visuel + vibration : ✅ vert (valide), 🟢 émeraude (entrée partielle X/N d'une
  invitation multi-personnes), 🟡 orange (déjà scanné), 🔴 rouge (invalide / liste noire /
  complet / terminé), 🟠 ambre (trop tôt)
- **Historique personnel** : « Mes derniers scans » sur la page de l'événement
  (heure, titulaire, catégorie, statut, source en ligne/hors-ligne — maquette écran 18)
- **Mode hors-ligne** : les scans sont enregistrés localement, synchronisés au retour du réseau
- Compteurs en direct (validées / déjà scannés / invalides)

### 📱 Packaging Android (APK Sigma Scanner)

Le scanner est une **PWA installable** (manifest + service worker + cache hors-ligne),
donc deux chemins pour obtenir une application Android :

**Option A — PWABuilder (recommandé, aucun SDK local)**

1. Build de production : `npm run build && npm run start` (ou déploiement Vercel/Node)
2. Ouvrez **pwabuilder.com** → collez l'URL de production du scanner → *Generate*
3. Téléchargez l'**APK** (et le bundle AAB pour le Play Store) généré
4. Le service worker garantit le fonctionnement **hors-ligne** et la caméra fonctionne
   via la permission WebView (aucun changement de code nécessaire)

**Option B — Capacitor (build local, nécessite Android Studio)**

```bash
npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/android
npx cap init "Sigma Scanner" com.sigma.security.scanner --web-dir out
# Ajouter output: 'export' à next.config.ts, puis :
npm run build && npx cap add android && npx cap sync
npx cap open android   # build de l'APK dans Android Studio
```

> ⚠️ Les pages authentifiées (dashboard, événements, scan) ne sont volontairement pas
> mises en cache par le service worker — sur un appareil partagé, la session reste
> protégée. Pour l'usage agent dédié, connectez-vous puis le hors-ligne prend le relais.
### Participant / Client
- Ouvre le **lien de vente** de l'événement → mini-site public avec **image de couverture**,
  **description**, **portes ouvertes**, **contact WhatsApp** de l&apos;organisateur, et formulaire
- Saisit ses infos (nom, téléphone, email), **choisit le type de billet** → montant automatique
- **Quantité de billets** (1 à 10, bornée aux places restantes) : une commande = un paiement,
  plusieurs billets QR distincts (facture « prix unitaire × quantité »)
- **Billet gratuit (0 FCFA)** : pas de page de paiement — le billet est émis instantanément
  (facture « Billet gratuit »)
- **Expiration des commandes** : une commande non payée libère ses places après **20 minutes**
  (page de paiement « Commande expirée » avec lien pour recommencer ; l'organisateur peut
  aussi libérer les places manuellement)
- Paiement **mobile money simulé** (mode démo — aucun débit réel) : le client choisit
  son **réseau** (MTN MoMo `*126#` · Moov Money `*555#` · Orange Money `*144#` ·
  Celtiis `*566#`) avec son code USSD ; la méthode apparaît sur la facture
- **Facture détaillée** (référence SIG-XXXXXX) affichée + **billet(s) QR émis**
- **Réception du billet au choix** : téléchargement direct, envoi par **email** ou sur
  **WhatsApp** — choisi avant le paiement, sans frais détaillés au client
- **Profil & ventes** : carte « Reversé (après commission) », ventes récentes par
  événement ; l'espace admin compte le **volume global** (billets) et les commissions
- **Retrouver mon billet** (`/mon-billet`) : page publique, par numéro de téléphone —
  affiche tous ses billets (achat en ligne comme import) avec lien vers le QR
- **Ajouter à mon agenda** sur le billet web (`/t/[code]`) : bouton qui crée un
  événement Google Calendar pré-rempli (date, heure, lieu — maquette écran 19)
- **Les ventes se ferment automatiquement** quand l'événement est terminé, et à la
  demande de l'organisateur (achat refusé avec message clair)

## 🛡️ Règles anti-fraude (implémentées)

1. **QR code unique** (UUID 128 bits) — impossible à deviner ou dupliquer
2. **Un billet = une entrée** (invitation multi-personnes : chaque passage compte, tout
   scan après la dernière entrée est refusé — fini le « cousin qui vient avec »)
3. **Validité temporelle** — billet accepté seulement pendant `[début − 2 h, fin]`
   (fin = `endDate` de l'événement, ou `début + 8 h` par défaut)
4. **Capacité maximale** — refus automatique quand la jauge est pleine
5. **Liste noire** — refus quel que soit l'état du billet
6. **Traçabilité** — chaque scan enregistre billet, agent, horodatage, statut,
   géolocalisation optionnelle, source (en ligne / hors-ligne)
7. **Anti-rejeu** — la première horodatée gagne ; la synchronisation hors-ligne
   est idempotente (chaque scan a un `syncId` unique)

## ⚡ Temps réel & emails (Ably + CloudAMQP)

Le MVP embarque deux services de messagerie, déjà branchés :

- **Ably — notifications temps réel** (`lib/ably.ts`) : chaque événement métier
  (paiement reçu, billets générés, check-in validé, alerte de jauge) publie une
  notification sur le canal privé `notif-<userId>` de l'organisateur. Le navigateur
  s'abonne via un **TokenAuth** délivré par `/api/ably/auth` (capability réduite à la
  souscription — la clé API root ne quitte jamais le serveur) : toast en direct +
  badge sur le lien Notifications de la sidebar (`components/live-notifications.tsx`).
- **CloudAMQP — file d'emails transactionnels** (`lib/queue.ts`) : les emails (OTP
  d'inscription, facture, billet) sont mis en file sur `sigma.emails` (RabbitMQ
  durable). Le worker `scripts/email-worker.ts` les consomme et les envoie via
  **Resend** (`resend.emails.send`, templates HTML prêts). Sans `RESEND_API_KEY`,
  le worker journalise en mode dégradé ; les destinataires non-email (OTP SMS)
  sont ignorés et laissés au canal SMS.

```bash
# Variables requises dans .env :
# ABLY_API_KEY=<clé racine Ably>
# CLOUDAMQP_URL=amqps://user:pass@host/vhost
# RESEND_API_KEY=re_…            (resend.com → API Keys)
# EMAIL_FROM="Sigma Security <sigma@votre-domaine.com>"  (domaine vérifié sur Resend)

# Lancer le worker d'emails (en production, un process dédié / PM2 / Docker) :
npm run worker
```

En l'absence de clés, l'application continue de fonctionner (notifications
journalisées, emails en mode dégradé) — jamais bloquant pour le flux métier.

## 🔑 Connexion sociale (Google · Facebook · Apple)

Les boutons « Continuer avec Google / Facebook / Apple » apparaissent sur le
panneau de connexion et d'inscription de la page d'accueil. Ils restent **grisés**
tant que les identifiants du fournisseur ne sont pas renseignés dans `.env`.

Le flux est un **OAuth 2.0 Authorization Code + PKCE** maison (`lib/oauth.ts`,
route `/api/auth/[provider]` → `/api/auth/[provider]/callback`) : aucun SDK lourd.
Un compte créé via un réseau social n'a **ni téléphone ni PIN** (`phone`/`pin` NULL,
identité = `email` + `authProvider` + `providerId`) ; il reçoit la même session
cookie que les autres comptes (rôles, blocage admin, sessions inchangés). Le
login téléphone classique refuse ces comptes (pas de PIN).

### 🟥 Google (le plus simple)
1. Rendez-vous sur **console.cloud.google.com** → créez un projet → **API et services** → **Écran de consentement OAuth** (Externe) → publiez.
2. **Identifiants** → **Créer des identifiants** → **ID client OAuth** → type **Application Web**.
3. Dans **URI de redirection autorisés**, ajoutez : `http://localhost:3000/api/auth/google/callback` (et votre URL de production).
4. Copiez l'**ID client** et le **Secret** dans `.env` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### 🟦 Facebook
1. **developers.facebook.com** → **Mes applications** → **Créer une application** (type « Entreprise ») → configurer « Facebook pour les développeurs ».
2. **Paramètres** → **Base** : notez l'**ID d'application** et le **Secret d'application**.
3. **Produits** → **Connexion avec Facebook** → **Paramètres** → ajoutez `http://localhost:3000/api/auth/facebook/callback` en URI de redirection OAuth.
4. Renseignez `FACEBOOK_CLIENT_ID` et `FACEBOOK_CLIENT_SECRET` dans `.env`.

### ⬛ Apple (Sign in with Apple)
1. **developer.apple.com** → **Identifiants** → créez un **App ID** (avec « Sign in with Apple » activé) et un **Services ID** — le Service ID sert de `APPLE_CLIENT_ID` (ex : `com.sigma.security.login`), avec l'URL de redirection `http://localhost:3000/api/auth/apple/callback`.
2. **Clés** → créez une **clé Sign in with Apple** (téléchargez le fichier `.p8`) — notez l'**ID de la clé** (`APPLE_KEY_ID`) et votre **Team ID** (`APPLE_TEAM_ID`).
3. Renseignez dans `.env` : `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` et `APPLE_PRIVATE_KEY` (contenu du `.p8` entre guillemets).

> La vérification du code OAuth se fait au callback : en cas de refus, d'erreur ou
> de compte bloqué, l'utilisateur est renvoyé à l'accueil avec un message clair.

## 🧪 Tests

```bash
# 1. Anti-fraude du check-in (11 tests : validité, doublons, liste noire, capacité, temporalité)
npx tsx scripts/test-checkin.ts

# 2. Mode hors-ligne + anti-rejeu + alertes de jauge (9 tests)
npx tsx scripts/test-offline.ts

# 3. Import CSV (parsing, normalisation téléphone, doublons, catégories — 13 tests)
npx tsx scripts/test-import.ts

# 4. Gestion des agents (création, assignation unique, retrait — 6 tests)
npx tsx scripts/test-agents.ts

# 5. Routes HTTP (export CSV, rapport, billets, sécurité — 42 tests, nécessite le serveur)
bash scripts/test-http.sh

# 6. Billetterie en ligne (commande, montant, capacité, quantité, multi-billets,
#    réseaux mobile money — 37 tests)
npx tsx scripts/test-shop.ts

# 7. KKIAPAY (signature webhook, montants, remboursement — 14 tests)
npx tsx scripts/test-kkiapay.ts

# 8. Cohérence des invitations (15 validations)
npx tsx scripts/val-invites.ts

# 7. Invitations : cycle de vie, check-in multi-personnes (+1), frais de livraison,
#    CSV enrichi, mode INVITE (15 validations)
npx tsx scripts/val-invites.ts

# 8. (Manuel) Créer une commande de test : npx tsx scripts/make-order.ts [--pay]

# 8. (Manuel) Créer une commande de test : npx tsx scripts/make-order.ts [--pay]
```

## 🏗️ Architecture

```
app/
├── login/            # Connexion téléphone + PIN (session cookie httpOnly)
├── admin/            # Super admin : stats plateforme, commissions
├── admin/organisateurs  # Super admin : gestion des comptes + taux de commission
├── admin/evenements     # Super admin : tous les événements
├── dashboard/        # Organisateur : stats, événements, création
├── events/[id]/      # Détail : jauge, invités, QR, WhatsApp, liste noire
├── events/[id]/rapport  # Rapport PDF imprimable (bouton Imprimer)
├── events/[id]/billets  # Billets imprimables A4
├── profil/            # Profil & ventes : CA, évolution, ventes par événement/type
├── transactions/       # Transactions : solde, commission, reversé, liste complète
├── notifications/      # Notifications : jauge, paiements, billets générés
├── acheter/[slug]/      # Boutique publique : formulaire, quantité, choix du billet, montant
├── acheter/payer/[id]/  # Paiement mobile money simulé (mode démo)
├── acheter/confirmation/[id]/ # Facture + N billets QR + envoi WhatsApp
├── mon-billet/        # Public : retrouver ses billets par téléphone
├── i/[code]/          # Invitation nominative publique (QR, statut « Ouverte »)
├── register/verify    # Inscription : vérification OTP + création du PIN
├── events/[id]/edit   # Modification de l'événement et des catégories
├── scan/             # Agent : sélection d'événement
├── scan/[eventId]/   # Scanner caméra + hors-ligne + recherche nom/téléphone
├── t/[code]/         # Billet public (QR)
├── api/events/[id]/export  # Export CSV (organisateur uniquement)
└── api/csv-template  # Modèle CSV d'import (public)
components/           # scanner (html5-qrcode), logo, thème, enregistreur SW…
lib/                  # prisma (client auto SQLite/Postgres), auth (sessions), csv, qr
prisma/               # schémas SQLite + Postgres + seeds + migrations
public/sw.js          # Service worker (PWA installable + cache hors-ligne)
```

- **Stack** : Next.js 16 (App Router) · TypeScript · Prisma 7 (SQLite en dev/tests, PostgreSQL en prod via adapters) · Tailwind CSS 4
- **Pages publiques** : `/` (vitrine), `/register` + `/register/verify` (inscription
  profil + OTP), `/login`, `/mon-billet`, `/i/[code]` (invitation), `/acheter/[slug]`,
  `/acheter/payer/[id]`, `/acheter/confirmation/[id]`, `/t/[code]`
- **Espace admin** : `/admin` (stats), `/admin/organisateurs`, `/admin/evenements` (super admin uniquement)
- **QR** : `qrcode` (génération) · `html5-qrcode` (scan caméra) · `html-to-image`
  (export PNG des billets) — les QR sont **chiffrés (AES-256-GCM)** : voir
  [`docs/QR-CRYPTO.md`](docs/QR-CRYPTO.md) pour le format, l'architecture des clés,
  les routes API et le déchiffrement hors-ligne
- **PWA** : manifest + service worker (installable sur Android/iPhone, app shell en cache).
  Le service worker n'est actif qu'en production (`npm run build && npm run start`) —
  pour tester l'installabilité et le hors-ligne, ne pas utiliser `npm run dev`. Les pages
  authentifiées (dashboard, événements, scan) ne sont volontairement pas mises en cache
  (protection des sessions sur appareil partagé).
- **Sécurité** : sessions par cookie httpOnly, autorisations par rôle + propriété
  des événements, comptes bloquables par l'admin (sessions détruites + connexion refusée),
  rate limiting sur le check-in, injection CSV neutralisée à l'export

## 📌 Limites connues (MVP)

- **Paiement mobile money réel** : **KKIAPAY** est intégré et actif en sandbox
  (`lib/kkiapay.ts` + webhook `/api/webhook/kkiapay` + widget client). Basculer en
  production : `KKIA_SANDBOX="false"` + clés live. Dodo Payments reste disponible
  (`lib/payments.ts` + `/api/webhook/dodo`) en renseignant `DODO_API_KEY`.
- **FedaPay** (3ᵉ passerelle prévue) : l'abstraction `externalProvider` en base
  permet d'ajouter un module `lib/fedapay.ts` sans toucher au reste.
- **SMS réel** (Vonage) : `lib/sms.ts` prêt — s'active avec `VONAGE_API_KEY`/`VONAGE_API_SECRET`.
  Sans clé, les codes OTP sont journalisés côté serveur (jamais exposés au client).
- **WhatsApp automatisé** (Meta Business Cloud) : `lib/whatsapp.ts` prêt — s'active avec
  `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`. Sans clé, les liens `wa.me` restent utilisés.
- Les données des billets hors-ligne sont stockées en `localStorage` (par événement)

### 🔌 Activer les services P0 (production)

| Service | Variables à renseigner | Comportement sans clé |
|---|---|---|
| Paiement mobile money | `KKIA_PUBLIC_KEY`, `KKIA_PRIVATE_KEY`, `KKIA_SECRET_KEY` | Paiement simulé (démo) |
| SMS OTP | `VONAGE_API_KEY`, `VONAGE_API_SECRET` | OTP journalisés (dégradé) |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Liens `wa.me` (partage manuel) |

> ⚠️ **WhatsApp Business Cloud** : l'envoi de messages initié par l'entreprise
> (hors fenêtre de 24 h après un message du client) exige un **template approuvé**
> par Meta. Le module `lib/whatsapp.ts` envoie un message texte direct ; en
> production, créez un template (ex. « billet ») et basculez l'appel API sur
> `type: "template"` avec `template.name`. Sans cela, Meta renvoie l'erreur 131047.
| Email transactionnel | `RESEND_API_KEY`, `EMAIL_FROM` | Emails journalisés (dégradé) |
| Temps réel | `ABLY_API_KEY` | Notifications journalisées |
| File d'emails | `CLOUDAMQP_URL` | Emails en direct (sans file) |

Le **rate limiting** est désormais **persistant en base de données** (`RateLimitHit`)
— partagé entre toutes les instances (production multi-serveur), plus en mémoire.
