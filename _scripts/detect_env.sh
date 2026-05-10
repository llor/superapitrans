#!/usr/bin/env sh
set -eu

# Detecta DEV o PROD por marca "DESARROLLO" en /etc/hosts (patrón Saycu).
# Salida: BASE_DOMAIN y CADDY_ENV. Con --print, formato evaluable por sh.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
DOMAINS_ENV="$ROOT_DIR/docker/conf/domains.env"

if [ ! -f "$DOMAINS_ENV" ]; then
  echo "Falta $DOMAINS_ENV" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$DOMAINS_ENV"

if [ -z "${BASE_DOMAIN-}" ]; then
  echo "BASE_DOMAIN no definido en $DOMAINS_ENV" >&2
  exit 1
fi

HOSTS_FILE="/etc/hosts"
if [ ! -r "$HOSTS_FILE" ]; then
  echo "No se puede leer $HOSTS_FILE" >&2
  exit 1
fi

if grep -Eiqw 'DESARROLLO' "$HOSTS_FILE"; then
  CADDY_ENV="dev"
else
  CADDY_ENV="prod"
fi

export BASE_DOMAIN
export CADDY_ENV

if [ "${1-}" = "--print" ]; then
  echo "BASE_DOMAIN='$BASE_DOMAIN'"
  echo "CADDY_ENV='$CADDY_ENV'"
  exit 0
fi

echo "Detectado CADDY_ENV=$CADDY_ENV (marca DESARROLLO en $HOSTS_FILE)"
echo "BASE_DOMAIN=$BASE_DOMAIN"
