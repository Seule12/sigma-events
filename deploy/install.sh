#!/bin/bash
# ============================================================
# SIGMA EVENTS — Script d'installation VPS (Systalink / tout VPS Ubuntu/Debian)
# Exécuter en tant que root : sudo bash install.sh
# ============================================================

set -e

DOMAIN="${1:-sigma-events.com}"
APP_USER="sigma"
APP_DIR="/var/www/sigma-events"
DB_NAME="sigma_events"
DB_USER="sigma"
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

echo "=========================================="
echo "  SIGMA EVENTS — Installation VPS"
echo "  Domaine : $DOMAIN"
echo "=========================================="

# 1. Mise à jour du système
echo "[1/8] Mise à jour du système..."
apt update -y && apt upgrade -y
apt install -y curl wget git unzip build-essential

# 2. Création de l'utilisateur applicatif
echo "[2/8] Création de l'utilisateur $APP_USER..."
if ! id "$APP_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi

# 3. Installation de Node.js 20 (via NodeSource)
echo "[3/8] Installation de Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "Node.js $(node -v) | npm $(npm -v)"

# 4. Installation de PostgreSQL 16
echo "[4/8] Installation de PostgreSQL..."
if ! command -v psql &>/dev/null; then
  apt install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
fi

# Création de la base de données
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;" 2>/dev/null || true

echo "Base de données créée : $DB_NAME (user: $DB_USER)"

# 5. Installation de Nginx
echo "[5/8] Installation de Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# 6. Installation de Certbot (SSL Let's Encrypt)
echo "[6/8] Installation de Certbot..."
apt install -y certbot python3-certbot-nginx

# 7. Installation de PM2 globalement
echo "[7/8] Installation de PM2..."
npm install -g pm2
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

# 8. Configuration du pare-feu
echo "[8/8] Configuration du pare-feu..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# Création du répertoire de l'app
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# Création du fichier .env.production
cat > "$APP_DIR/.env.production" <<ENVEOF
# ============================================================
# SIGMA EVENTS — Variables d'environnement production
# ============================================================

# --- Base de données ---
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"
DIRECT_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"

# --- Application ---
NODE_ENV=production
APP_URL="https://$DOMAIN"
NEXTAUTH_URL="https://$DOMAIN"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"

# --- FeexPay (paiement mobile money) ---
FEEXPAY_PRIVATE_KEY=""
FEEXPAY_IDENTIFIER=""
FEEXPAY_MODE="LIVE"

# --- Ably (temps réel) ---
ABLY_API_KEY=""

# --- Resend (email OTP) ---
RESEND_API_KEY=""

# --- Infobip (SMS fallback) ---
INFOBIP_API_KEY=""
INFOBIP_BASE_URL=""
INFOBIP_SENDER="SIGMA"

# --- WhatsApp Business API ---
WHATSAPP_API_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_BUSINESS_ACCOUNT_ID=""

# --- Chiffrement QR ---
QR_ENCRYPTION_KEY="$(openssl rand -hex 32)"

# --- FedaPay (retraits organisateurs) ---
FEDAPAY_PRIVATE_KEY=""
FEDAPAY_PUBLIC_KEY=""
FEDAPAY_MODE="PRODUCTION"

# --- CloudAMQP (file d'attente emails) ---
CLOUDAMQP_URL=""

# --- Email worker ---
ENVEOF

echo ""
echo "=========================================="
echo "  INSTALLATION TERMINÉE"
echo "=========================================="
echo ""
echo "Base de données : $DB_NAME"
echo "User DB         : $DB_USER"
echo "Mot de passe DB : $DB_PASS"
echo "Répertoire app  : $APP_DIR"
echo "Fichier .env    : $APP_DIR/.env.production"
echo ""
echo "PROCHAINES ÉTAPES :"
echo "  1. Éditer le fichier .env.production :"
echo "     nano $APP_DIR/.env.production"
echo ""
echo "  2. Configurer Nginx :"
echo "     cp /tmp/sigma-nginx.conf /etc/nginx/sites-available/sigma-events"
echo "     ln -sf /etc/nginx/sites-available/sigma-events /etc/nginx/sites-enabled/"
echo "     rm -f /etc/nginx/sites-enabled/default"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  3. Configurer le SSL :"
echo "     certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "  4. Déployer l'application :"
echo "     sudo -u $APP_USER bash /var/www/sigma-events/deploy/deploy.sh"
echo ""
echo "  ⚠️  CONSERVEZ LE MOT DE PASSE DB : $DB_PASS"
echo "=========================================="
