# 🚀 Guide de déploiement — Sigma Events sur LWS Cloud cPanel

## 📋 Résumé

| Info | Valeur |
|---|---|
| **Domaine** | getsigmaevents.com |
| **IPv4** | 91.199.179.97 |
| **Plan** | CloudCP S (6 vCPU, 16 GB RAM) |
| **cPanel** | https://web39.lws-hosting.com:2083 |
| **WHM** | https://web39.lws-hosting.com:2087 |
| **Utilisateur** | rs2856839 |

---

## 📝 Étape 1 — Connexion au cPanel

1. Ouvrez https://web39.lws-hosting.com:2083
2. Identifiant : `rs2856839`
3. Mot de passe : (celui de votre commande)

---

## 📝 Étape 2 — Créer la base MySQL

Dans cPanel :

1. Allez dans **MySQL® Databases**
2. Créez une base de données : `sigma_events`
3. Créez un utilisateur MySQL : `sigma_user`
4. Ajoutez l'utilisateur à la base avec **Tous les privilèges**
5. Notez les informations :
   - Nom BDD : `rs2856839_sigma_events`
   - Utilisateur : `rs2856839_sigma_user`
   - Mot de passe : (celui que vous avez défini)
   - Host : `localhost`

---

## 📝 Étape 3 — Installer Node.js

Dans cPanel :

1. Allez dans **Setup Node.js App** (ou **Node.js**)
2. Cliquez sur **Create Application**
3. Configurez :
   - **Node.js version** : 20 (ou 22)
   - **Application mode** : Production
   - **Application root** : `sigma-events`
   - **Application URL** : `getsigmaevents.com`
   - **Application startup file** : `server.js`
4. Cliquez sur **Create**

---

## 📝 Étape 4 — Upload du code

### Option A : Via Git (recommandé)

Dans le Terminal Web cPanel :

```bash
cd ~/sigma-events
git clone https://github.com/Seule12/sigma-events.git .
```

### Option B : Via FTP

1. Utilisez FileZilla avec :
   - Serveur : `ftp.getsigmaevents.com`
   - Utilisateur : `rs2856839`
   - Mot de passe : (celui de votre commande)
   - Port : 21
2. Uploadez tout le dossier dans `~/sigma-events`

---

## 📝 Étape 5 — Configurer l'environnement

Dans le Terminal Web cPanel :

```bash
cd ~/sigma-events
cp .env.production.lws .env.production
nano .env.production
```

Remplissez les variables :

```env
DATABASE_URL="mysql://rs2856839_sigma_user:MOT_DE_PASSE@localhost:3306/rs2856839_sigma_events"
AUTH_SECRET="VOTRE_SECRET_ICI"
FEEXPAY_API_KEY="..."
FEEXPAY_API_SECRET="..."
FEEXPAY_WEBHOOK_SECRET="..."
NEXT_PUBLIC_FEEXPAY_PUBLIC_KEY="..."
ABLY_API_KEY="..."
RESEND_API_KEY="..."
RESEND_FROM="Sigma Events <noreply@getsigmaevents.com>"
CLOUDAMQP_URL="..."
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_ACCESS_TOKEN="..."
WHATSAPP_VERIFY_TOKEN="sigma_events_verify_2026"
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://getsigmaevents.com"
```

---

## 📝 Étape 6 — Installer et builder

Dans le Terminal Web cPanel :

```bash
cd ~/sigma-events

# Installer les dépendances
npm ci

# Générer le client Prisma MySQL
npx prisma generate --schema prisma/schema.mysql.prisma

# Synchroniser la base de données
npx prisma db push --schema prisma/schema.mysql.prisma --accept-data-loss

# Builder l'application
npm run build
```

---

## 📝 Étape 7 — Configurer Phusion Passenger

Dans cPanel > **Setup Node.js App** :

1. Éditez l'application créée à l'étape 3
2. Vérifiez :
   - **Application startup file** : `server.js`
   - **Application mode** : Production
3. Redémarrez l'application

Si `server.js` n'existe pas, créez-le :

```bash
cd ~/sigma-events
cat > server.js << 'EOF'
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = false;
const hostname = 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Sigma Events ready on http://${hostname}:${port}`);
  });
});
EOF
```

---

## 📝 Étape 8 — Activer SSL

Dans cPanel :

1. Allez dans **SSL/TLS** ou **Let's Encrypt**
2. Activez SSL pour `getsigmaevents.com`
3. Activez **Force HTTPS Redirect**

---

## 📝 Étape 9 — Configurer le webhook FeexPay

1. Connectez-vous à https://feexpay.me
2. Allez dans **Webhooks**
3. Ajoutez :
   - **URL** : `https://getsigmaevents.com/api/webhooks/feexpay`
   - **Secret** : (celui de votre .env.production)
4. Sauvegardez

---

## 📝 Étape 10 — Configurer le DNS

Si le domaine `getsigmaevents.com` est chez un registrar externe :

| Type | Nom | Valeur |
|---|---|---|
| A | @ | 91.199.179.97 |
| A | www | 91.199.179.97 |
| CNAME | www | getsigmaevents.com |

Si le domaine est chez LWS, le DNS est déjà configuré.

---

## 🔧 Commandes utiles

```bash
# Voir les logs
tail -f ~/sigma-events/logs/*.log

# Redémarrer l'app
cd ~/sigma-events && npx passenger restart-app .

# Mettre à jour l'app
cd ~/sigma-events
git pull origin main
npm ci
npx prisma generate --schema prisma/schema.mysql.prisma
npm run build
npx passenger restart-app .

# Vérifier la base
npx prisma studio --schema prisma/schema.mysql.prisma
```

---

## ⚠️ Limitations du mutualisé LWS

| Fonctionnalité | Statut | Solution |
|---|---|---|
| Node.js 20+ | ✅ | cPanel Node.js App |
| MySQL | ✅ | cPanel MySQL Databases |
| SSL | ✅ | Let's Encrypt automatique |
| Email | ✅ | cPanel Email Accounts |
| Background workers | ❌ | Cron jobs cPanel |
| PM2 | ❌ | Phusion Passenger |
| SSH root | ❌ | Terminal Web cPanel |
| WebSocket natif | ⚠️ | Ably (cloud) fonctionne |
| IP fixe | ⚠️ | IP partagée (webhooks FeexPay) |

---

## 💰 Coût total

```
LWS CloudCP S     : (prix de votre commande)
Domaine           : Inclus avec LWS
SSL               : Gratuit (Let's Encrypt)
Email             : Inclus avec LWS
──────────────────
Total             : Uniquement votre hébergement LWS
```

---

## 🆘 Dépannage

### Erreur "Module not found"
```bash
npm ci
npx prisma generate --schema prisma/schema.mysql.prisma
```

### Erreur de base de données
```bash
npx prisma db push --schema prisma/schema.mysql.prisma --accept-data-loss
```

### L'app ne démarre pas
```bash
# Vérifiez les logs dans cPanel > Setup Node.js App > Passenger log file
# Ou :
cat ~/sigma-events/logs/passenger.log
```

### SSL ne fonctionne pas
```bash
# Dans cPanel > Let's Encrypt, regénérez le certificat
# Puis activez Force HTTPS Redirect
```
