#!/usr/bin/env bash
# audit-tenant-schema.sh — comprueba que cada BD `saycu_pasarela_<CODIGO>`
# cuyo tenant tiene el servicio `pasarela` activo en `saycu_admin.empresas`
# tiene aplicadas TODAS las migraciones `*_tenant*.sql` del repo.
#
# Detecta el tipo de drift del 2026-05-26: la migración 0014 añadía la
# columna `pedidos_pcs_extra.terminal_devolucion_codigo`, pero su comentario
# la circunscribía a tenants con PCS Valencia activo y solo se aplicó a
# saycu_pasarela_jsr. El endpoint del admin
# (/api/admin/pasarela-datos/empresas/:cod/pedidos) la consulta para
# CUALQUIER tenant con `pasarela`, y reventó con 500 al abrir TEST. Los
# tests E2E del grupo (audit-db-permissions, test_exhaustivo de
# saycutrans/saycucontrol) no comparan el schema canónico del repo contra
# el real de cada BD tenant de pasarela, así que el drift quedó en
# silencio hasta la primera petición humana.
#
# Cómo funciona:
#   1. Crea una BD efímera `saycu_pasarela_audit_<pid>_<ts>` en el host.
#   2. Aplica TODAS las migraciones `db/migrations/*_tenant*.sql` del repo
#      en orden lexicográfico (idempotentes — el orden ya garantiza el
#      resultado canónico).
#   3. Lista empresas con `pasarela` activo en `saycu_admin.empresas`.
#   4. Para cada `saycu_pasarela_<codigo>` real, dumpea
#      `information_schema.columns` (schema public) y lo compara con el
#      dump de la BD canónica. Reporta cada `tabla.columna|tipo` que esté
#      en la canónica y NO en el tenant (drift "tenant atrasado").
#      Las columnas que estén en el tenant y NO en la canónica también se
#      reportan (drift "tenant adelantado" — normalmente una migración
#      del repo retirada o cambio fuera de migraciones).
#   5. DROP de la BD efímera al terminar (también si el script aborta).
#
# Uso:
#   bash _scripts/audit-tenant-schema.sh           # auditoría en prod
#   bash _scripts/audit-tenant-schema.sh dev       # en dev
#   bash _scripts/audit-tenant-schema.sh prod TEST # solo el tenant TEST
#
# Variables de entorno opcionales:
#   SSH_PROD (default: saycu)
#   SSH_DEV  (default: saycudev)
#   PG_CONTAINER (default: system-postgres)
#   PG_USER (default: postgres)
#
# Salida:
#   0 — sin drift en ningún tenant.
#   1 — al menos un tenant tiene drift respecto al schema canónico.
#   2 — error de conexión / SQL / aplicación de migración.
#
# Requisitos: SSH al host (los alias del grupo) + acceso al contenedor
# `system-postgres`. Compatible con bash 3.2 (macOS).

set -u

ENV_ARG="${1:-prod}"
TENANT_FILTER="${2:-}"

case "$ENV_ARG" in
  dev)  SSH_HOST="${SSH_DEV:-saycudev}" ;;
  prod) SSH_HOST="${SSH_PROD:-saycu}" ;;
  *) echo "uso: $0 [dev|prod] [CODIGO_TENANT_OPCIONAL]" >&2; exit 2 ;;
esac

PG_CONTAINER="${PG_CONTAINER:-system-postgres}"
PG_USER="${PG_USER:-postgres}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/db/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "ERROR: no se encuentra $MIGRATIONS_DIR" >&2
  exit 2
fi

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t audit-pasarela)"
AUDIT_DB="saycu_pasarela_audit_$$_$(date +%s)"

if [ -t 1 ]; then
  C_CYAN=$'\033[1;36m'
  C_RED=$'\033[1;31m'
  C_YELLOW=$'\033[1;33m'
  C_GREEN=$'\033[1;32m'
  C_DIM=$'\033[2m'
  C_RESET=$'\033[0m'
else
  C_CYAN=""; C_RED=""; C_YELLOW=""; C_GREEN=""; C_DIM=""; C_RESET=""
fi

cleanup() {
  # DROP de la BD efímera. Se hace en cualquier salida para no dejar
  # restos si el script aborta a mitad.
  if [ -n "${AUDIT_DB_CREATED:-}" ]; then
    printf 'DROP DATABASE IF EXISTS %s;\n' "$AUDIT_DB" | \
      ssh -o BatchMode=yes "$SSH_HOST" \
        "docker exec -i $PG_CONTAINER psql -U $PG_USER -d postgres -f -" \
      >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

psql_remote_sql() {
  # Ejecuta una sentencia SQL pasada por stdin del propio script.
  # Evita el infierno de quoting de -c "..." atravesando dos shells (la
  # local que arma el ssh y la remota que ejecuta docker exec).
  # Modos: tuple-only/unaligned (-tA) para parseo, o full para CREATE.
  local db="$1"; local mode="${2:-full}"
  local extra=""
  [ "$mode" = "tA" ] && extra="-tA"
  ssh -o BatchMode=yes -o ConnectTimeout=30 "$SSH_HOST" \
    "docker exec -i $PG_CONTAINER psql -U $PG_USER -d $db -v ON_ERROR_STOP=1 $extra -f -"
}

psql_remote_stdin_file() {
  # Igual que psql_remote_sql pero la SQL viene de un fichero local del
  # caller (vía redirección en la invocación).
  local db="$1"
  ssh -o BatchMode=yes -o ConnectTimeout=60 "$SSH_HOST" \
    "docker exec -i $PG_CONTAINER psql -U $PG_USER -d $db -v ON_ERROR_STOP=1 -f -"
}

echo "${C_CYAN}=== Auditoría de schema tenant pasarela en ${SSH_HOST} ===${C_RESET}"
echo

# --- 1. Crear BD efímera --------------------------------------------------
echo "${C_DIM}1) Crear BD canónica efímera ${AUDIT_DB}${C_RESET}"
if ! printf 'CREATE DATABASE %s OWNER saycutrans;\n' "$AUDIT_DB" \
      | psql_remote_sql postgres full \
      > "$TMP_DIR/mig.out" 2> "$TMP_DIR/err.txt"; then
  echo "${C_RED}ERROR creando $AUDIT_DB:${C_RESET}" >&2
  cat "$TMP_DIR/err.txt" >&2
  exit 2
fi
AUDIT_DB_CREATED=1

# --- 2. Aplicar migraciones *_tenant*.sql en orden ------------------------
echo "${C_DIM}2) Aplicar migraciones *_tenant*.sql del repo${C_RESET}"
N_MIGRATIONS=0
for sql in "$MIGRATIONS_DIR"/*_tenant*.sql; do
  [ -f "$sql" ] || continue
  fname=$(basename "$sql")
  N_MIGRATIONS=$((N_MIGRATIONS+1))
  if ! psql_remote_stdin_file "$AUDIT_DB" < "$sql" >"$TMP_DIR/mig.out" 2>"$TMP_DIR/mig.err"; then
    echo "${C_RED}ERROR aplicando $fname a $AUDIT_DB:${C_RESET}" >&2
    cat "$TMP_DIR/mig.err" >&2
    exit 2
  fi
done
echo "${C_DIM}   $N_MIGRATIONS migraciones aplicadas${C_RESET}"

# --- 3. Listar empresas con `pasarela` activo -----------------------------
echo "${C_DIM}3) Listar empresas con servicio 'pasarela' activo${C_RESET}"
if ! printf "%s\n" "SELECT lower(codigo) FROM empresas WHERE 'pasarela' = ANY(servicios) ORDER BY codigo;" \
      | psql_remote_sql saycu_admin tA \
      > "$TMP_DIR/empresas.txt" 2>"$TMP_DIR/err.txt"; then
  echo "${C_RED}ERROR listando empresas:${C_RESET}" >&2
  cat "$TMP_DIR/err.txt" >&2
  exit 2
fi

if [ -n "$TENANT_FILTER" ]; then
  TENANT_LOWER=$(printf '%s' "$TENANT_FILTER" | tr 'A-Z' 'a-z')
  grep -Fx "$TENANT_LOWER" "$TMP_DIR/empresas.txt" > "$TMP_DIR/empresas-filtradas.txt" || true
  mv "$TMP_DIR/empresas-filtradas.txt" "$TMP_DIR/empresas.txt"
fi

N_EMPRESAS=$(wc -l < "$TMP_DIR/empresas.txt" | tr -d ' ')
echo "${C_DIM}   $N_EMPRESAS empresa(s) a comprobar${C_RESET}"
echo

# --- 4. Dump del schema canónico ------------------------------------------
SCHEMA_QUERY="SELECT lower(table_name) || '.' || lower(column_name) || '|' || lower(data_type) FROM information_schema.columns WHERE table_schema='public' ORDER BY 1;"

if ! printf "%s\n" "$SCHEMA_QUERY" \
      | psql_remote_sql "$AUDIT_DB" tA \
      > "$TMP_DIR/canonical.txt" 2>"$TMP_DIR/err.txt"; then
  echo "${C_RED}ERROR dumpeando schema canónico:${C_RESET}" >&2
  cat "$TMP_DIR/err.txt" >&2
  exit 2
fi
N_CANONICAL=$(wc -l < "$TMP_DIR/canonical.txt" | tr -d ' ')

# --- 5. Comparar cada tenant ----------------------------------------------
TOTAL_DBS=0
DBS_WITH_DRIFT=0
TOTAL_MISSING=0
TOTAL_EXTRA=0

while IFS= read -r codigo; do
  [ -z "$codigo" ] && continue
  TOTAL_DBS=$((TOTAL_DBS+1))
  tenant_db="saycu_pasarela_${codigo}"

  # ¿Existe la BD del tenant?
  EXISTS=$(printf "%s\n" "SELECT 1 FROM pg_database WHERE datname='$tenant_db';" \
    | psql_remote_sql postgres tA 2>/dev/null | tr -d '[:space:]')
  if [ "$EXISTS" != "1" ]; then
    DBS_WITH_DRIFT=$((DBS_WITH_DRIFT+1))
    echo "${C_YELLOW}── ${codigo} ── BD ${tenant_db} NO EXISTE${C_RESET}"
    echo "  ${C_RED}empresa con servicio 'pasarela' activo pero sin BD provisionada${C_RESET}"
    echo "  ${C_DIM}→ crear BD y aplicar todas las *_tenant*.sql, o desactivar el servicio${C_RESET}"
    echo
    continue
  fi

  if ! printf "%s\n" "$SCHEMA_QUERY" \
        | psql_remote_sql "$tenant_db" tA \
        > "$TMP_DIR/tenant.txt" 2>"$TMP_DIR/err.txt"; then
    echo "${C_RED}ERROR dumpeando $tenant_db:${C_RESET}" >&2
    cat "$TMP_DIR/err.txt" >&2
    exit 2
  fi

  # `comm` requiere entradas ordenadas. Los dumps ya vienen ORDER BY pero
  # forzamos sort por seguridad (locale C para evitar sorpresas).
  LC_ALL=C sort "$TMP_DIR/canonical.txt" > "$TMP_DIR/canonical-sorted.txt"
  LC_ALL=C sort "$TMP_DIR/tenant.txt"    > "$TMP_DIR/tenant-sorted.txt"

  comm -23 "$TMP_DIR/canonical-sorted.txt" "$TMP_DIR/tenant-sorted.txt" > "$TMP_DIR/missing.txt"
  comm -13 "$TMP_DIR/canonical-sorted.txt" "$TMP_DIR/tenant-sorted.txt" > "$TMP_DIR/extra.txt"

  N_MISSING=$(wc -l < "$TMP_DIR/missing.txt" | tr -d ' ')
  N_EXTRA=$(wc -l < "$TMP_DIR/extra.txt" | tr -d ' ')

  if [ "$N_MISSING" = "0" ] && [ "$N_EXTRA" = "0" ]; then
    continue
  fi

  DBS_WITH_DRIFT=$((DBS_WITH_DRIFT+1))
  TOTAL_MISSING=$((TOTAL_MISSING+N_MISSING))
  TOTAL_EXTRA=$((TOTAL_EXTRA+N_EXTRA))

  echo "${C_YELLOW}── ${codigo} (${tenant_db}) ──${C_RESET}"
  if [ "$N_MISSING" -gt 0 ]; then
    echo "  ${C_RED}faltan ${N_MISSING} columna(s) presentes en la canónica:${C_RESET}"
    sed 's/^/    /' "$TMP_DIR/missing.txt"
    echo "  ${C_DIM}→ revisar qué migraciones *_tenant*.sql no se aplicaron a $tenant_db${C_RESET}"
  fi
  if [ "$N_EXTRA" -gt 0 ]; then
    echo "  ${C_YELLOW}columnas en el tenant que NO están en la canónica (${N_EXTRA}):${C_RESET}"
    sed 's/^/    /' "$TMP_DIR/extra.txt"
    echo "  ${C_DIM}→ ¿migración retirada del repo? ¿cambio fuera de migraciones?${C_RESET}"
  fi
  echo

done < "$TMP_DIR/empresas.txt"

# --- 6. Resumen -----------------------------------------------------------
echo "${C_CYAN}== Resumen ==${C_RESET}"
echo "  Migraciones canónicas aplicadas: $N_MIGRATIONS"
echo "  Columnas en el schema canónico:  $N_CANONICAL"
echo "  Tenants comprobados:             $TOTAL_DBS"
echo "  Tenants con drift:               $DBS_WITH_DRIFT"
echo "  Columnas faltantes (total):      $TOTAL_MISSING"
echo "  Columnas sobrantes (total):      $TOTAL_EXTRA"

if [ "$DBS_WITH_DRIFT" -eq 0 ]; then
  echo "${C_GREEN}OK — todos los tenants con 'pasarela' tienen el schema canónico.${C_RESET}"
  exit 0
fi

echo "${C_YELLOW}DRIFT — ver detalle arriba.${C_RESET}"
exit 1
