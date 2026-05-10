"""Vuelca cada viaje creado por chofocles a la tabla canónica de pasarela.

`saycu_pasarela_<empresa>.pedidos` y `paradas` son las tablas que el módulo
de transporte del usuario consume vía API. Cada viaje de chofocles produce
un pedido en pasarela con origen='chofocles_email'.

Si la BBDD `saycu_pasarela_<empresa>` no existe (servicio 'pasarela' no
activo en la empresa), se ignora silenciosamente — chofocles no debería
fallar por eso.
"""
from __future__ import annotations

import logging
import os
import psycopg2

LOG = logging.getLogger('chofocles.pasarela_sync')

DB_HOST = os.environ.get('DB_HOST', 'system-postgres')
DB_PORT = int(os.environ.get('DB_PORT', '5432'))
DB_USER = os.environ.get('DB_USER', 'saycutrans')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')


def _pasarela_db_name(empresa_codigo: str) -> str:
    return f"saycu_pasarela_{empresa_codigo.lower()}"


def _conectar(empresa_codigo: str):
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        database=_pasarela_db_name(empresa_codigo),
        connect_timeout=5,
    )


def volcar_a_pasarela(
    *,
    empresa_codigo: str,
    documento_id: int,
    chofer_id: int,
    valores: dict,
    operador_cif: str | None,
    operador_nombre: str | None,
) -> int | None:
    """Crea un pedido + sus 2 paradas (carga/descarga) en la BBDD pasarela
    del tenant. Devuelve pedido_id o None si la BBDD pasarela no existe
    o no se puede escribir.
    """
    try:
        conn = _conectar(empresa_codigo)
    except psycopg2.Error as e:
        if e.pgcode == '3D000':       # database does not exist
            LOG.debug("pasarela inactiva en %s; sin volcado", empresa_codigo)
        else:
            LOG.warning("no se pudo conectar a pasarela %s: %s", empresa_codigo, e)
        return None

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pedidos (
                    cliente_codigo, email_remitente,
                    matricula_tractor, matricula_remolque,
                    numero_pedido, fecha_plan, fecha_reparto,
                    origen, proveedor_codigo, proveedor_publication_id,
                    tipo, estado
                ) VALUES (
                    %s, %s,
                    %s, %s,
                    %s, %s::date, %s::date,
                    'chofocles_email', %s, %s,
                    'PEDIDO', 'PENDIENTE'
                )
                ON CONFLICT (proveedor_codigo, proveedor_publication_id)
                WHERE proveedor_publication_id IS NOT NULL
                DO UPDATE SET updated_at = NOW()
                RETURNING id
                """,
                (
                    empresa_codigo,
                    valores.get('operador_email') or '',
                    valores.get('tractora_matricula'),
                    valores.get('remolque_matricula'),
                    valores.get('referencia_externa'),
                    _norm_fecha(valores.get('fecha_carga')),
                    _norm_fecha(valores.get('fecha_descarga')),
                    operador_cif or 'chofocles',
                    documento_id,
                ),
            )
            pedido_id = cur.fetchone()[0]

            # Borrar paradas anteriores del mismo pedido y reescribir
            cur.execute('DELETE FROM paradas WHERE pedido_id = %s', (pedido_id,))

            cur.execute(
                """
                INSERT INTO paradas (
                    pedido_id, tipo, orden, secuencia,
                    lugar_nombre, direccion1, codigo_postal, municipio, provincia,
                    persona_contacto, telefono
                ) VALUES (
                    %s, 'CARGA', 'ORIGEN', 1,
                    %s, %s, %s, %s, %s,
                    %s, %s
                )
                """,
                (
                    pedido_id,
                    valores.get('origen_nombre_cliente'),
                    valores.get('origen_direccion1'),
                    valores.get('origen_codigo_postal'),
                    valores.get('origen_municipio') or valores.get('origen_poblacion'),
                    valores.get('origen_provincia'),
                    valores.get('origen_contacto'),
                    valores.get('origen_telefono'),
                ),
            )
            cur.execute(
                """
                INSERT INTO paradas (
                    pedido_id, tipo, orden, secuencia,
                    lugar_nombre, direccion1, codigo_postal, municipio, provincia,
                    persona_contacto, telefono
                ) VALUES (
                    %s, 'DESCARGA', 'DESTINO', 2,
                    %s, %s, %s, %s, %s,
                    %s, %s
                )
                """,
                (
                    pedido_id,
                    valores.get('destino_nombre_cliente'),
                    valores.get('destino_direccion1'),
                    valores.get('destino_codigo_postal'),
                    valores.get('destino_municipio') or valores.get('destino_poblacion'),
                    valores.get('destino_provincia'),
                    valores.get('destino_contacto'),
                    valores.get('destino_telefono'),
                ),
            )
        conn.commit()
        LOG.info("pasarela: pedido %s creado en %s", pedido_id, _pasarela_db_name(empresa_codigo))
        return pedido_id
    except Exception as e:
        conn.rollback()
        LOG.exception("pasarela_sync error en %s: %s", empresa_codigo, e)
        return None
    finally:
        conn.close()


def _norm_fecha(v):
    if not v:
        return None
    import re
    m = re.search(r'(\d{2})[/-](\d{2})[/-](\d{4})', v)
    if m:
        return f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
    m = re.search(r'(\d{4})[/-](\d{2})[/-](\d{2})', v)
    if m:
        return f'{m.group(1)}-{m.group(2)}-{m.group(3)}'
    return None
