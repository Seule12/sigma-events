# SIGMA EVENTS — Déploiement VPS (Systalink)

## Prérequis

- **VPS Systalink** : Cloud Plus (4 GB RAM, 2 vCPU) ou supérieur
- **Système** : Ubuntu 22.04 / 24.04 LTS
- **Domaine** : `sigma-events.com` (configuré vers l'IP du VPS)
- **Accès root** : `ssh root@VOTRE_IP`

## Étape 1 : Installation (une seule fois)

```bash
# Connexion au VPS
ssh root@VOTRE_IP_SYSTALINK

# Télécharger et exécuter le script d'installation
cd /tmp
wget https://raw.githubusercontent.com/Seule12/sigma-events/main/deploy/install.sh
chmod +x install.sh
sudo bash install.sh sigma-events.com
```

**Le script installe** :
- Node.js 20 (via NodeSource)
- PostgreSQL 16
- Nginx (reverse proxy)
- PM2 (gestion de processus)
- Certbot (SSL Let's Encrypt)
- UFW (pare-feu)

**Le script affiche** :
- Le mot de passe de la base de données → **à conserver !**
- Le chemin du fichier `.env.production`

## Étape 2 : Configuration Nginx

```bash
# Copier la config Nginx
sudo cp /tmp/sigma-nginx.conf /etc/nginx/sites-available/sigma-events

# OU depuis le repo
sudo cp /var/www/sigma-events/deploy/nginx.conf /etc/nginx/sites-available/sigma-events

# Activer le site
sudo ln -sf /etc/nginx/sites-available/sigma-events /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Tester et recharger
sudo nginx -t
sudo systemctl reload nginx
```

## Étape 3 : SSL (Let's Encrypt)

```bash
# Installer le certificat SSL
sudo certbot --nginx -d sigma-events.com -d www.sigma-events.com

# Renouvellement automatique (déjà configuré par certbot)
sudo certbot renew --dry-run
```

## Étape 4 : Variables d'environnement

```bash
# Éditer le fichier .env
nano /var/www/sigma-events/.env.production
```

**Variables obligatoires** :
```
DATABASE_URL=postgresql://sigma:MOT_DE_PASSE@localhost:5432/sigma_events?schema=public
APP_URL=https://sigma-events.com
FEEXPAY_PRIVATE_KEY=fp_...
FEEXPAY_IDENTIFIER=...
ABLY_API_KEY=...
RESEND_API_KEY=re_...
QR_ENCRYPTION_KEY=...
```

**Obtenir les clés** :
| Service | URL | Prix |
|---|---|---|
| FeexPay | https://feexpay.me | Commission 1.7% |
| Ably | https://ably.com | Gratuit (3M msg/mois) |
| Resend | https://resend.com | Gratuit (100 emails/jour) |
| WhatsApp Business | https://business.facebook.com | Payant par message |

## Étape 5 : Déploiement

```bash
# Exécuter le script de déploiement
sudo -u sigma bash /var/www/sigma-events/deploy/deploy.sh
```

**Ce que fait le script** :
1. `git pull` → récupère le dernier code
2. `npm ci` → installe les dépendances
3. `prisma generate` → génère le client DB
4. `prisma migrate deploy` → applique les migrations
5. `npm run build` → build Next.js
6. `pm2 reload` → redémarre l'app sans downtime

## Étape 6 : Vérification

```bash
# Status de l'app
pm2 status

# Logs en temps réel
pm2 logs sigma-events

# Vérifier que le site répond
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://sigma-events.com

# Vérifier SSL
curl -sI https://sigma-events.com | head -5
```

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
sudo -u sigma bash /var/www/sigma-events/deploy/deploy.sh
```

### Mettre à jour Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
pm2 restart sigma-events
```

### Mettre à jour PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl restart postgresql
```

### Sauvegarder la base de données
```bash
sudo -u postgres pg_dump sigma_events > /var/backups/sigma_$(date +%Y%m%d).sql
```

### Restaurer la base de données
```bash
sudo -u postgres psql sigma_events < /var/backups/sigma_20260101.sql
```

## Monitoring

### Voir l'usage RAM/CPU
```bash
htop
free -h
df -h
```

### Vérifier les connexions DB
```bash
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='sigma_events';"
```

### Certificat SSL expiration
```bash
sudo certbot certificates
```

## Architecture

```
Internet
    │
    ▼
┌─────────────┐
│   Nginx     │ ← SSL + Reverse Proxy + Rate Limit
│   :443      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Next.js    │ ← PM2 Cluster (2 workers)
│   :3000     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ PostgreSQL  │ ← Base de données
│   :5432     │
└─────────────┘
```

## Sécurité

- ✅ HTTPS obligatoire (Let's Encrypt)
- ✅ Rate limiting (30 req/s général, 10 req/s API)
- ✅ UFW firewall (ports 22, 80, 443 uniquement)
- ✅ Headers de sécurité (XSS, CSRF, HSTS)
- ✅ IPs non exposées (reverse proxy)
- ✅ Backup quotidien (à configurer)

## Backup automatique (optionnel)

Créer un cron job pour les backups :
```bash
# Éditer le crontab de root
sudo crontab -e

# Ajouter cette ligne (backup quotidien à 3h du matin)
0 3 * * * sudo -u postgres pg_dump sigma_events | gzip > /var/backups/sigma_$(date +\%Y\%m\%d).sql.gz && find /var/backups -name "sigma_*.sql.gz" -mtime +30 -delete
```

## Dépannage

### L'app ne démarre pas
```bash
pm2 logs sigma-events --err --lines 50
# Vérifier les variables d'environnement
cat /var/www/sigma-events/.env.production
```

### Erreur de connexion DB
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"  # liste les bases
```

### Erreur 502 Bad Gateway
```bash
pm2 status  # l'app tourne ?
curl http://127.0.0.1:3000  # Next.js répond ?
```

### SSL expiré
```bash
sudo certbot renew
sudo systemctl reload nginx
```
