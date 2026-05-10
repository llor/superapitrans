#!/usr/bin/env bash
set -euo pipefail

# bootstrap-env.sh — auto-selección DEV/PROD para pasarela.
#
# Detecta el entorno por /etc/hosts (marca "DESARROLLO" → dev; si no → prod)
# y copia .env-dev / .env-prod sobre .env. El código solo lee .env.
# Se ejecuta SIEMPRE en el servidor remoto, llamado por los deploy-*.sh
# tras el rsync, antes del docker compose.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if grep -Eiqw 'DESARROLLO' /etc/hosts; then
    SRC=".env-dev"
    ENV_LABEL="dev"
else
    SRC=".env-prod"
    ENV_LABEL="prod"
fi

if [ ! -f "$SRC" ]; then
    echo "[bootstrap-env][ERROR] Falta $ROOT_DIR/$SRC en este servidor." >&2
    echo "Crea ese fichero a partir de ${SRC}.example con los secretos reales." >&2
    exit 1
fi

cp "$SRC" .env
echo "[bootstrap-env] $SRC → .env (entorno: $ENV_LABEL)"
