#!/usr/bin/env bash
# Imprime la ESTRUCTURA (sin datos) de la base de datos de superapitrans.
# Multi-tenant (pasarela): una base de tenant como muestra.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
"$RAIZ/_scripts/volcar-estructura-pg.sh" saycu system-postgres postgres saycu_pasarela_demo
