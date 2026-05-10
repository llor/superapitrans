"""Persistencia de documentos y viajes en la BBDD del tenant.

Pipeline por cada email/adjunto:
  1. Guardar el binario en disco (DOCUMENTOS_STORAGE_PATH/<empresa>/<año>/<mes>/<hash>.<ext>).
  2. Insertar fila en `documentos`.
  3. Llamar al extractor (ya recibido como Resultado).
  4. Si la plantilla casa: insertar `viajes` + `viajes_paradas` (carga + descarga).
  5. Marcar `documentos.procesado = TRUE` (en éxito) o guardar error en
     `documentos.error_proceso`.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg2.extras

from extractor import Resultado

LOG = logging.getLogger('chofocles.persister')


def _hash_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _guardar_binario(
    *,
    storage_root: Path,
    empresa: str,
    contenido: bytes,
    nombre_original: str,
) -> tuple[Path, str]:
    digest = _hash_sha256(contenido)
    ahora = datetime.utcnow()
    sub = storage_root / empresa.lower() / f'{ahora.year:04d}' / f'{ahora.month:02d}'
    sub.mkdir(parents=True, exist_ok=True)
    ext = Path(nombre_original).suffix or ''
    destino = sub / f'{digest}{ext}'
    if not destino.exists():
        destino.write_bytes(contenido)
    return destino, digest


def insertar_documento(
    conn,
    *,
    chofer_id: int,
    email_message_id: str | None,
    email_remitente: str,
    email_asunto: str,
    email_fecha: datetime | None,
    archivo_ruta: Path,
    archivo_nombre: str,
    archivo_mime: str,
    archivo_tamaño: int,
    archivo_hash: str,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documentos (
                chofer_id, email_message_id, email_remitente, email_asunto,
                email_fecha, archivo_ruta, archivo_nombre, archivo_mime,
                archivo_tamaño, archivo_hash_sha256
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                chofer_id, email_message_id, email_remitente, email_asunto,
                email_fecha, str(archivo_ruta), archivo_nombre, archivo_mime,
                archivo_tamaño, archivo_hash,
            ),
        )
        documento_id = cur.fetchone()[0]
    return documento_id


def _resolver_estado_id(conn, codigo: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM estados_viaje WHERE codigo = %s", (codigo,))
        row = cur.fetchone()
        return row[0] if row else None


def _resolver_estado_parada_id(conn, *, codigo: str, tipo: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM estados_parada WHERE codigo = %s AND tipo = %s",
            (codigo, tipo),
        )
        row = cur.fetchone()
        return row[0] if row else None


def _upsert_vehiculo(conn, matricula: str, tipo_codigo: str) -> int | None:
    if not matricula:
        return None
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO vehiculos (matricula, tipo_id)
            VALUES (
                %s,
                (SELECT id FROM tipos_vehiculo WHERE codigo = %s)
            )
            ON CONFLICT (matricula) DO UPDATE
                SET updated_at = NOW()
            RETURNING id
            """,
            (matricula, tipo_codigo),
        )
        return cur.fetchone()[0]


def insertar_viaje(
    conn,
    *,
    documento_id: int,
    chofer_id: int,
    valores: dict[str, str],
    plantilla_id: int | None = None,
    operador_cif: str | None = None,
) -> int:
    """Inserta una fila en `viajes` con los campos canónicos extraídos.

    `valores` es el dict de Resultado.valores (claves canónicas chofocles).
    """
    estado_pendiente = _resolver_estado_id(conn, 'pendiente')

    # Generar referencia_externa única — si no la tenemos, sintetizamos una.
    referencia_externa = (
        valores.get('referencia_externa')
        or f'auto-{documento_id}-{int(datetime.utcnow().timestamp())}'
    )

    fecha = _parse_fecha(valores.get('fecha_carga')) or datetime.utcnow().date()

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO viajes (
                referencia_externa, fecha, estado_id, conductor_id,
                cliente_nombre, mercancia_descripcion,
                origen_municipio, origen_direccion1,
                destino_municipio, destino_direccion1,
                precio, operador_cif, documento_id, plantilla_id,
                visible_chofer
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                TRUE
            )
            RETURNING id
            """,
            (
                referencia_externa, fecha, estado_pendiente, chofer_id,
                valores.get('cliente_nombre'), valores.get('mercancia_descripcion'),
                valores.get('origen_municipio'), valores.get('origen_direccion1'),
                valores.get('destino_municipio'), valores.get('destino_direccion1'),
                _parse_precio(valores.get('precio')),
                operador_cif, documento_id, plantilla_id,
            ),
        )
        viaje_id = cur.fetchone()[0]

    # Paradas: una de carga, una de descarga (ampliable a multi-zona/multi-destino)
    estado_parada_pendiente_carga = _resolver_estado_parada_id(
        conn, codigo='pendiente', tipo='recogida',
    )
    estado_parada_pendiente_entrega = _resolver_estado_parada_id(
        conn, codigo='pendiente', tipo='entrega',
    )
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO viajes_paradas (
                viaje_id, orden, tipo, estado_id,
                nombre_cliente, direccion1, codigo_postal,
                poblacion, provincia,
                contacto, telefono
            ) VALUES (%s, 1, 'recogida', %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                viaje_id, estado_parada_pendiente_carga,
                valores.get('origen_nombre_cliente'),
                valores.get('origen_direccion1'),
                valores.get('origen_codigo_postal'),
                valores.get('origen_poblacion') or valores.get('origen_municipio'),
                valores.get('origen_provincia'),
                valores.get('origen_contacto'),
                valores.get('origen_telefono'),
            ),
        )
        cur.execute(
            """
            INSERT INTO viajes_paradas (
                viaje_id, orden, tipo, estado_id,
                nombre_cliente, direccion1, codigo_postal,
                poblacion, provincia,
                contacto, telefono
            ) VALUES (%s, 2, 'entrega', %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                viaje_id, estado_parada_pendiente_entrega,
                valores.get('destino_nombre_cliente'),
                valores.get('destino_direccion1'),
                valores.get('destino_codigo_postal'),
                valores.get('destino_poblacion') or valores.get('destino_municipio'),
                valores.get('destino_provincia'),
                valores.get('destino_contacto'),
                valores.get('destino_telefono'),
            ),
        )
    return viaje_id


def marcar_documento_procesado(conn, documento_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE documentos
            SET procesado = TRUE, procesado_at = NOW(), error_proceso = NULL
            WHERE id = %s
            """,
            (documento_id,),
        )


def marcar_documento_error(conn, documento_id: int, error: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE documentos
            SET procesado = FALSE, error_proceso = %s
            WHERE id = %s
            """,
            (error[:2000], documento_id),
        )


def actualizar_last_uid(conn, buzon_id: int, last_uid: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE chofer_buzones
            SET last_uid_seen = %s, last_poll_at = NOW(), last_poll_error = NULL
            WHERE id = %s
            """,
            (last_uid, buzon_id),
        )


def actualizar_buzon_error(conn, buzon_id: int, error: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE chofer_buzones
            SET last_poll_at = NOW(), last_poll_error = %s
            WHERE id = %s
            """,
            (error[:2000], buzon_id),
        )


def _parse_precio(valor: str | None) -> Any:
    if not valor:
        return None
    import re as _re
    m = _re.search(r'(\d+(?:[.,]\d+)?)', valor)
    if not m:
        return None
    return float(m.group(1).replace(',', '.'))


def _parse_fecha(valor: str | None):
    if not valor:
        return None
    import re as _re
    m = _re.search(r'(\d{2})[/-](\d{2})[/-](\d{4})', valor)
    if m:
        return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).date()
    return None
