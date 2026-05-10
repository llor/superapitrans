"""IMAP central — un solo buzón captura todos los `*@chofocles.es`.

Pensado para `mail.saycusoft.es`: en lugar de tener un IMAP por chofer,
hay UN buzón único (catch-all del dominio chofocles.es) al que llegan
todos los correos de los choferes. Este módulo:

  1. Conecta a ese buzón único una sola vez por ciclo.
  2. Lee todos los emails con UID > IMAP_CENTRAL_LAST_UID (persistido en
     saycu_admin.chofocles_central_state).
  3. Por cada email, mira el destinatario (To+Cc+Bcc+Delivered-To) para
     localizar al chofer en la BBDD: busca `chofer_buzones.email_buzon`
     en TODOS los tenants con servicio chofocles.
  4. Devuelve lista de `(empresa_codigo, chofer_id, EmailNuevo)`.

Activación: env var `IMAP_MODE=central` + `IMAP_CENTRAL_HOST`,
`IMAP_CENTRAL_USER`, `IMAP_CENTRAL_PASSWORD`. Si falta cualquiera, el
ingestor sigue en modo per-chofer (legacy).
"""
from __future__ import annotations

import logging
import os

from db import admin_conn, tenant_conn, dictcursor
from imap_client import buscar_emails_nuevos, EmailNuevo

LOG = logging.getLogger('chofocles.imap_central')

IMAP_MODE = os.environ.get('IMAP_MODE', 'per_chofer').lower()
IMAP_CENTRAL_HOST = os.environ.get('IMAP_CENTRAL_HOST', '')
IMAP_CENTRAL_PORT = int(os.environ.get('IMAP_CENTRAL_PORT', '993'))
IMAP_CENTRAL_USER = os.environ.get('IMAP_CENTRAL_USER', '')
IMAP_CENTRAL_PASSWORD = os.environ.get('IMAP_CENTRAL_PASSWORD', '')
IMAP_CENTRAL_SSL = os.environ.get('IMAP_CENTRAL_SSL', 'true').lower() == 'true'
IMAP_CENTRAL_FOLDER = os.environ.get('IMAP_CENTRAL_FOLDER', 'INBOX')


def es_modo_central() -> bool:
    return (
        IMAP_MODE == 'central'
        and bool(IMAP_CENTRAL_HOST)
        and bool(IMAP_CENTRAL_USER)
        and bool(IMAP_CENTRAL_PASSWORD)
    )


def _ensure_state_table():
    """Crea la tabla chofocles_central_state en saycu_admin si no existe."""
    cn = admin_conn()
    with cn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chofocles_central_state (
                id BIGSERIAL PRIMARY KEY,
                imap_user VARCHAR(255) NOT NULL UNIQUE,
                last_uid_seen BIGINT NOT NULL DEFAULT 0,
                last_poll_at TIMESTAMPTZ,
                last_poll_error TEXT
            )
        """)
        cn.commit()


def _get_last_uid() -> int:
    _ensure_state_table()
    cn = admin_conn()
    with cn.cursor() as cur:
        cur.execute(
            "SELECT last_uid_seen FROM chofocles_central_state WHERE imap_user = %s",
            (IMAP_CENTRAL_USER,)
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0


def _set_last_uid(uid: int, error: str | None = None):
    cn = admin_conn()
    with cn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO chofocles_central_state (imap_user, last_uid_seen, last_poll_at, last_poll_error)
            VALUES (%s, %s, NOW(), %s)
            ON CONFLICT (imap_user) DO UPDATE
               SET last_uid_seen   = GREATEST(chofocles_central_state.last_uid_seen, EXCLUDED.last_uid_seen),
                   last_poll_at    = NOW(),
                   last_poll_error = EXCLUDED.last_poll_error
            """,
            (IMAP_CENTRAL_USER, uid, error)
        )
        cn.commit()


def _empresas_con_chofocles() -> list[dict]:
    cn = admin_conn()
    with dictcursor(cn) as cur:
        cur.execute("""
            SELECT codigo FROM empresas
             WHERE deleted_at IS NULL AND activo = TRUE
               AND 'chofocles' = ANY(servicios)
        """)
        return [dict(r) for r in cur.fetchall()]


def _resolver_chofer_por_email(emails: list[str]) -> tuple[str, int] | None:
    """Busca en cada tenant chofocles si alguno de los emails coincide con un
    chofer_buzones.email_buzon (case-insensitive). Devuelve (empresa, chofer_id)
    al primer match. None si nadie reclama el email."""
    emails_lc = {e.strip().lower() for e in emails if e}
    if not emails_lc:
        return None

    for empresa in _empresas_con_chofocles():
        codigo = empresa['codigo']
        try:
            cn = tenant_conn(codigo)
        except Exception as e:
            LOG.warning("imap_central: no se pudo conectar a %s: %s", codigo, e)
            continue
        try:
            with cn.cursor() as cur:
                cur.execute("""
                    SELECT b.usuario_id, lower(b.email_buzon) AS em
                      FROM chofer_buzones b
                      JOIN usuarios u ON u.id = b.usuario_id
                     WHERE b.activo = TRUE AND u.activo = TRUE AND u.deleted_at IS NULL
                """)
                for usuario_id, em in cur.fetchall():
                    if em in emails_lc:
                        return codigo, int(usuario_id)
        except Exception as e:
            LOG.warning("imap_central: error consultando %s: %s", codigo, e)
            continue
    return None


def recoger_emails_central() -> list[tuple[str, int, EmailNuevo]]:
    """Devuelve lista de (empresa_codigo, chofer_id, EmailNuevo) procesados
    desde el buzón central. Actualiza last_uid_seen.
    No procesa los emails — solo los recoge y enruta. El procesamiento real
    lo hace `procesar_email` en main.py.
    """
    last_uid = _get_last_uid()
    max_uid = last_uid
    salida: list[tuple[str, int, EmailNuevo]] = []
    no_enrutados: list[int] = []

    try:
        emails = list(buscar_emails_nuevos(
            host=IMAP_CENTRAL_HOST,
            port=IMAP_CENTRAL_PORT,
            user=IMAP_CENTRAL_USER,
            password=IMAP_CENTRAL_PASSWORD,
            ssl=IMAP_CENTRAL_SSL,
            carpeta=IMAP_CENTRAL_FOLDER,
            last_uid_seen=last_uid,
        ))
    except Exception as e:
        LOG.error("imap_central: IMAP falló: %s", e)
        _set_last_uid(last_uid, error=f'imap_error: {e!r}')
        return []

    for em in emails:
        if em.uid > max_uid:
            max_uid = em.uid
        if not em.adjuntos:
            continue
        match = _resolver_chofer_por_email(em.destinatarios or [])
        if match is None:
            no_enrutados.append(em.uid)
            LOG.warning(
                "imap_central: email UID=%s no enrutado (destinatarios=%s)",
                em.uid, em.destinatarios,
            )
            continue
        empresa_codigo, chofer_id = match
        salida.append((empresa_codigo, chofer_id, em))
        LOG.info("imap_central: UID=%s → %s/chofer=%s", em.uid, empresa_codigo, chofer_id)

    _set_last_uid(max_uid, error=None if not no_enrutados else f'no_enrutados_uids:{no_enrutados[:10]}')
    return salida
