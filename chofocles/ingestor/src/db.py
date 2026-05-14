"""Conexión a PostgreSQL.

Caché de conexiones por BBDD (admin + tenant). Patrón Saycu.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import psycopg2
import psycopg2.extensions
import psycopg2.extras

_LOG = logging.getLogger('chofocles.db')


def _required(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f'Variable de entorno {name} no definida')
    return v


def _base_kwargs() -> dict[str, Any]:
    return {
        'host': _required('DB_HOST'),
        'port': int(_required('DB_PORT')),
        'user': _required('DB_USER'),
        'password': _required('DB_PASSWORD'),
    }


_admin_conn: psycopg2.extensions.connection | None = None
_tenant_conns: dict[str, psycopg2.extensions.connection] = {}


def _ensure_clean(conn: psycopg2.extensions.connection, db_name: str) -> None:
    """Devuelve la conexión cacheada en estado limpio (sin transacción
    colgada). Si un ciclo anterior dejó una transacción ABIERTA (INTRANS)
    o ABORTADA (INERROR) sin commit/rollback, aquí se hace rollback para
    que la siguiente query no falle con
    'current transaction is aborted, commands ignored until end of
    transaction block'.

    NO es un fallback silencioso: el evento se loguea con contexto y, en
    el caso INERROR, con severidad ERROR (el handler del reporter lo
    enviará al receptor central). Indica un bug aguas arriba (algún
    catch o flujo sin rollback) que conviene localizar.
    """
    try:
        status = conn.get_transaction_status()
    except Exception as e:
        _LOG.error(
            "no se pudo consultar transaction_status de %s: %s — se descarta la conexión",
            db_name, e,
        )
        try:
            conn.close()
        except Exception:
            pass
        raise

    if status == psycopg2.extensions.TRANSACTION_STATUS_INERROR:
        _LOG.error(
            "conexión cacheada %s venía con transacción ABORTADA — rollback preventivo. "
            "Algún flujo previo dejó una transacción sin commit/rollback tras un error",
            db_name,
        )
        conn.rollback()
    elif status == psycopg2.extensions.TRANSACTION_STATUS_INTRANS:
        _LOG.warning(
            "conexión cacheada %s venía con transacción ABIERTA sin cerrar — rollback preventivo",
            db_name,
        )
        conn.rollback()


def admin_conn() -> psycopg2.extensions.connection:
    global _admin_conn
    if _admin_conn is None or _admin_conn.closed:
        _admin_conn = psycopg2.connect(database='saycu_admin', **_base_kwargs())
        _admin_conn.autocommit = False
    else:
        _ensure_clean(_admin_conn, 'saycu_admin')
    return _admin_conn


def tenant_db_name(empresa_codigo: str) -> str:
    if not empresa_codigo or not isinstance(empresa_codigo, str):
        raise ValueError('empresa_codigo requerido (str)')
    return f'saycu_chofocles_{empresa_codigo.lower()}'


def tenant_conn(empresa_codigo: str) -> psycopg2.extensions.connection:
    db_name = tenant_db_name(empresa_codigo)
    conn = _tenant_conns.get(db_name)
    if conn is None or conn.closed:
        conn = psycopg2.connect(database=db_name, **_base_kwargs())
        conn.autocommit = False
        _tenant_conns[db_name] = conn
    else:
        _ensure_clean(conn, db_name)
    return conn


def close_all() -> None:
    global _admin_conn
    for c in _tenant_conns.values():
        try:
            c.close()
        except Exception:
            pass
    _tenant_conns.clear()
    if _admin_conn is not None:
        try:
            _admin_conn.close()
        except Exception:
            pass
        _admin_conn = None


def dictcursor(conn: psycopg2.extensions.connection):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
