#!/bin/bash
# ============================================================
# SIGMA EVENTS — Installation Oracle Cloud Always Free
# Ubuntu 22.04 ARM (Ampere A1) — 2 OCPU, 12 GB RAM
# Usage : sudo bash install-oracle.sh sigma-events.com
# ============================================================

set -e

DOMAIN="${1:-sigma-events.com}"
APP_USER="sigma"
APP_DIR="/var/www/sigma-events"
DB_NAME="sigma_events"
DB_USER="sigma"
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

echo "=========================================="
echo "  SIGMA EVENTS — Oracle Cloud Always Free"
echo "  Domaine : $DOMAIN"
echo "  RAM     : 12 GB | CPU : 2 OCPU ARM"
echo "=========================================="

# 1. Mise à jour du système
echo "[1/9] Mise à jour du système..."
apt update -y && apt upgrade -y
apt install -y curl wget git unzip build-essential \
  libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev \
  libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev \
  libffi-dev liblzma-dev

# 2. Création de l'utilisateur applicatif
echo "[2/9] Création de l'utilisateur $APP_USER..."
if ! id "$APP_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi

# 3. Installation de Node.js 20 (ARM64)
echo "[3/9] Installation de Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "Node.js $(node -v) | npm $(npm -v)"

# 4. Installation de PostgreSQL 16
echo "[4/9] Installation de PostgreSQL..."
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

# 5. Installation de Nginx
echo "[5/9] Installation de Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# 6. Installation de Certbot (SSL Let's Encrypt)
echo "[6/9] Installation de Certbot..."
apt install -y certbot python3-certbot-nginx

# 7. Installation de PM2 globalement
echo "[7/9] Installation de PM2..."
npm install -g pm2
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

# 8. Configuration du pare-feu (Oracle Cloud)
echo "[8/9] Configuration du pare-feu..."
# Oracle Cloud a déjà un NSG (Network Security Group)
# On configure aussi UFW en double sécurité
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# 9. Configuration Oracle Cloud-specific
echo "[9/9] Optimisations Oracle Cloud..."
# Augmenter les limites de fichiers
cat >> /etc/security/limits.conf <<EOF
sigma soft nofile 65535
sigma hard nofile 65535
EOF

# Optimisations kernel pour ARM
cat >> /etc/sysctl.conf <<EOF
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
vm.swappiness = 10
EOF
sysctl -p

# Création du répertoire de l'app
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# Création du fichier .env.production
cat > "$APP_DIR/.env.production" <<ENVEOF
# ============================================================
# SIGMA EVENTS — Variables d'environnement (Oracle Cloud)
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
ENVEOF

echo ""
echo "=========================================="
echo "  INSTALLATION TERMINÉE"
echo "=========================================="
echo ""
echo "  Base de données : $DB_NAME"
echo "  User DB         : $DB_USER"
echo "  Mot de passe DB : $DB_PASS"
echo "  Répertoire app  : $APP_DIR"
echo ""
echo "  PROCHAINES ÉTAPES :"
echo "  1. Configurer le DNS (Oracle OCI → domaine)"
echo "  2. Configurer Nginx + SSL"
echo "  3. Déployer l'application"
echo ""
echo "  ⚠️  CONSERVEZ LE MOT DE PASSE DB : $DB_PASS"
echo "=========================================="
