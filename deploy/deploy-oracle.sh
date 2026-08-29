#!/bin/bash
# ============================================================
# SIGMA EVENTS — Déploiement Oracle Cloud Always Free
# Usage : bash deploy-oracle.sh [branch]
# ============================================================

set -e

APP_DIR="/var/www/sigma-events"
BRANCH="${1:-main}"
LOG_DIR="/var/log/sigma-events"

echo "=========================================="
echo "  SIGMA EVENTS — Déploiement Oracle Cloud"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# Aller dans le répertoire de l'app
cd "$APP_DIR" || { echo "Répertoire $APP_DIR introuvable"; exit 1; }

# 1. Pull du code
echo "[1/7] Pull du code ($BRANCH)..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"
COMMIT=$(git rev-parse --short HEAD)
echo "   Commit : $COMMIT"

# 2. Installation des dépendances (ARM64)
echo "[2/7] Installation des dépendances (ARM64)..."
npm ci --production=false

# 3. Génération du client Prisma (ARM64)
echo "[3/7] Génération du client Prisma..."
npx prisma generate --schema=prisma/schema.postgres.prisma

# 4. Migration de la base de données
echo "[4/7] Migration de la base de données..."
npx prisma migrate deploy --schema=prisma/schema.postgres.prisma

# 5. Build de l'application (ARM64)
echo "[5/7] Build de Next.js..."
npm run build

# 6. Création du dossier logs
echo "[6/7] Préparation des logs..."
mkdir -p "$LOG_DIR"
chown sigma:sigma "$LOG_DIR"

# 7. Redémarrage PM2
echo "[7/7] Redémarrage de PM2..."
cd "$APP_DIR"
pm2 reload ecosystem.config.js --update-env

# Sauvegarde de la config PM2
pm2 save

echo ""
echo "=========================================="
echo "  DÉPLOIEMENT TERMINÉ"
echo "  Commit  : $COMMIT"
echo "  Status  : $(pm2 status sigma-events --no-color | tail -1)"
echo "=========================================="
