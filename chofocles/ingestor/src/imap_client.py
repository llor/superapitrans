"""Cliente IMAP minimalista basado en imaplib (stdlib).

Por cada buzón activo de chofer:
  1. Conecta IMAP (SSL).
  2. Selecciona la carpeta (default INBOX).
  3. Busca mensajes UID > last_uid_seen.
  4. Para cada mensaje devuelve metadatos + adjuntos válidos
     (PDF / DOCX / imagen).
  5. NO marca como leído ni borra. La gestión del puntero `last_uid_seen`
     la hace `persister` después de procesar cada mensaje correctamente.
"""
from __future__ import annotations

import email
import imaplib
import logging
from dataclasses import dataclass
from email.header import decode_header
from email.message import Message
from email.utils import parsedate_to_datetime, getaddresses
from datetime import datetime
from typing import Iterable

LOG = logging.getLogger('chofocles.imap')

ADJUNTOS_VALIDOS = {
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # docx
    'image/jpeg',
    'image/png',
    'image/tiff',
}


@dataclass
class AdjuntoBruto:
    nombre: str
    mime: str
    contenido: bytes


@dataclass
class EmailNuevo:
    uid: int
    message_id: str | None
    asunto: str
    remitente: str
    fecha: datetime | None
    adjuntos: list[AdjuntoBruto]
    destinatarios: list[str] = None    # To + Cc + Bcc, ya parseados a emails


def _decode(s: str | None) -> str:
    if not s:
        return ''
    parts = decode_header(s)
    salida = []
    for texto, encoding in parts:
        if isinstance(texto, bytes):
            try:
                salida.append(texto.decode(encoding or 'utf-8', 'replace'))
            except LookupError:
                salida.append(texto.decode('utf-8', 'replace'))
        else:
            salida.append(texto)
    return ''.join(salida)


def _extraer_destinatarios(msg: Message) -> list[str]:
    """Devuelve TODOS los emails de To+Cc+Bcc+Delivered-To en minúsculas."""
    valores = []
    for header in ('To', 'Cc', 'Bcc', 'Delivered-To', 'X-Original-To'):
        v = msg.get_all(header)
        if v:
            valores.extend(v)
    parejas = getaddresses(valores)
    return list({(addr or '').strip().lower() for _, addr in parejas if addr})


def _extraer_adjuntos(msg: Message) -> list[AdjuntoBruto]:
    adjuntos: list[AdjuntoBruto] = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        disposition = (part.get('Content-Disposition') or '').lower()
        if 'attachment' not in disposition and not part.get_filename():
            continue
        content_type = (part.get_content_type() or '').lower()
        if content_type not in ADJUNTOS_VALIDOS:
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        nombre = _decode(part.get_filename()) or f'adjunto.{content_type.split("/")[-1]}'
        adjuntos.append(AdjuntoBruto(nombre=nombre, mime=content_type, contenido=payload))
    return adjuntos


def buscar_emails_nuevos(
    *,
    host: str,
    port: int,
    user: str,
    password: str,
    ssl: bool = True,
    carpeta: str = 'INBOX',
    last_uid_seen: int = 0,
) -> Iterable[EmailNuevo]:
    """Yieldea EmailNuevo para cada mensaje con UID > last_uid_seen y adjuntos."""
    conn_class = imaplib.IMAP4_SSL if ssl else imaplib.IMAP4
    M = conn_class(host, port)
    try:
        M.login(user, password)
        typ, _ = M.select(carpeta, readonly=True)
        if typ != 'OK':
            raise RuntimeError(f"No se pudo seleccionar carpeta {carpeta!r}")

        # UID search: todos los mensajes con UID > last_uid_seen
        criterio = f'UID {last_uid_seen + 1}:*' if last_uid_seen > 0 else 'ALL'
        typ, data = M.uid('search', None, criterio)
        if typ != 'OK':
            raise RuntimeError(f"UID search falló: {typ}")
        uids_raw = data[0].split()
        for uid_b in uids_raw:
            try:
                uid = int(uid_b)
            except ValueError:
                continue
            if uid <= last_uid_seen:
                continue  # IMAP UID search "N:*" siempre incluye al menos uno
            typ, fetch_data = M.uid('fetch', uid_b, '(RFC822)')
            if typ != 'OK' or not fetch_data or not fetch_data[0]:
                LOG.warning("UID %s: fetch falló (%s)", uid, typ)
                continue
            raw = fetch_data[0][1] if isinstance(fetch_data[0], tuple) else None
            if raw is None:
                continue
            msg = email.message_from_bytes(raw)
            adjuntos = _extraer_adjuntos(msg)
            if not adjuntos:
                continue
            fecha_raw = msg.get('Date')
            try:
                fecha = parsedate_to_datetime(fecha_raw) if fecha_raw else None
            except (TypeError, ValueError):
                fecha = None
            destinatarios = _extraer_destinatarios(msg)
            yield EmailNuevo(
                uid=uid,
                message_id=msg.get('Message-ID'),
                asunto=_decode(msg.get('Subject')),
                remitente=_decode(msg.get('From')),
                fecha=fecha,
                adjuntos=adjuntos,
                destinatarios=destinatarios,
            )
    finally:
        try:
            M.close()
        except Exception:
            pass
        try:
            M.logout()
        except Exception:
            pass
