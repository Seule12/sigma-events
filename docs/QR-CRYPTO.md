# 🔐 QR de billets chiffrés (AES-256-GCM)

> Transition du code QR en clair vers des QR **chiffrés** (projet de référence
> `sigma-scanner-project-1`). Ce document décrit le format, l'architecture des
> clés, les routes API, le déchiffrement hors-ligne de l'app scanner, les
> garanties de sécurité et les procédures d'exploitation.

---

## 1. Problème résolu

Avant la transition, le QR d'un billet encodait l'**URL publique** `/t/{code}` :
le code (ex. `SIG-4F2A9C`) était lisible par n'importe quel lecteur de QR, et
la page `/t/{code}` était publique. Conséquences :

- le **code pouvait être copié** et le billet rejoué depuis une photo ;
- le format ne prouvait **rien** sur l'authenticité du billet (un QR forgé
  menait à une URL qui affichait une erreur, mais rien ne distinguait un vrai
  billet d'un faux).

Le nouveau format **chiffre et authentifie** le contenu du QR : seule une
entité possédant la clé (le serveur, ou l'app scanner avec sa clé de session)
peut lire et vérifier le billet. 1 bit modifié dans le QR → rejet immédiat.

---

## 2. Architecture des clés

```
                        TICKET_QR_SECRET (64 hex = 32 octets)
                        ─── uniquement côté serveur (jamais transmis)
                                  │
                    key(eventId) = HMAC-SHA256(secret, "sigma:event:" + eventId)
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
   Chiffrement des QR                       Clé de session délivrée
   (génération des billets)                 à l'app scanner via
   ── serveur ──                             /api/events/:id/session-key
                                            ── app scanner (déchiffrement hors-ligne) ──
```

| Composant | Clé détenue | Peut chiffrer | Peut déchiffrer |
|---|---|---|---|
| Serveur (`lib/ticket-crypto.ts`) | Clé maîtresse + toutes les clés d'événement | ✅ oui | ✅ oui |
| App scanner | Clé de session de **son** événement uniquement | ❌ non | ✅ oui (hors-ligne) |
| Client / spectateur | aucune | ❌ | ❌ non |

**Propriétés :**

- **Clé unique par événement** — une clé de session volée ne sert que pour
  l'événement concerné, jamais pour les autres.
- **Clé stable dans le temps** — les QR restent déchiffrables pendant toute la
  vie des billets (dérivation déterministe, pas de rotation automatique).
- **Clé révocable globalement** — changer `TICKET_QR_SECRET` invalide tous les
  QR émis (à n'utiliser qu'en cas de compromission, voir §7).
- **Le `eventId` est en clair dans le QR** (préfixe `S1{eventId}:`) : c'est lui
  qui permet de dériver la bonne clé avant déchiffrement. Ce n'est pas une fuite
  — l'`eventId` est déjà présent dans les URLs publiques (`/events/[id]`,
  `/acheter/[slug]`).

---

## 3. Format du QR

```
S1{eventId}:{base64url(IV || authTag || ciphertext)}
│  │           │
│  │           └── 12 octets IV + 16 octets authTag GCM + ciphertext, en Base64URL
│  └── id de l'événement (en clair, permet de dériver la clé)
└── préfixe de version (format v1)
```

Le payload chiffré (JSON) contient :

```json
{
  "tid": "id_du_ticket",          // identifiant en base — c'est lui qui résout le billet
  "eid": "id_de_l_evenement",     // recoupé avec l'eventId du préfixe
  "p1":  0,                       // invité(s) supplémentaire(s) (informatif, l'état réel est en base)
  "exp": null,                    // timestamp Unix (s) d'expiration, null = aucune
  "n":   "a1b2c3d4"               // nonce aléatoire : deux billets identiques → blobs différents
}
```

- **AES-256-GCM authentifié** : le tag d'authentification couvre IV + ciphertext ;
  toute altération (y compris d'un seul bit) fait échouer le déchiffrement.
- **Nonce aléatoire** (`n`) : jamais deux QR identiques, même pour le même
  billet — empêche l'analyse de motifs et la ré-identification par comparaison.
- Le QR n'encode **jamais** le code du billet en clair.

---

## 4. Composants implémentés

### 4.1 Serveur — `sigma-security/lib/ticket-crypto.ts`

| Fonction | Rôle |
|---|---|
| `encryptTicketQr(payload)` | Chiffre le payload → chaîne `S1{eventId}:…` |
| `decryptTicketQr(qrContent)` | Déchiffre + vérifie intégrité/expiration → payload |
| `deriveEventSessionKey(eventId)` | Clé de session de l'événement (HMAC-SHA256) |
| `isEncryptedTicketQr(input)` | Vrai si l'entrée commence par `S1` |
| `hasTicketCryptoSecret()` | Vrai si `TICKET_QR_SECRET` est configuré |

Erreurs typées (`TicketVerificationError`) :

| Code | Déclenché quand |
|---|---|
| `QR_MALFORMED` | Pas de préfixe `S1`, blob incomplet/illisible, JSON invalide |
| `QR_INVALID_OR_TAMPERED` | Échec GCM (mauvaise clé, blob modifié, QR forgé), payload incohérent |
| `QR_EXPIRED` | `exp` dépassé |

### 4.2 Génération des QR — `lib/qr.ts`

- `ticketQrContent(ticket)` : contenu à encoder (blob chiffré, ou repli URL
  `/t/{code}` si `TICKET_QR_SECRET` manque — mode dégradé).
- `ticketQrDataUrl(ticket, size)` : image QR serveur (data URL).
- Tous les affichages utilisent le blob chiffré : `LazyQr`, confirmation
  d'achat (`/acheter/confirmation/[id]`), `/i/[code]`, `/t/[code]`,
  `ticket-card`, page billets.

### 4.3 App scanner — `sigma-scanner/lib/ticket-crypto.ts`

Port **Web Crypto** du déchiffrement (navigateur/app) :

- `decryptTicketQrLocal(qrContent, keyHex, expectedEventId)` → `{ ticketId,
  eventId }` ou `null`. `null` si : pas de préfixe, autre événement, blob
  illisible, échec GCM (mauvaise clé / falsifié) — **l'app ne plante jamais**.
- La clé de session est stockée en base locale (SQLite Capacitor) après le
  bootstrap ; elle n'est valable que pour l'événement du terminal.

---

## 5. Routes API (backend `sigma-security`)

Toutes exigent le **Bearer token** du terminal (`Authorization: Bearer <token>`).

| Route | Méthode | Rôle | Réponse clé |
|---|---|---|---|
| `/api/agents/authenticate` | POST | Authentifie un agent (téléphone + PIN + code d'activation du terminal, valable 15 min, anti-bruteforce 5 échecs/10 min) | `AgentSession` : `agentId`, `agentName`, `eventId`, `eventName`, `apiToken`, `expiresAt` |
| `/api/events/:id/session-key` | GET | Délivre la clé de session de l'événement (403 si autre événement ; expiration = fin d'événement + 2 h ; 503 si `TICKET_QR_SECRET` absent) | `EventSessionKey` : `eventId`, `keyHex`, `expiresAt` |
| `/api/tickets/verify` | POST | **Vérification en ligne** : envoie le QR brut → déchiffrement serveur → résolution par `tid` → règles métier complètes | `{ ok, status, message, entriesCount, … }` |
| `/api/tickets/sync` | POST | **Réconciliation hors-ligne** : l'app envoie ses entrées (`{ qrContent, status, scannedAt, syncId }`) ; le serveur est source de vérité, idempotent par `syncId` | `{ synced, alreadySynced, failed, processedIds }` |

**Règles métier appliquées** (partagées avec le web — `runCheckInCore` dans
`app/actions.ts`) : zone, liste noire, temporalité (`[début − 2 h, fin]`),
capacité (jauge), double-scan atomique (statut `ENTERED` / compteur d'entrées
pour les invitations multi-personnes), source en ligne/hors-ligne journalisée
(`CheckIn`, `syncId` unique).

---

## 6. Flux de bout en bout

### Scan en ligne
1. L'app scanne le QR → obtient le **blob brut** (ne l'altère pas, casse
   sensible).
2. `POST /api/tickets/verify { qrContent }` → le serveur déchiffre avec la clé
   de session de l'événement, résout le billet par `tid`, applique les règles.
3. Réponse : `VALID` (entrée), `ENTRY` (passage partiel d'invitation
   multi-personnes), `ALREADY_SCANNED`, `INVALID`, `BLACKLISTED`, `FULL`,
   `CLOSED`, `TOO_EARLY`, `QR_INVALID_OR_TAMPERED`…

### Scan hors-ligne (déconnecté)
1. Au bootstrap (activation du terminal), l'app récupère la clé de session
   (`/api/events/:id/session-key`) + la liste des billets (avec `id`).
2. Sans réseau : `decryptTicketQrLocal(blob, keyHex, eventId)` → `ticketId` →
   résolution dans la base locale → vérification locale des règles.
3. Chaque scan est enregistré localement (`syncId` unique) puis poussé à la
   reconnexion via `/api/tickets/sync` — **premier horodaté gagne**, le
   double-scan reste bloqué même si deux terminaux ont scanné hors-ligne.

---

## 7. Exploitation

### Générer la clé (si absente du `.env`)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → 64 caractères hex, à mettre dans TICKET_QR_SECRET (.env et .env.example)
```

### Rotation (compromission)
1. Générer un nouveau secret.
2. `TICKET_QR_SECRET=<nouveau>` + redémarrage du serveur.
3. ⚠️ **Tous les QR émis deviennent invalides** (dérivation différente) → les
   billets papier déjà distribués doivent être réémis.

### Mode dégradé (sans `TICKET_QR_SECRET`)
- Génération : repli sur l'URL `/t/{code}` historique (code en clair) — **à ne
  pas utiliser en production**.
- Validation : le déchiffrement est impossible → les QR chiffrés sont refusés,
  les anciens URL passent (logique historique).
- `/api/events/:id/session-key` répond **503** (clé indisponible).

### Migration des anciens QR
Les QR émis **avant** la transition (code en clair) ne sont plus acceptés.
Réémettre les billets concernés (export PNG / page billets) si des billets
papier circulent déjà.

---

## 8. Menaces couvertes

| Menace | Contre-mesure |
|---|---|
| Copie du code (rejeu depuis une photo) | Le code n'est plus lisible ; le blob est lié à l'événement et au ticket |
| QR forgé / falsifié | GCM authentifie tout : 1 bit modifié → rejet |
| Ré-émission d'un QR d'un autre événement | `eid` du préfixe + clé dérivée de l'événement → refus |
| Scan avec une clé volée | Clé de session limitée à un événement + expiration fin d'événement + 2 h |
| Attaque sur la clé maîtresse | Jamais transmise ; seule la clé dérivée (par événement) circule |
| Analyse de motifs (mêmes billets) | IV + nonce aléatoires → blobs tous différents |
| Rejeu hors-ligne (anti-rejeu) | `syncId` unique + premier horodaté gagne, idempotence serveur |

---

## 9. Tests

```bash
# Test de bout en bout complet (14 assertions) — nécessite le serveur dev + .env :
cd sigma-security && npx tsx --env-file=.env scripts/e2e-qr-crypto.ts
```

Couvre : round-trip serveur chiffrement/déchiffrement, blob altéré rejeté,
entrée non-QR rejetée, compatibilité Web Crypto (l'app déchiffre les blobs
serveur ; mauvaise clé → null), auth (401 sans token, 403 autre événement,
clé délivrée, anti-bruteforce), scan complet `VALID` + journal `CheckIn`,
double-scan `ALREADY_SCANNED`.

Typecheck : `cd sigma-security && npx tsc --noEmit` et
`cd sigma-scanner && npx tsc --noEmit` (tous deux rc=0).

---

## 10. Fichiers concernés

| Fichier | Rôle |
|---|---|
| `sigma-security/lib/ticket-crypto.ts` | Crypto serveur (AES-256-GCM, dérivation des clés) |
| `sigma-security/lib/qr.ts` | Génération du contenu QR (blob chiffré) |
| `sigma-security/app/api/agents/authenticate/route.ts` | Auth agent + activation terminal |
| `sigma-security/app/api/events/[id]/session-key/route.ts` | Délivrance de la clé de session |
| `sigma-security/app/api/tickets/verify/route.ts` | Vérification en ligne |
| `sigma-security/app/api/tickets/sync/route.ts` | Réconciliation hors-ligne |
| `sigma-security/app/actions.ts` | `runCheckInCore` (déchiffrement + règles métier), `syncTerminalAction` |
| `sigma-scanner/lib/ticket-crypto.ts` | Déchiffrement local Web Crypto |
| `sigma-scanner/lib/api.ts` | `apiSessionKey`, `apiVerify` |
| `sigma-scanner/components/scanner-screen.tsx` | Flux de scan (blob cas-sensible, en ligne + hors-ligne) |
| `sigma-security/scripts/e2e-qr-crypto.ts` | Test de bout en bout (14 assertions) |
