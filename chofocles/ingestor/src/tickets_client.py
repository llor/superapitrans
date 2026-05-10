"""Cliente HTTP del módulo de tickets transversales (admin.saycusoft.es).

Crea tickets vía POST /api/tickets con cabecera X-Service-Key, sin necesidad
de login humano. Usado por el ingestor cuando la IA no consigue certeza o
una transformación falla.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

LOG = logging.getLogger('chofocles.tickets_client')

TICKETS_URL = os.environ.get('TICKETS_API_URL', 'http://saycu-admin-api:3200/api/tickets')
TICKETS_KEY = os.environ.get('TICKETS_SERVICE_KEY', '')


def crear_ticket(
    *,
    titulo: str,
    descripcion: str = '',
    servicio: str = 'chofocles',
    prioridad: str = 'urgente',
    empresa_codigo: str | None = None,
    contacto_email: str | None = None,
    contacto_nombre: str | None = None,
    origen_ref: str | None = None,
    datos_extra: dict | None = None,
) -> dict | None:
    """POST /api/tickets. Devuelve el ticket creado o None si falló."""
    if not TICKETS_KEY:
        LOG.warning("TICKETS_SERVICE_KEY no configurado, no se crea ticket")
        return None

    payload = {
        'titulo': titulo,
        'descripcion': descripcion,
        'servicio': servicio,
        'prioridad': prioridad,
        'origen': 'auto',
    }
    if origen_ref:      payload['origen_ref'] = origen_ref
    if empresa_codigo:  payload['empresa_codigo'] = empresa_codigo
    if contacto_email:  payload['contacto_email'] = contacto_email
    if contacto_nombre: payload['contacto_nombre'] = contacto_nombre
    if datos_extra:     payload['datos_extra'] = datos_extra

    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        TICKETS_URL,
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'X-Service-Key':  TICKETS_KEY,
            'X-Service-Name': servicio,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        LOG.info("ticket creado: %s (%s)", data.get('codigo'), data.get('id'))
        return data
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode('utf-8')
        except Exception:
            err_body = '<no body>'
        LOG.error("ticket POST falló %s: %s", e.code, err_body)
        return None
    except Exception as e:
        LOG.exception("ticket POST excepción: %s", e)
        return None
