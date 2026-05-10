#!/usr/bin/env bash
set -euo pipefail

# deploy-api-dev.sh — Despliega chofocles/api a saycudev.
#
# Pasos:
#   1) rsync del proyecto chofocles/ a saycudev (api + db + ingestor + compose).
#   2) bootstrap-env.sh (auto-selecciona .env-dev / .env-prod → .env por /etc/hosts).
#   3) docker compose build api + up -d --force-recreate api.
#   4) Verificar que el contenedor responde /chofocles/health.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="saycudev"
REMOTE_DIR="/var/opt/superapitrans/chofocles"

log()  { printf '[deploy-api-dev] %s\n' "$*"; }
fail() { printf '[deploy-api-dev][ERROR] %s\n' "$*" >&2; exit 1; }

log "1) rsync chofocles → $REMOTE_HOST:$REMOTE_DIR/"
rsync -az --delete \
  --exclude=node_modules --exclude=panel/dist --exclude=.git \
  --exclude=.env --exclude=.env-dev --exclude=.env-prod \
  --exclude=.DS_Store \
  "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

log "2) bootstrap-env.sh (auto-selecciona .env-dev / .env-prod → .env)"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && _scripts/bootstrap-env.sh"

log "3) docker compose build + up -d --force-recreate api"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && docker compose build api && docker compose up -d --force-recreate api" 2>&1 | tail -20

log "4) Verificación"
sleep 4
ssh "$REMOTE_HOST" "docker ps --filter name=chofocles_api --format 'table {{.Names}}\t{{.Status}}'"
ssh "$REMOTE_HOST" "curl -fsS https://dev-api.superapi.eoden.es/chofocles/health || echo 'health check FAIL'"

log "OK. API en: https://dev-api.superapi.eoden.es/chofocles/"
