#!/usr/bin/env bash
# Test HTTP des nouvelles fonctionnalités de la phase MVP.
cd "$(dirname "$0")/.." || exit 1

# --- Serveur : démarrer si rien ne tourne sur le port ---
if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/login; then
  echo "→ Démarrage du serveur (build de prod récent)…"
  (nohup npm run start >/tmp/sigma-phase1b.log 2>&1 &)
  for i in $(seq 1 20); do
    curl -s -o /dev/null --max-time 3 http://localhost:3000/login && break
    sleep 2
  done
fi
echo "Serveur : $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/login)"

# --- Sessions ---
ORG_TOKEN=$(SESSION_ROLE=ORGANIZER npx tsx scripts/make-session.ts 2>/dev/null | grep '^TOKEN=' | cut -d= -f2)
AGENT_TOKEN=$(SESSION_ROLE=AGENT npx tsx scripts/make-session.ts 2>/dev/null | grep '^TOKEN=' | cut -d= -f2)
echo "Session organisateur : ${ORG_TOKEN:0:8}… | Session agent : ${AGENT_TOKEN:0:8}…"

PASS=0
FAIL=0
check() { # check <description> <attendu> <obtenu>
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1)); echo "  ✅ $1"
  else
    FAIL=$((FAIL+1)); echo "  ❌ $1 (attendu: $2, obtenu: $3)"
  fi
}

echo ""
echo "=== 1. Export CSV du journal ==="
STATUS=$(curl -s -o /tmp/export.csv -w '%{http_code}' --max-time 15 -H "Cookie: sigma_session=$ORG_TOKEN" http://localhost:3000/api/events/demo-event/export)
check "Export organisateur → 200" "200" "$STATUS"
BOM=$(head -c 3 /tmp/export.csv | xxd -p)
check "BOM UTF-8 présent (Excel accents)" "efbbbf" "$BOM"
HEADER=$(tail -c +4 /tmp/export.csv | head -1 | tr -d '\r')
check "En-tête CSV 'Statut;Participant;…'" "Statut;Participant;Téléphone;Catégorie;Code billet;Agent;Date et heure;Source" "$HEADER"
STATUS401=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://localhost:3000/api/events/demo-event/export)
check "Sans session → 401" "401" "$STATUS401"
STATUS_AGENT=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Cookie: sigma_session=$AGENT_TOKEN" http://localhost:3000/api/events/demo-event/export)
check "Agent (non organisateur) → 401" "401" "$STATUS_AGENT"

echo ""
echo "=== 2. Rapport PDF imprimable ==="
STATUS=$(curl -s -o /tmp/rapport.html -w '%{http_code}' --max-time 20 -H "Cookie: sigma_session=$ORG_TOKEN" http://localhost:3000/events/demo-event/rapport)
check "GET /events/demo-event/rapport → 200" "200" "$STATUS"
grep -q "Rapport de contrôle" /tmp/rapport.html && { PASS=$((PASS+1)); echo "  ✅ Titre 'Rapport de contrôle' présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Titre absent"; }
grep -q "Imprimer" /tmp/rapport.html && { PASS=$((PASS+1)); echo "  ✅ Bouton imprimer présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Bouton imprimer absent"; }
grep -q "Journal des entrées" /tmp/rapport.html && { PASS=$((PASS+1)); echo "  ✅ Journal présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Journal absent"; }

echo ""
echo "=== 3. Billets imprimables A4 ==="
STATUS=$(curl -s -o /tmp/billets.html -w '%{http_code}' --max-time 20 -H "Cookie: sigma_session=$ORG_TOKEN" http://localhost:3000/events/demo-event/billets)
check "GET /events/demo-event/billets → 200" "200" "$STATUS"
grep -q "Imprimer les billets" /tmp/billets.html && { PASS=$((PASS+1)); echo "  ✅ Bouton 'Imprimer les billets' présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Bouton absent"; }
grep -q "DEMO-VIP-0001" /tmp/billets.html && { PASS=$((PASS+1)); echo "  ✅ Billet DEMO-VIP-0001 présent avec QR"; } || { FAIL=$((FAIL+1)); echo "  ❌ Billet absent"; }

echo ""
echo "=== 4. Page événement (import CSV + liens) ==="
STATUS=$(curl -s -o /tmp/event.html -w '%{http_code}' --max-time 20 -H "Cookie: sigma_session=$ORG_TOKEN" http://localhost:3000/events/demo-event)
check "GET /events/demo-event → 200" "200" "$STATUS"
grep -q "Importer CSV" /tmp/event.html && { PASS=$((PASS+1)); echo "  ✅ Bouton 'Importer CSV' présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Import CSV absent"; }
grep -q 'api/events/demo-event/export' /tmp/event.html && { PASS=$((PASS+1)); echo "  ✅ Lien export CSV présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Lien export absent"; }
grep -q '/events/demo-event/rapport' /tmp/event.html && { PASS=$((PASS+1)); echo "  ✅ Lien rapport présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Lien rapport absent"; }
grep -q '/events/demo-event/billets' /tmp/event.html && { PASS=$((PASS+1)); echo "  ✅ Lien billets présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Lien billets absent"; }

echo ""
echo "=== 5. Sécurité des pages événement ==="
STATUS_AGENT=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Cookie: sigma_session=$AGENT_TOKEN" http://localhost:3000/events/demo-event/rapport)
check "Agent sur /rapport → redirection (307/302)" "307" "$STATUS_AGENT"

echo ""
echo "=== 6. Billetterie en ligne (public) ==="
STATUS=$(curl -s -o /tmp/buy.html -w '%{http_code}' --max-time 20 http://localhost:3000/acheter/gbediga-vodoun-night)
check "GET /acheter/gbediga-vodoun-night → 200 (sans session)" "200" "$STATUS"
grep -q "Réservez votre place" /tmp/buy.html && { PASS=$((PASS+1)); echo "  ✅ Formulaire 'Réservez votre place' présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Formulaire absent"; }
grep -q "Choisissez votre billet" /tmp/buy.html && { PASS=$((PASS+1)); echo "  ✅ Sélecteur de billet présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Sélecteur absent"; }
grep -q "15 000 FCFA\|15000" /tmp/buy.html && { PASS=$((PASS+1)); echo "  ✅ Prix VIP présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Prix VIP absent"; }
grep -q "5 000 FCFA\|5000" /tmp/buy.html && { PASS=$((PASS+1)); echo "  ✅ Prix Standard présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Prix Standard absent"; }
STATUS404=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://localhost:3000/acheter/slug-inexistant)
check "Slug inconnu → 404" "404" "$STATUS404"

echo ""
echo "=== 7. Lien de vente sur la page événement ==="
STATUS=$(curl -s -o /tmp/event2.html -w '%{http_code}' --max-time 20 -H "Cookie: sigma_session=$ORG_TOKEN" http://localhost:3000/events/demo-event)
check "GET /events/demo-event → 200" "200" "$STATUS"
grep -q "Vente en ligne" /tmp/event2.html && { PASS=$((PASS+1)); echo "  ✅ Section 'Vente en ligne' présente"; } || { FAIL=$((FAIL+1)); echo "  ❌ Section vente absente"; }
grep -q 'acheter/gbediga-vodoun-night' /tmp/event2.html && { PASS=$((PASS+1)); echo "  ✅ Lien d'achat affiché"; } || { FAIL=$((FAIL+1)); echo "  ❌ Lien d'achat absent"; }

echo ""
echo "=== 8. Super admin (espace /admin) ==="
ADMIN_TOKEN=$(SESSION_ROLE=SUPER_ADMIN npx tsx scripts/make-session.ts 2>/dev/null | grep '^TOKEN=' | cut -d= -f2)
STATUS=$(curl -s -o /tmp/admin.html -w '%{http_code}' --max-time 20 -H "Cookie: sigma_session=$ADMIN_TOKEN" http://localhost:3000/admin)
check "GET /admin (super admin) → 200" "200" "$STATUS"
grep -q "Vue d.ensemble de la plateforme" /tmp/admin.html && { PASS=$((PASS+1)); echo "  ✅ Stats plateforme présentes"; } || { FAIL=$((FAIL+1)); echo "  ❌ Stats absentes"; }
grep -q "Commissions Sigma" /tmp/admin.html && { PASS=$((PASS+1)); echo "  ✅ Commissions affichées"; } || { FAIL=$((FAIL+1)); echo "  ❌ Commissions absentes"; }
STATUS=$(curl -s -o /tmp/admin-orgs.html -w '%{http_code}' --max-time 20 -H "Cookie: sigma_session=$ADMIN_TOKEN" http://localhost:3000/admin/organisateurs)
check "GET /admin/organisateurs → 200" "200" "$STATUS"
grep -q "Bloquer" /tmp/admin-orgs.html && { PASS=$((PASS+1)); echo "  ✅ Bouton bloquer présent"; } || { FAIL=$((FAIL+1)); echo "  ❌ Bouton bloquer absent"; }
STATUS=$(curl -s -o /tmp/admin-evts.html -w '%{http_code}' --max-time 20 -H "Cookie: sigma_session=$ADMIN_TOKEN" http://localhost:3000/admin/evenements)
check "GET /admin/evenements → 200" "200" "$STATUS"
grep -q "Concert Gbèdiga" /tmp/admin-evts.html && { PASS=$((PASS+1)); echo "  ✅ Événements listés"; } || { FAIL=$((FAIL+1)); echo "  ❌ Événements absents"; }
# Un organisateur ne doit PAS accéder à /admin
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Cookie: sigma_session=$ORG_TOKEN" http://localhost:3000/admin)
check "Organisateur sur /admin → redirection (307)" "307" "$STATUS"

echo ""
echo "=== 9. Cycle de vie & boutique (brouillon) ==="
# Boutique LIVE enrichie : description + infos pratiques
STATUS=$(curl -s -o /tmp/shop-live.html -w '%{http_code}' --max-time 20 http://localhost:3000/acheter/gbediga-vodoun-night)
check "Boutique démo → 200" "200" "$STATUS"
grep -q "Une nuit exceptionnelle" /tmp/shop-live.html && { PASS=$((PASS+1)); echo "  ✅ Description affichée"; } || { FAIL=$((FAIL+1)); echo "  ❌ Description absente"; }
grep -q "Portes ouvertes à" /tmp/shop-live.html && { PASS=$((PASS+1)); echo "  ✅ Portes ouvertes affichées"; } || { FAIL=$((FAIL+1)); echo "  ❌ Portes ouvertes absentes"; }
# Événement brouillon → boutique « à venir »
DRAFT_SLUG=$(npx tsx -e "
import { PrismaClient } from './app/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import 'dotenv/config';
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' }) });
(async () => {
  const org = await p.user.findFirst({ where: { role: 'ORGANIZER' } });
  const ev = await p.event.create({ data: { organizerId: org!.id, name: 'Brouillon HTTP', location: 'X', date: new Date(Date.now() + 86400_000 * 30), capacity: 50, status: 'DRAFT', salesSlug: 'brouillon-http-' + Date.now() } });
  console.log(ev.salesSlug);
  process.exit(0);
})();
" 2>/dev/null | tail -1)
STATUS=$(curl -s -o /tmp/shop-draft.html -w '%{http_code}' --max-time 20 http://localhost:3000/acheter/$DRAFT_SLUG)
check "Boutique brouillon → 200" "200" "$STATUS"
grep -q "Billetterie à venir" /tmp/shop-draft.html && { PASS=$((PASS+1)); echo "  ✅ État brouillon affiché"; } || { FAIL=$((FAIL+1)); echo "  ❌ État brouillon absent"; }
npx tsx -e "
import { PrismaClient } from './app/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import 'dotenv/config';
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' }) });
(async () => { await p.event.deleteMany({ where: { status: 'DRAFT' } }); process.exit(0); })();
" >/dev/null 2>&1

# Billet public : image de couverture sur /t/[code]
STATUS=$(curl -s -o /tmp/ticket.html -w '%{http_code}' --max-time 20 http://localhost:3000/t/DEMO-VIP-0001)
check "GET /t/DEMO-VIP-0001 → 200" "200" "$STATUS"
grep -q "images.unsplash.com" /tmp/ticket.html && { PASS=$((PASS+1)); echo "  ✅ Image de couverture sur le billet"; } || { FAIL=$((FAIL+1)); echo "  ❌ Image absente du billet"; }

echo ""
echo "═══════════════════════════════════"
echo "Résultat HTTP : $PASS ✅ / $FAIL ❌"
echo "═══════════════════════════════════"
exit $([ $FAIL -gt 0 ] && echo 1 || echo 0)
