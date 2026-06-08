#!/usr/bin/env bash
set -euo pipefail

# deploy-panel-prod.sh — Despliega pasarela/panel a saycu (PROD).
#
# Mismos pasos que deploy-panel-dev pero apuntando a `saycu`. Antes de
# correr este script hay que tener el panel probado en dev.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SAYCU_THEME_LOCAL="$ROOT_DIR/../../saycu-theme"
REMOTE_HOST="saycu"
REMOTE_DIR="/var/opt/superapitrans/pasarela"

log()  { printf '[deploy-panel-prod] %s\n' "$*"; }
fail() { printf '[deploy-panel-prod][ERROR] %s\n' "$*" >&2; exit 1; }

[ -d "$SAYCU_THEME_LOCAL" ] || fail "No existe $SAYCU_THEME_LOCAL"

log "1) Vendor-copy saycu-theme → $ROOT_DIR/saycu-theme/"
rsync -az --delete \
  --exclude=node_modules --exclude=.DS_Store --exclude=.git \
  "$SAYCU_THEME_LOCAL/" "$ROOT_DIR/saycu-theme/"

log "2) rsync pasarela → $REMOTE_HOST:$REMOTE_DIR/"
rsync -az --delete \
  --exclude=node_modules --exclude=panel/dist --exclude=.git \
  --exclude=.env --exclude=.env-dev --exclude=.env-prod \
  --exclude=.DS_Store \
  "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

log "3) bootstrap-env.sh (auto-selecciona .env-dev / .env-prod → .env)"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && _scripts/bootstrap-env.sh"

log "4) docker compose build + up -d (pasarela_panel)"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && docker compose build panel && docker compose up -d panel" 2>&1 | tail -20

log "5) Verificación"
sleep 2
ssh "$REMOTE_HOST" "docker ps --filter name=pasarela_panel --format 'table {{.Names}}\t{{.Status}}'"

log "OK. Probar:  https://panel.saycunode.saycutrans.es/pasarela/"
