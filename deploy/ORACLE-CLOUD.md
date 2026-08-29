# SIGMA EVENTS — Déploiement Oracle Cloud Always Free

## 🎯 Ce que vous obtenez GRATUITEMENT

| Ressource | Oracle Cloud Free |
|---|---|
| **CPU** | 2 OCPU ARM (Ampere A1) |
| **RAM** | **12 GB** |
| **Stockage** | 200 GB SSD |
| **Bandwidth** | **10 TB/mois** |
| **IP publique** | 1 IPv4 |
| **SSL** | Let's Encrypt (gratuit) |
| **Uptime** | 99.5% |
| **Durée** | **∞ À vie** |
| **Coût** | **0 FCFA** |

---

## Étape 1 : Créer un compte Oracle Cloud

1. Aller sur **https://cloud.oracle.com/free**
2. Cliquer **"Start for Free"**
3. Remplir le formulaire :
   - Pays : Bénin / Togo / Côte d'Ivoire
   - Nom, email, mot de passe
4. **Carte bancaire obligatoire** (pas débitée pour Always Free)
5. Vérifier l'email et activer le compte

---

## Étape 2 : Créer l'instance VPS

1. Se connecter au **Oracle Cloud Console**
2. Menu → **Compute** → **Instances** → **Create Instance**
3. Configurer :

| Paramètre | Valeur |
|---|---|
| **Name** | `sigma-events` |
| **Image** | Ubuntu 22.04 (or latest LTS) |
| **Shape** | **VM.Standard.A1.Flex** (ARM) |
| **OCPU** | **2** |
| **RAM** | **12 GB** |
| **Boot Volume** | **200 GB** |

4. **Clé SSH** :
   - Cliquer **"Generate a key pair"**
   - Télécharger la clé privée (`.key`)
   - La garder précieusement !

5. **Network Security Group** (pare-feu) :
   - Créer un NSG avec les règles :
     - Ingress : TCP 22 (SSH)
     - Ingress : TCP 80 (HTTP)
     - Ingress : TCP 443 (HTTPS)
     - Egress : Tous (outbound)

6. Cliquer **"Create"** et attendre ~2 minutes

---

## Étape 3 : Connexion au serveur

1. Dans la console Oracle, copier l'**IP publique** de l'instance
2. Connexion SSH :

```bash
# Linux/Mac
chmod 400 sigma-events.key
ssh -i sigma-events.key ubuntu@IP_PUBLIQUE

# Windows (PowerShell)
ssh -i sigma-events.key ubuntu@IP_PUBLIQUE
```

---

## Étape 4 : Installation (une seule fois)

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Télécharger le script d'installation
cd /tmp
wget https://raw.githubusercontent.com/Seule12/sigma-events/main/deploy/install-oracle.sh
chmod +x install-oracle.sh

# Exécuter (remplacer par votre domaine)
sudo bash install-oracle.sh sigma-events.com
```

**Le script affiche** :
- Le mot de passe de la base de données → **à conserver !**
- Le chemin du fichier `.env.production`

---

## Étape 5 : Configuration Nginx + SSL

```bash
# Copier la config Nginx
sudo cp /var/www/sigma-events/deploy/nginx.conf /etc/nginx/sites-available/sigma-events

# Modifier le domaine dans la config
sudo sed -i 's/sigma-events.com/VOTRE_DOMAINE/g' /etc/nginx/sites-available/sigma-events

# Activer le site
sudo ln -sf /etc/nginx/sites-available/sigma-events /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Tester Nginx
sudo nginx -t

# Installer le SSL (Let's Encrypt)
sudo certbot --nginx -d VOTRE_DOMAINE -d www.VOTRE_DOMAINE

# Vérifier le renouvellement automatique
sudo certbot renew --dry-run
```

---

## Étape 6 : Configuration du DNS

### Option A : Cloudflare (recommandé, gratuit)

1. Créer un compte **Cloudflare** (gratuit)
2. Ajouter le domaine
3. Changer les nameservers chez votre registrar
4. Ajouter un enregistrement **A** :
   - Type : A
   - Name : @
   - Content : IP_PUBLIQUE_ORACLE
   - Proxy : DNS only (gris)

### Option B : Chez le registrar

1. Se connecter chez le registrar (Namecheap, GoDaddy, etc.)
2. Ajouter un enregistrement **A** :
   - Host : @
   - Value : IP_PUBLIQUE_ORACLE
   - TTL : 3600

**Attendre 5-30 minutes** que le DNS se propage.

---

## Étape 7 : Variables d'environnement

```bash
# Éditer le fichier .env
sudo nano /var/www/sigma-events/.env.production
```

**Variables obligatoires à remplir** :

```bash
# Base de données (déjà configurée par le script)
DATABASE_URL="postgresql://sigma:MOT_DE_PASSE@localhost:5432/sigma_events?schema=public"

# Application
APP_URL="https://VOTRE_DOMAINE"

# FeexPay (paiement mobile money)
FEEXPAY_PRIVATE_KEY="fp_..."
FEEXPAY_IDENTIFIER="..."

# Ably (temps réel)
ABLY_API_KEY="..."

# Resend (email OTP)
RESEND_API_KEY="re_..."

# Chiffrement QR
QR_ENCRYPTION_KEY="..."
```

**Obtenir les clés** :
| Service | URL | Gratuit |
|---|---|---|
| FeexPay | https://feexpay.me | Commission 1.7% |
| Ably | https://ably.com | 3M msg/mois |
| Resend | https://resend.com | 100 emails/jour |

---

## Étape 8 : Déploiement

```bash
# Exécuter le script de déploiement
sudo -u sigma bash /var/www/sigma-events/deploy/deploy-oracle.sh
```

**Ce que fait le script** :
1. `git pull` → récupère le dernier code
2. `npm ci` → installe les dépendances
3. `prisma generate` → génère le client DB
4. `prisma migrate deploy` → applique les migrations
5. `npm run build` → build Next.js
6. `pm2 reload` → redémarre l'app sans downtime

---

## Étape 9 : Vérification

```bash
# Status de l'app
pm2 status

# Logs en temps réel
pm2 logs sigma-events

# Vérifier que le site répond
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://VOTRE_DOMAINE

# Vérifier SSL
curl -sI https://VOTRE_DOMAINE | head -5
```

---

## Commandes utiles

### Redémarrer l'app
```bash
pm2 restart sigma-events
```

### Voir les logs
```bash
pm2 logs sigma-events --lines 100
pm2 logs sigma-events --err  # erreurs uniquement
```

### Mettre à jour l'app
```bash
sudo -u sigma bash /var/www/sigma-events/deploy/deploy-oracle.sh
```

### Sauvegarder la base de données
```bash
sudo -u postgres pg_dump sigma_events > /var/backups/sigma_$(date +%Y%m%d).sql
```

### Restaurer la base de données
```bash
sudo -u postgres psql sigma_events < /var/backups/sigma_20260101.sql
```

### Voir l'usage RAM/CPU
```bash
htop
free -h
df -h
```

### Mettre à jour Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
pm2 restart sigma-events
```

---

## Architecture Oracle Cloud

```
Internet
    │
    ▼
┌─────────────────┐
│  Oracle Cloud   │
│  NSG (Firewall) │ ← Ports 22, 80, 443
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Nginx       │ ← SSL + Reverse Proxy + Rate Limit
│     :443        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Next.js       │ ← PM2 Cluster (2 workers)
│   :3000         │    12 GB RAM, 2 OCPU ARM
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │ ← Base de données
│  :5432          │
└─────────────────┘
```

---

## Sauvegarde automatique

Créer un cron job pour les backups quotidiens :

```bash
# Éditer le crontab de root
sudo crontab -e

# Ajouter (backup quotidien à 3h du matin)
0 3 * * * sudo -u postgres pg_dump sigma_events | gzip > /var/backups/sigma_$(date +\%Y\%m\%d).sql.gz && find /var/backups -name "sigma_*.sql.gz" -mtime +30 -delete
```

---

## Dépannage

### L'app ne démarre pas
```bash
pm2 logs sigma-events --err --lines 50
cat /var/www/sigma-events/.env.production
```

### Erreur de connexion DB
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"
```

### Erreur 502 Bad Gateway
```bash
pm2 status
curl http://127.0.0.1:3000
```

### SSL expiré
```bash
sudo certbot renew
sudo systemctl reload nginx
```

### RAM insuffisante
```bash
free -h
pm2 moniteur
# Si > 90%, réduire les workers PM2
pm2 delete sigma-events
pm2 start ecosystem.config.js --instances 1
```

---

## FAQ

### Q : Oracle Free est-il vraiment gratuit ?
**Oui.** Le plan Always Free ne expire jamais. La carte bancaire sert uniquement à vérifier votre identité.

### Q : Puis-je avoir un .bj ?
Oui, mais il coûte ~15 000 FCFA/an. Un `.com` à ~1 500 FCFA/an suffit.

### Q : La performance est-elle suffisante ?
Oui. 12 GB RAM + 2 OCPU ARM = plus que suffisant pour Next.js + PostgreSQL.

### Q : Puis-je upgrade plus tard ?
Oui. Passer au plan Pay-As-You-Go quand Sigma Events grandit.

### Q : Comment monitorer l'usage ?
```bash
# Dashboard Oracle Cloud
https://cloud.oracle.com/compute/instances → votre instance → Metrics
```
