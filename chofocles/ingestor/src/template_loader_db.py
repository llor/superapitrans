"""Carga de plantillas desde la BBDD `saycu_admin.chofocles_plantillas_json`.

El extractor existente (extractor.py) trabaja con objetos `Plantilla`
construidos a partir de YAML. Este módulo produce esos mismos objetos
desde BD para que el ingestor pueda funcionar sin tocar archivos.

Las plantillas YAML estáticas siguen funcionando: se cargan primero, y
las de BD se concatenan después (las de BD tienen prioridad si comparten
nombre porque se evalúan después y la primera que casa gana).

Formato esperado en `definicion` (mismo que YAML):
    {
        "empresa": "<nombre legible>",
        "match": {"all": [...], "any": [...]},
        "fields": {
            "<campo_piloto_o_canonico>": {"tipo": "regex", "pattern": "...", ...},
            ...
        }
    }
"""
from __future__ import annotations

import logging
from pathlib import Path

from extractor import Plantilla, cargar_plantillas

LOG = logging.getLogger('chofocles.template_loader_db')


def _row_a_plantilla(row: dict) -> Plantilla:
    definicion = row['definicion'] or {}
    nombre = (
        f"db-v{row['version']}-"
        f"{(row['operador_cif'] or row['operador_email_dominio'] or row['operador_nombre'] or 'sin-id')}"
    )
    return Plantilla(
        nombre=nombre,
        archivo=Path('<bd>'),
        empresa=definicion.get('empresa') or row['operador_nombre'] or nombre,
        match=definicion.get('match') or {},
        fields=definicion.get('fields') or {},
    )


def cargar_plantillas_bd(admin_conn) -> list[Plantilla]:
    """Devuelve todas las plantillas activas de saycu_admin.chofocles_plantillas_json.

    `admin_conn` es una conexión psycopg2 a saycu_admin.
    """
    with admin_conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, operador_cif, operador_email_dominio, operador_nombre,
                   version, definicion
            FROM chofocles_plantillas_json
            WHERE activa = TRUE
            ORDER BY id
            """
        )
        cols = [d[0] for d in cur.description]
        plantillas = []
        for row in cur.fetchall():
            row_dict = dict(zip(cols, row))
            try:
                plantillas.append(_row_a_plantilla(row_dict))
            except Exception as e:
                LOG.warning("plantilla id=%s ignorada: %s", row_dict.get('id'), e)
    return plantillas


def cargar_plantillas_combinadas(admin_conn) -> list[Plantilla]:
    """YAML estáticas + BD. YAML primero (legacy), luego BD."""
    estaticas: list[Plantilla] = []
    try:
        estaticas = cargar_plantillas()
    except Exception as e:
        LOG.warning("no se pudieron cargar plantillas YAML: %s", e)
    bd = cargar_plantillas_bd(admin_conn)
    LOG.info(
        "plantillas cargadas: %d YAML + %d BD = %d totales",
        len(estaticas), len(bd), len(estaticas) + len(bd),
    )
    return estaticas + bd


def insertar_plantilla_bd(
    admin_conn,
    *,
    operador_cif: str | None,
    operador_email_dominio: str | None,
    operador_nombre: str | None,
    definicion: dict,
    creada_por_ia: bool,
    notas: str | None = None,
) -> int:
    """Persiste una plantilla nueva. Versionado por procedencia: si ya hay
    una activa para el mismo (cif, dominio), se desactiva y la nueva
    arranca con version+1."""
    with admin_conn.cursor() as cur:
        # Calcular siguiente versión
        cur.execute(
            """
            SELECT COALESCE(MAX(version), 0) FROM chofocles_plantillas_json
             WHERE COALESCE(operador_cif, '')           = COALESCE(%s, '')
               AND COALESCE(operador_email_dominio, '') = COALESCE(%s, '')
            """,
            (operador_cif, operador_email_dominio),
        )
        siguiente = (cur.fetchone()[0] or 0) + 1

        # Desactivar las anteriores de la misma procedencia
        cur.execute(
            """
            UPDATE chofocles_plantillas_json
               SET activa = FALSE, updated_at = NOW()
             WHERE activa = TRUE
               AND COALESCE(operador_cif, '')           = COALESCE(%s, '')
               AND COALESCE(operador_email_dominio, '') = COALESCE(%s, '')
            """,
            (operador_cif, operador_email_dominio),
        )

        cur.execute(
            """
            INSERT INTO chofocles_plantillas_json
                (operador_cif, operador_email_dominio, operador_nombre,
                 version, activa, definicion, creada_por_ia, notas)
            VALUES (%s, %s, %s, %s, TRUE, %s::jsonb, %s, %s)
            RETURNING id
            """,
            (
                operador_cif, operador_email_dominio, operador_nombre,
                siguiente, _to_json(definicion), creada_por_ia, notas,
            ),
        )
        return cur.fetchone()[0]


def _to_json(d):
    import json as _json
    return _json.dumps(d, ensure_ascii=False)
