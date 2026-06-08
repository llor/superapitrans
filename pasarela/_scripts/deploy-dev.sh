#!/usr/bin/env bash
set -euo pipefail

# deploy-dev.sh — Despliega pasarela/api a saycudev.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="saycudev"
REMOTE_DIR="/var/opt/superapitrans/pasarela"

log()  { printf '[deploy-pasarela-dev] %s\n' "$*"; }
fail() { printf '[deploy-pasarela-dev][ERROR] %s\n' "$*" >&2; exit 1; }

log "1) rsync pasarela → $REMOTE_HOST:$REMOTE_DIR/"
rsync -az --delete \
  --exclude=node_modules --exclude=.git \
  --exclude=.env --exclude=.env-dev --exclude=.env-prod \
  --exclude=.DS_Store \
  "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

log "2) bootstrap-env.sh (auto-selecciona .env-dev / .env-prod → .env)"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && _scripts/bootstrap-env.sh"

log "3) Aplicar migraciones admin (idempotentes) en saycu_admin"
ssh "$REMOTE_HOST" "
  set -e
  for f in $REMOTE_DIR/db/migrations/0001_admin.sql $REMOTE_DIR/db/migrations/0003_admin_satelles_host.sql $REMOTE_DIR/db/migrations/0013_admin_pasarela_config.sql; do
    docker cp \"\$f\" system-postgres:/tmp/pasarela_admin.sql
    docker exec system-postgres psql -U postgres -d saycu_admin -f /tmp/pasarela_admin.sql
  done
" 2>&1 | tail -15

log "4) docker compose build + up -d --force-recreate api"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && docker compose build api && docker compose up -d --force-recreate api" 2>&1 | tail -10

log "5) Verificación"
sleep 3
ssh "$REMOTE_HOST" "docker ps --filter name=pasarela_api --format 'table {{.Names}}\t{{.Status}}'"

log "OK. Probar:  https://dev-api.saycunode.saycutrans.es/pasarela/health"
