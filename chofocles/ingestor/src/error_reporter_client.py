"""Cliente Python compartido para reportar errores al receptor central
de saycu/* (POST /api/error-report en admin.saycusoft.es).

Uso típico (en main.py / entry-point del proceso):

    from utils.error_reporter_client import install, setup_logging_handler, report_error

    install(
        project='chofocles-ingestor',
        url=os.environ.get('ERROR_REPORTER_URL'),
        environment=os.environ.get('NODE_ENV') or 'production',
    )
    setup_logging_handler()                  # captura LOG.error / LOG.exception

    # En cualquier try/except manual:
    try:
        ...
    except Exception as e:
        report_error(source='backend', message=str(e), stack=traceback.format_exc())
        ...

Diseño:
- Sin dependencias externas: usa stdlib (urllib.request, logging, threading).
- Fire-and-forget: si el receptor no responde, no propaga (solo escribe a stderr).
- No rompe el flujo del proceso. Idempotente.
- ERROR_REPORTER_ENABLED=false en .env desactiva el envío.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import threading
import traceback
import urllib.error
import urllib.request
from typing import Any, Optional

def _detect_environment() -> str:
    """Detecta entorno: prefiere ENVIRONMENT/NODE_ENV explícitas; si no,
    cae a 'unknown' (mejor que asumir 'production' y mandar emails con
    etiqueta equivocada)."""
    return (
        os.environ.get('ENVIRONMENT')
        or os.environ.get('NODE_ENV')
        or 'unknown'
    )


_config = {
    'project': 'unknown',
    'url': None,
    'environment': _detect_environment(),
    'enabled': os.environ.get('ERROR_REPORTER_ENABLED', 'true').lower() != 'false',
    'timeout_s': 5.0,
}

_log = logging.getLogger('saycu.error_reporter')


def install(
    *,
    project: str,
    url: Optional[str] = None,
    environment: Optional[str] = None,
    enabled: Optional[bool] = None,
    timeout_s: Optional[float] = None,
    install_excepthook: bool = True,
) -> None:
    """Configura el reporter y opcionalmente registra excepthooks de proceso."""
    _config['project'] = project
    if url is not None:
        _config['url'] = url
    if environment is not None:
        _config['environment'] = environment
    if enabled is not None:
        _config['enabled'] = bool(enabled)
    if timeout_s is not None:
        _config['timeout_s'] = float(timeout_s)

    if not _config['enabled']:
        _log.info('[ErrorReporter] desactivado (enabled=false)')
        return
    if not _config['url']:
        _log.warning('[ErrorReporter] activado pero ERROR_REPORTER_URL vacío — no se enviarán reportes')
        return

    if install_excepthook:
        prev = sys.excepthook

        def _hook(exc_type, exc_val, tb):
            try:
                report_error(
                    source='process',
                    severity='fatal',
                    message=str(exc_val) or exc_type.__name__,
                    stack=''.join(traceback.format_exception(exc_type, exc_val, tb)),
                )
            finally:
                prev(exc_type, exc_val, tb)

        sys.excepthook = _hook

        if hasattr(threading, 'excepthook'):
            prev_t = threading.excepthook  # type: ignore[attr-defined]

            def _t_hook(args):  # type: ignore[no-redef]
                try:
                    report_error(
                        source='process',
                        severity='fatal',
                        message=str(args.exc_value),
                        stack=''.join(
                            traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback)
                        ),
                        extra={'thread': getattr(args.thread, 'name', None)},
                    )
                finally:
                    prev_t(args)

            threading.excepthook = _t_hook  # type: ignore[attr-defined]

    _log.info(
        '[ErrorReporter] Instalado proyecto=%s url=%s env=%s',
        _config['project'], _config['url'], _config['environment'],
    )


def report_error(**kwargs: Any) -> None:
    """Envía un error al receptor central. Fire-and-forget."""
    if not _config['enabled'] or not _config['url']:
        return

    payload = {
        'project': _config['project'],
        'environment': _config['environment'],
        'source': kwargs.get('source', 'backend'),
        'severity': kwargs.get('severity', 'error'),
        'message': str(kwargs.get('message') or '(sin mensaje)')[:4000],
    }
    for k in (
        'stack', 'http_method', 'http_url', 'http_status', 'user_id',
        'user_login', 'empresa_codigo', 'user_agent', 'client_ip',
        'request_payload', 'extra',
    ):
        v = kwargs.get(k)
        if v is None:
            continue
        if k == 'stack' and isinstance(v, str):
            payload[k] = v[:32000]
        else:
            payload[k] = v

    try:
        body = json.dumps(payload, default=str).encode('utf-8')
    except Exception as e:
        sys.stderr.write(f'[ErrorReporter] no se pudo serializar payload: {e}\n')
        return

    req = urllib.request.Request(
        _config['url'],
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=_config['timeout_s']) as r:
            r.read()
    except (urllib.error.URLError, OSError) as e:
        sys.stderr.write(f'[ErrorReporter] POST fallido: {e}\n')
    except Exception as e:
        sys.stderr.write(f'[ErrorReporter] excepción enviando reporte: {e}\n')


class _ReporterLoggingHandler(logging.Handler):
    """Logging handler que reenvía records ERROR+ al receptor central."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            stack = None
            if record.exc_info:
                stack = ''.join(traceback.format_exception(*record.exc_info))
            elif record.stack_info:
                stack = record.stack_info
            report_error(
                source='backend',
                severity='error' if record.levelno < logging.CRITICAL else 'fatal',
                message=record.getMessage(),
                stack=stack,
                extra={'logger': record.name, 'level': record.levelname},
            )
        except Exception:
            # Nunca propagar desde un handler de logging
            pass


def setup_logging_handler(level: int = logging.ERROR) -> None:
    """Añade un handler global que envía LOG.error/exception al receptor.

    Se conecta al root logger; no interfiere con handlers existentes.
    Idempotente: si ya hay un _ReporterLoggingHandler, no añade otro.
    """
    root = logging.getLogger()
    for h in root.handlers:
        if isinstance(h, _ReporterLoggingHandler):
            return
    h = _ReporterLoggingHandler()
    h.setLevel(level)
    root.addHandler(h)
