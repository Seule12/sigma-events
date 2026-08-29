#!/bin/bash
# ============================================================
# SIGMA EVENTS — Script de déploiement
# Usage : bash deploy.sh [branch]
# ============================================================

set -e

APP_DIR="/var/www/sigma-events"
BRANCH="${1:-main}"
LOG_DIR="/var/log/sigma-events"

echo "=========================================="
echo "  SIGMA EVENTS — Déploiement ($BRANCH)"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# Aller dans le répertoire de l'app
cd "$APP_DIR" || { echo "❌ Répertoire $APP_DIR introuvable"; exit 1; }

# 1. Pull du code
echo "[1/6] Pull du code ($BRANCH)..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"
COMMIT=$(git rev-parse --short HEAD)
echo "   Commit : $COMMIT"

# 2. Installation des dépendances
echo "[2/6] Installation des dépendances..."
npm ci --production=false

# 3. Génération du client Prisma
echo "[3/6] Génération du client Prisma..."
npx prisma generate --schema=prisma/schema.postgres.prisma

# 4. Migration de la base de données
echo "[4/6] Migration de la base de données..."
npx prisma migrate deploy --schema=prisma/schema.postgres.prisma

# 5. Build de l'application
echo "[5/6] Build de Next.js..."
npm run build

# 6. Redémarrage PM2
echo "[6/6] Redémarrage de PM2..."
cd "$APP_DIR"
pm2 reload ecosystem.config.js --update-env

# Sauvegarde de la config PM2
pm2 save

echo ""
echo "=========================================="
echo "  DÉPLOIEMENT TERMINÉ"
echo "  Commit  : $COMMIT"
echo "  App     : https://sigma-events.com"
echo "  Status  : $(pm2 status sigma-events --no-color | tail -1)"
echo "=========================================="
