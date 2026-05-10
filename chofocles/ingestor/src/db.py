"""Conexión a PostgreSQL.

Caché de conexiones por BBDD (admin + tenant). Patrón Saycu.
"""
from __future__ import annotations

import os
from typing import Any

import psycopg2
import psycopg2.extras


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


def admin_conn() -> psycopg2.extensions.connection:
    global _admin_conn
    if _admin_conn is None or _admin_conn.closed:
        _admin_conn = psycopg2.connect(database='saycu_admin', **_base_kwargs())
        _admin_conn.autocommit = False
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
