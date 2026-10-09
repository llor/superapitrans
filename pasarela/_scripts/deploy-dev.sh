#!/usr/bin/env bash
set -euo pipefail
source "$HOME/proyectos/_scripts/deploy-cronometro.sh"

# deploy-dev.sh — Despliega pasarela/api a saycudev.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="saycudev"
REMOTE_DIR="/var/opt/superapitrans/pasarela"

log()  { printf '[deploy-pasarela-dev] %s\n' "$*"; }
fail() { printf '[deploy-pasarela-dev][ERROR] %s\n' "$*" >&2; exit 1; }

# Comparar antes de subir (norma del usuario, 2026-10-09): si la subida quitaría
# del servidor algo que esta rama no lleva (lo subido a dev desde otra rama), se
# para y dice qué rama lo lleva para fusionarla; tras subir, se apunta en el
# servidor lo subido sin commit. Override solo con autorización del
# responsable: PERMITIR_QUITAR_DE_DEV=1.
OPCIONES_SUBIDA=(--delete
  --exclude=node_modules --exclude=.git
  --exclude=.env --exclude=.env-dev --exclude=.env-prod
  --exclude=.DS_Store)
COMPARAR="$HOME/proyectos/workspace-config/scripts/comparar-antes-de-subir.py"
log "0) comparar con lo que hay en $REMOTE_HOST:$REMOTE_DIR/"
python3 "$COMPARAR" comparar superapitrans "${OPCIONES_SUBIDA[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/" \
  || fail "subida parada antes de tocar el servidor: la comparación de arriba dice qué se perdería y qué rama lo lleva"

log "1) rsync pasarela → $REMOTE_HOST:$REMOTE_DIR/"
rsync -az "${OPCIONES_SUBIDA[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"
python3 "$COMPARAR" apuntar superapitrans "${OPCIONES_SUBIDA[@]}" "$ROOT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

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

# ─── Reflejo de la estructura de la BD ──────────────────────────────────
# Vuelca la estructura de la base de datos a ESTRUCTURA-BD.md para que un
# cambio de tablas llegue al otro ordenador: los datos viven en Docker y
# nunca se copian. Norma del usuario (2026-08-07). Nunca aborta el deploy.
_ebd_proy="$(cd "$(dirname "$0")/../.." && pwd)"
_ebd_raiz="$_ebd_proy"
while [ "$_ebd_raiz" != "/" ] && [ ! -f "$_ebd_raiz/_scripts/reflejar-estructura-bd.sh" ]; do
  _ebd_raiz="$(dirname "$_ebd_raiz")"
done
if [ -f "$_ebd_raiz/_scripts/reflejar-estructura-bd.sh" ]; then
  bash "$_ebd_raiz/_scripts/reflejar-estructura-bd.sh" "$_ebd_proy" || true
fi
# ────────────────────────────────────────────────────────────────────────
