#!/usr/bin/env bash
set -euo pipefail

# deploy-ingestor-prod.sh — Despliega chofocles/ingestor a saycu (prod).

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="saycu"
REMOTE_DIR="/var/opt/superapitrans/chofocles"

log() { printf '[deploy-ingestor-prod] %s\n' "$*"; }

log "1) rsync chofocles → $REMOTE_HOST:$REMOTE_DIR/"
rsync -az --delete \
  --exclude=node_modules --exclude=panel/dist --exclude=.git \
  --exclude=.env --exclude=.env-dev --exclude=.env-prod \
  --exclude=.DS_Store \
  "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

log "2) bootstrap-env.sh"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && _scripts/bootstrap-env.sh"

log "3) docker compose build + up -d --force-recreate ingestor"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && docker compose build ingestor && docker compose up -d --force-recreate ingestor" 2>&1 | tail -20

log "4) Verificación"
sleep 3
ssh "$REMOTE_HOST" "docker ps --filter name=chofocles_ingestor --format 'table {{.Names}}\t{{.Status}}'"

log "OK"
