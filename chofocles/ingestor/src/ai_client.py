"""Cliente Claude para generar plantillas nuevas cuando no hay match.

Diseño:
- Llamamos a Claude con el texto extraído + metadata (remitente, asunto).
- Le pedimos que en una sola llamada produzca DOS extracciones independientes
  (Método A: enfocado a campos con regex; Método B: enfocado a anclas
  textuales). Esto es la "doble validación" decidida con el usuario.
- Si ambas extracciones coinciden en los campos críticos (operador_nombre,
  origen_municipio, destino_municipio, fecha_carga), generamos una plantilla
  YAML-equivalente persistible y devolvemos los valores.
- Si difieren → resultado.fail = True con el motivo, para que el caller abra
  un ticket urgente.

Modelo: claude-opus-4-7 (configurable por env).
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any

LOG = logging.getLogger('chofocles.ai_client')

CLAUDE_MODEL = os.environ.get('CHOFOCLES_AI_MODEL', 'claude-opus-4-7')
CLAUDE_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
CLAUDE_MAX_TOKENS = int(os.environ.get('CHOFOCLES_AI_MAX_TOKENS', '4000'))
CLAUDE_EFFORT = os.environ.get('CHOFOCLES_AI_EFFORT', 'max')

CAMPOS_CRITICOS = (
    'operador_nombre',
    'origen_municipio',
    'destino_municipio',
    'fecha_carga',
)


@dataclass
class IAResultado:
    ok: bool
    valores: dict[str, str]                # campos canónicos con valor
    plantilla: dict[str, Any] | None       # definición lista para persistir
    operador_cif: str | None
    operador_nombre: str | None
    operador_email_dominio: str | None
    fail_motivo: str | None
    raw_a: dict[str, Any] | None
    raw_b: dict[str, Any] | None


def _system_prompt() -> str:
    return (
        "Eres un extractor de datos de órdenes de transporte. Recibes el texto "
        "íntegro de un documento (PDF/DOCX/email/imagen-OCR) que un operador "
        "logístico ha enviado a un chofer. Debes detectar al operador y "
        "extraer los datos canónicos del pedido. Trabajas SIEMPRE en JSON.\n\n"
        "Hazlo por DOS métodos diferentes y compara consigo mismo:\n"
        "  - Método A: identifica campos por patrones regex robustos (CIF, "
        "    códigos postales, fechas, importes, matrículas, anclas literales).\n"
        "  - Método B: identifica campos por contexto textual (etiquetas como "
        "    'Cliente:', 'Origen:', 'Destino:', encabezados de columnas, "
        "    posición relativa).\n\n"
        "Solo si ambos métodos coinciden en los campos críticos "
        "(operador_nombre, origen_municipio, destino_municipio, fecha_carga) "
        "devuelves la extracción y una plantilla reutilizable. Si no coinciden, "
        "devuelves status='no_certeza' con el motivo. La salida es ÚNICAMENTE "
        "JSON, sin texto extra alrededor."
    )


def _user_prompt(texto: str, remitente: str, asunto: str) -> str:
    """Prompt con esquema de salida estricto."""
    return f"""Documento recibido:

REMITENTE: {remitente}
ASUNTO: {asunto}
TEXTO:
---
{texto[:30000]}
---

Devuélveme EXCLUSIVAMENTE un JSON con este esquema:

{{
  "metodo_a": {{
    "operador_cif": "<o null>",
    "operador_nombre": "<o null>",
    "operador_email_dominio": "<o null>",
    "campos": {{
      "operador_nombre": "...",
      "origen_municipio": "...",
      "origen_direccion1": "...",
      "origen_codigo_postal": "...",
      "origen_provincia": "...",
      "destino_municipio": "...",
      "destino_direccion1": "...",
      "destino_codigo_postal": "...",
      "destino_provincia": "...",
      "fecha_carga": "DD/MM/YYYY o null",
      "fecha_descarga": "DD/MM/YYYY o null",
      "mercancia_descripcion": "...",
      "tractora_matricula": "...",
      "remolque_matricula": "...",
      "precio": "<solo número, en euros>",
      "cliente_nombre": "...",
      "referencia_externa": "..."
    }}
  }},
  "metodo_b": {{
    "operador_cif": "...",
    "operador_nombre": "...",
    "operador_email_dominio": "...",
    "campos": {{ ... mismos campos que metodo_a ... }}
  }},
  "plantilla_propuesta": {{
    "empresa": "<nombre operador>",
    "match": {{
      "all": ["términos literales que SIEMPRE aparecen para identificar a este operador"],
      "any": []
    }},
    "fields": {{
      "<nombre_campo_canonico>": {{ "tipo": "regex", "pattern": "<regex>", "flags": ["IGNORECASE"], "group": 1 }},
      "...": "..."
    }}
  }},
  "status": "ok | no_certeza",
  "diferencias_detectadas": ["lista de campos donde A y B difieren"],
  "motivo_no_certeza": "<si status=no_certeza, descríbelo>"
}}

Importante:
- Si A y B coinciden en operador_nombre, origen_municipio, destino_municipio,
  fecha_carga: status='ok'.
- Si discrepan en alguno: status='no_certeza' y describe el motivo.
- En "plantilla_propuesta" usa campos canónicos, NO los del piloto.
- Las regex deben ser tan generales como sea posible para que sirvan a otros
  documentos del MISMO operador, pero sin perder precisión.
- Las claves de "campos" usan los nombres canónicos exactamente como aparecen
  arriba. Si no encuentras un valor, omite la clave (no inventes).
"""


def llamar_claude(texto: str, remitente: str = '', asunto: str = '') -> IAResultado:
    if not CLAUDE_API_KEY:
        return IAResultado(
            ok=False, valores={}, plantilla=None,
            operador_cif=None, operador_nombre=None, operador_email_dominio=None,
            fail_motivo='ANTHROPIC_API_KEY no configurado',
            raw_a=None, raw_b=None,
        )
    try:
        from anthropic import Anthropic   # import lazy
    except ImportError:
        return IAResultado(
            ok=False, valores={}, plantilla=None,
            operador_cif=None, operador_nombre=None, operador_email_dominio=None,
            fail_motivo='paquete anthropic no instalado',
            raw_a=None, raw_b=None,
        )

    client = Anthropic(api_key=CLAUDE_API_KEY)
    try:
        resp = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=CLAUDE_MAX_TOKENS,
            output_config={'effort': CLAUDE_EFFORT},
            system=_system_prompt(),
            messages=[{
                'role': 'user',
                'content': _user_prompt(texto, remitente, asunto),
            }],
        )
    except Exception as e:
        LOG.exception("claude_api error: %s", e)
        return IAResultado(
            ok=False, valores={}, plantilla=None,
            operador_cif=None, operador_nombre=None, operador_email_dominio=None,
            fail_motivo=f'claude_api_error: {e!r}',
            raw_a=None, raw_b=None,
        )

    raw_text = ''
    for block in resp.content:
        if getattr(block, 'type', '') == 'text':
            raw_text += block.text

    # Pelar fences ```json ... ``` si aparecen.
    raw_text = raw_text.strip()
    if raw_text.startswith('```'):
        raw_text = raw_text.strip('`')
        if raw_text.lower().startswith('json'):
            raw_text = raw_text[4:].lstrip()

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        LOG.warning("Claude no devolvió JSON parseable: %s", e)
        return IAResultado(
            ok=False, valores={}, plantilla=None,
            operador_cif=None, operador_nombre=None, operador_email_dominio=None,
            fail_motivo=f'json_invalido: {e}',
            raw_a=None, raw_b=None,
        )

    return _consolidar_respuesta(data)


def _consolidar_respuesta(data: dict) -> IAResultado:
    a = data.get('metodo_a') or {}
    b = data.get('metodo_b') or {}
    plantilla = data.get('plantilla_propuesta') or {}
    status = (data.get('status') or '').lower()

    if status != 'ok':
        return IAResultado(
            ok=False, valores={}, plantilla=plantilla,
            operador_cif=a.get('operador_cif') or b.get('operador_cif'),
            operador_nombre=a.get('operador_nombre') or b.get('operador_nombre'),
            operador_email_dominio=a.get('operador_email_dominio') or b.get('operador_email_dominio'),
            fail_motivo=data.get('motivo_no_certeza') or 'IA no tiene certeza',
            raw_a=a, raw_b=b,
        )

    # Doble validación local: campos críticos deben coincidir entre A y B
    campos_a = a.get('campos') or {}
    campos_b = b.get('campos') or {}
    diffs = []
    for k in CAMPOS_CRITICOS:
        va = (campos_a.get(k) or '').strip().lower()
        vb = (campos_b.get(k) or '').strip().lower()
        if va != vb:
            diffs.append(k)
    if diffs:
        return IAResultado(
            ok=False, valores={}, plantilla=plantilla,
            operador_cif=a.get('operador_cif'),
            operador_nombre=a.get('operador_nombre'),
            operador_email_dominio=a.get('operador_email_dominio'),
            fail_motivo=f'metodos_discrepan en {diffs}',
            raw_a=a, raw_b=b,
        )

    # Consenso: usamos campos del método A (cualquiera valdría)
    valores = {k: v for k, v in campos_a.items() if v}

    return IAResultado(
        ok=True, valores=valores, plantilla=plantilla,
        operador_cif=a.get('operador_cif'),
        operador_nombre=a.get('operador_nombre'),
        operador_email_dominio=a.get('operador_email_dominio'),
        fail_motivo=None,
        raw_a=a, raw_b=b,
    )
