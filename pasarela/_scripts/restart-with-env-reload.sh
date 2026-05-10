#!/usr/bin/env bash
set -euo pipefail

# restart-with-env-reload.sh — reinicia pasarela_api en el servidor remoto
# recargando el env_file. Útil cuando se ha tocado el .env (añadir/cambiar
# una variable) y NO se quiere hacer un deploy completo.
#
# IMPORTANTE: `docker compose restart` NO recarga env_file. Solo `up -d
# --force-recreate` lo hace. Si tocas variables y haces restart, el
# contenedor sigue con los valores anteriores y puedes pensar que se
# aplicaron cuando no es así. (Lección aprendida tras un commit accidental
# a Satelles porque PASARELA_DRY_RUN=true no estaba activo en runtime.)
#
# Uso:
#   ./restart-with-env-reload.sh [--dev|--prod]
#   (por defecto autodetecta entorno por /etc/hosts del servidor)

REMOTE_HOST="${1:-}"
case "$REMOTE_HOST" in
  --dev)  REMOTE_HOST="saycudev" ;;
  --prod) REMOTE_HOST="saycu" ;;
  "")     REMOTE_HOST="$(grep -Eiqw 'DESARROLLO' /etc/hosts && echo saycudev || echo saycu)" ;;
esac

REMOTE_DIR="/var/opt/superapitrans/pasarela"

echo "[restart-env] host=$REMOTE_HOST dir=$REMOTE_DIR"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && docker compose up -d --force-recreate api"
sleep 2
echo "[restart-env] PASARELA_DRY_RUN actual:"
ssh "$REMOTE_HOST" "docker exec pasarela_api printenv PASARELA_DRY_RUN || echo '(no definida)'"
echo "[restart-env] OK"
