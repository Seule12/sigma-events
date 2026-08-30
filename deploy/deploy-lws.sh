#!/bin/bash
# ============================================================
# SIGMA EVENTS — Script de déploiement LWS Cloud cPanel
# ============================================================
# Ce script est conçu pour être exécuté sur le serveur LWS
# via le Terminal Web cPanel ou en SSH utilisateur.
#
# Usage :
#   bash deploy-lws.sh
#
# Prérequis :
#   - Node.js 20+ installé via cPanel > Setup Node.js App
#   - Base MySQL créée via cPanel > MySQL Databases
#   - Variables d'environnement dans .env.production
# ============================================================

set -e

echo "🚀 Sigma Events — Déploiement LWS Cloud cPanel"
echo "================================================"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Répertoires
APP_DIR="$(pwd)"
echo -e "${YELLOW}📂 Répertoire : ${APP_DIR}${NC}"

# ============================================================
# 1. VÉRIFICATION DE L'ENVIRONNEMENT
# ============================================================
echo ""
echo -e "${YELLOW}1/7 — Vérification de l'environnement...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js non trouvé. Installez-le via cPanel > Setup Node.js App${NC}"
  exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js ${NODE_VERSION}${NC}"

if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm non trouvé${NC}"
  exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm ${NPM_VERSION}${NC}"

# ============================================================
# 2. INSTALLATION DES DÉPENDANCES
# ============================================================
echo ""
echo -e "${YELLOW}2/7 — Installation des dépendances...${NC}"

npm ci --omit=dev 2>/dev/null || npm install --omit=dev
echo -e "${GREEN}✅ Dépendances installées${NC}"

# ============================================================
# 3. GÉNÉRATION DU CLIENT PRISMA MYSQL
# ============================================================
echo ""
echo -e "${YELLOW}3/7 — Génération du client Prisma MySQL...${NC}"

npx prisma generate --schema prisma/schema.mysql.prisma
echo -e "${GREEN}✅ Client Prisma MySQL généré${NC}"

# ============================================================
# 4. MIGRATION DE LA BASE DE DONNÉES
# ============================================================
echo ""
echo -e "${YELLOW}4/7 — Migration de la base de données MySQL...${NC}"

if [ -f ".env.production" ]; then
  export $(grep -v '^#' .env.production | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL non défini dans .env.production${NC}"
  exit 1
fi

echo -e "${YELLOW}📦 Exécution de prisma db push...${NC}"
npx prisma db push --schema prisma/schema.mysql.prisma --accept-data-loss
echo -e "${GREEN}✅ Base de données synchronisée${NC}"

# ============================================================
# 5. BUILD NEXT.JS
# ============================================================
echo ""
echo -e "${YELLOW}5/7 — Build de l'application Next.js...${NC}"

npm run build
echo -e "${GREEN}✅ Build terminé${NC}"

# ============================================================
# 6. CONFIGURATION PM2 (si disponible)
# ============================================================
echo ""
echo -e "${YELLOW}6/7 — Configuration du processus...${NC}"

if command -v pm2 &> /dev/null; then
  pm2 delete sigma-events 2>/dev/null || true
  pm2 start npm --name "sigma-events" -- start
  pm2 save
  echo -e "${GREEN}✅ Processus PM2 démarré${NC}"
else
  echo -e "${YELLOW}⚠️  PM2 non disponible. L'app sera gérée par Phusion Passenger.${NC}"
  echo -e "${YELLOW}    Configurez l'app Node.js dans cPanel > Setup Node.js App :${NC}"
  echo -e "${YELLOW}    - Version : Node.js 20+${NC}"
  echo -e "${YELLOW}    - Mode : Production${NC}"
  echo -e "${YELLOW}    - Startup file : server.js${NC}"
  echo -e "${YELLOW}    - Application URL : getsigmaevents.com${NC}"
fi

# ============================================================
# 7. VÉRIFICATION
# ============================================================
echo ""
echo -e "${YELLOW}7/7 — Vérification...${NC}"

if [ -f ".next/BUILD_ID" ]; then
  BUILD_ID=$(cat .next/BUILD_ID)
  echo -e "${GREEN}✅ Build ID : ${BUILD_ID}${NC}"
else
  echo -e "${RED}⚠️  Build ID non trouvé${NC}"
fi

echo ""
echo "================================================"
echo -e "${GREEN}✅ DÉPLOIEMENT TERMINÉ !${NC}"
echo "================================================"
echo ""
echo "📋 Prochaines étapes :"
echo "  1. Configurez le domaine dans cPanel > Domains"
echo "  2. Activez SSL dans cPanel > SSL/TLS"
echo "  3. Configurez le webhook FeexPay :"
echo "     https://getsigmaevents.com/api/webhooks/feexpay"
echo "  4. Testez le site : https://getsigmaevents.com"
echo ""
