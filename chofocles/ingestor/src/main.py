"""Punto de entrada del ingestor IMAP de chofocles.

Bucle principal:
  cada POLL_INTERVAL_SECONDS:
    para cada empresa con servicio chofocles activo (saycu_admin.empresas):
      conectar BBDD del tenant
      para cada chofer_buzon activo:
        decrypt SMTP/IMAP creds
        listar emails con UID > last_uid_seen
        para cada email con adjunto válido:
          guardar binario, insertar `documentos`
          extraer (extractor.py) y, si hay match, insertar `viajes`+`paradas`
          marcar `documentos.procesado` (o error si falla)
        actualizar `last_uid_seen` al UID máximo procesado correctamente
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import time
from pathlib import Path

from db import admin_conn, tenant_conn, dictcursor, close_all
from extractor import (
    archivo_a_texto,
    cargar_plantillas,
    extraer_de_archivo,
    extraer_de_texto,
)
from imap_client import buscar_emails_nuevos
from persister import (
    actualizar_buzon_error,
    actualizar_last_uid,
    insertar_documento,
    insertar_viaje,
    marcar_documento_error,
    marcar_documento_procesado,
    _guardar_binario,
)
from secrets import decrypt
from template_loader_db import (
    cargar_plantillas_combinadas,
    insertar_plantilla_bd,
)
from ai_client import llamar_claude
from tickets_client import crear_ticket
from pasarela_sync import volcar_a_pasarela
from imap_central import es_modo_central, recoger_emails_central

LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format='%(asctime)s [%(name)s] %(levelname)s %(message)s',
)
LOG = logging.getLogger('chofocles.main')

# Reporter centralizado de errores saycu/* (POST a admin.saycusoft.es).
# Captura LOG.error / LOG.exception y excepciones no atrapadas del proceso.
from error_reporter_client import install as _install_reporter, setup_logging_handler as _setup_reporter_handler
_install_reporter(
    project='chofocles-ingestor',
    url=os.environ.get('ERROR_REPORTER_URL'),
    environment=os.environ.get('ENVIRONMENT') or os.environ.get('NODE_ENV') or 'unknown',
)
_setup_reporter_handler()

POLL_INTERVAL_SECONDS = int(os.environ.get('POLL_INTERVAL_SECONDS', '120'))
DOCUMENTOS_STORAGE_PATH = Path(
    os.environ.get('DOCUMENTOS_STORAGE_PATH', '/var/chofocles/documentos')
)

_running = True


def _sigterm(_signum, _frame):
    global _running
    LOG.info('Recibido SIGTERM/SIGINT, cerrando…')
    _running = False


def empresas_chofocles() -> list[dict]:
    cn = admin_conn()
    with dictcursor(cn) as cur:
        cur.execute(
            """
            SELECT codigo, nombre
            FROM empresas
            WHERE deleted_at IS NULL
              AND activo = TRUE
              AND 'chofocles' = ANY(servicios)
            ORDER BY codigo
            """
        )
        return [dict(r) for r in cur.fetchall()]


def buzones_activos(empresa_codigo: str) -> list[dict]:
    cn = tenant_conn(empresa_codigo)
    with dictcursor(cn) as cur:
        cur.execute(
            """
            SELECT b.id, b.usuario_id, b.email_buzon,
                   b.imap_host, b.imap_port, b.imap_user, b.imap_password_enc,
                   b.imap_ssl, b.imap_carpeta, b.last_uid_seen
            FROM chofer_buzones b
            JOIN usuarios u ON u.id = b.usuario_id
            WHERE b.activo = TRUE
              AND u.activo = TRUE
              AND u.deleted_at IS NULL
            """
        )
        return [dict(r) for r in cur.fetchall()]


def procesar_email(
    *,
    tenant,
    plantillas,
    empresa_codigo: str,
    chofer_id: int,
    email_obj,
    plantillas_recargar,
):
    if not email_obj.adjuntos:
        return
    for adj in email_obj.adjuntos:
        ruta_destino, digest = _guardar_binario(
            storage_root=DOCUMENTOS_STORAGE_PATH,
            empresa=empresa_codigo,
            contenido=adj.contenido,
            nombre_original=adj.nombre,
        )
        documento_id = insertar_documento(
            tenant,
            chofer_id=chofer_id,
            email_message_id=email_obj.message_id,
            email_remitente=email_obj.remitente,
            email_asunto=email_obj.asunto,
            email_fecha=email_obj.fecha,
            archivo_ruta=ruta_destino,
            archivo_nombre=adj.nombre,
            archivo_mime=adj.mime,
            archivo_tamaño=len(adj.contenido),
            archivo_hash=digest,
        )
        try:
            resultado = extraer_de_archivo(ruta_destino, plantillas)

            # Si ninguna plantilla casa: pedir a la IA generar una nueva.
            if not resultado.plantilla:
                LOG.info(
                    "doc=%s emisor=%s → sin plantilla, intentando IA",
                    documento_id, email_obj.remitente,
                )
                resultado_ia = _intentar_ia_y_persistir_plantilla(
                    documento_id=documento_id,
                    ruta_destino=ruta_destino,
                    email_obj=email_obj,
                    empresa_codigo=empresa_codigo,
                    chofer_id=chofer_id,
                    tenant=tenant,
                    plantillas_recargar=plantillas_recargar,
                )
                if resultado_ia is None:
                    # ya se ha registrado el error y abierto ticket dentro
                    tenant.commit()
                    continue
                resultado = resultado_ia

            viaje_id = insertar_viaje(
                tenant,
                documento_id=documento_id,
                chofer_id=chofer_id,
                valores=resultado.valores,
            )
            marcar_documento_procesado(tenant, documento_id)
            tenant.commit()

            # Volcado a tabla canónica de pasarela (si pasarela está activa).
            try:
                volcar_a_pasarela(
                    empresa_codigo=empresa_codigo,
                    documento_id=documento_id,
                    chofer_id=chofer_id,
                    valores=resultado.valores,
                    operador_cif=resultado.valores.get('operador_cif'),
                    operador_nombre=resultado.valores.get('operador_nombre'),
                )
            except Exception as e:
                LOG.warning("doc=%s pasarela_sync no crítico falló: %s", documento_id, e)

            LOG.info(
                "doc=%s plantilla=%s viaje=%s creado para chofer_id=%s",
                documento_id, resultado.plantilla, viaje_id, chofer_id,
            )
        except Exception as e:
            tenant.rollback()
            try:
                marcar_documento_error(tenant, documento_id, repr(e))
                tenant.commit()
            except Exception:
                tenant.rollback()
            LOG.exception("doc=%s falló al procesar: %s", documento_id, e)
            # ticket urgente para que un humano revise
            crear_ticket(
                titulo=f'chofocles: error al procesar documento (doc {documento_id})',
                descripcion=(
                    f"Error: {e!r}\nRemitente: {email_obj.remitente}\n"
                    f"Asunto: {email_obj.asunto}\nArchivo: {adj.nombre}"
                ),
                servicio='chofocles',
                prioridad='urgente',
                empresa_codigo=empresa_codigo,
                contacto_email=email_obj.remitente,
                origen_ref=f'documento:{documento_id}',
                datos_extra={
                    'archivo_nombre': adj.nombre,
                    'archivo_mime': adj.mime,
                    'message_id': email_obj.message_id,
                },
            )


def _intentar_ia_y_persistir_plantilla(
    *,
    documento_id,
    ruta_destino,
    email_obj,
    empresa_codigo,
    chofer_id,
    tenant,
    plantillas_recargar,
):
    """Llama a Claude. Si certeza → persiste plantilla, recarga lista y
    devuelve un Resultado válido. Si no certeza → ticket urgente y
    devuelve None."""
    try:
        texto = archivo_a_texto(ruta_destino)
    except Exception as e:
        LOG.warning("doc=%s no se pudo extraer texto: %s", documento_id, e)
        marcar_documento_error(tenant, documento_id, f'no_texto: {e!r}')
        crear_ticket(
            titulo='chofocles: documento ilegible',
            descripcion=f'No se pudo extraer texto del documento.\n{e!r}',
            servicio='chofocles', prioridad='urgente',
            empresa_codigo=empresa_codigo,
            contacto_email=email_obj.remitente,
            origen_ref=f'documento:{documento_id}',
        )
        return None

    res_ia = llamar_claude(
        texto=texto,
        remitente=email_obj.remitente or '',
        asunto=email_obj.asunto or '',
    )
    if not res_ia.ok:
        marcar_documento_error(
            tenant, documento_id,
            f'ia_no_certeza: {res_ia.fail_motivo}',
        )
        crear_ticket(
            titulo='chofocles: la IA no consigue certeza en una orden nueva',
            descripcion=(
                f'Motivo: {res_ia.fail_motivo}\n'
                f'Remitente: {email_obj.remitente}\nAsunto: {email_obj.asunto}\n'
                f'Operador detectado (tentativo): '
                f'{res_ia.operador_nombre or "desconocido"} '
                f'(CIF {res_ia.operador_cif or "?"})'
            ),
            servicio='chofocles', prioridad='urgente',
            empresa_codigo=empresa_codigo,
            contacto_email=email_obj.remitente,
            origen_ref=f'documento:{documento_id}',
            datos_extra={
                'metodo_a': res_ia.raw_a,
                'metodo_b': res_ia.raw_b,
                'plantilla_propuesta': res_ia.plantilla,
            },
        )
        return None

    # Certeza: persistir plantilla nueva en saycu_admin para reutilizarla.
    if res_ia.plantilla:
        try:
            cn = admin_conn()
            insertar_plantilla_bd(
                cn,
                operador_cif=res_ia.operador_cif,
                operador_email_dominio=res_ia.operador_email_dominio,
                operador_nombre=res_ia.operador_nombre,
                definicion=res_ia.plantilla,
                creada_por_ia=True,
                notas=(
                    f'auto-generada por IA tras email "{email_obj.asunto}" '
                    f'remitente {email_obj.remitente}'
                ),
            )
            cn.commit()
        except Exception as e:
            LOG.warning("doc=%s plantilla nueva NO persistida: %s", documento_id, e)

    # Forzar recarga de plantillas en el siguiente ciclo
    plantillas_recargar['recargar'] = True

    # Reusar la estructura Resultado del extractor con los valores que dio la IA
    from extractor import Resultado
    return Resultado(
        plantilla='ia-generada',
        empresa=res_ia.operador_nombre or 'desconocido',
        valores=res_ia.valores,
        valores_piloto={},
    )


def procesar_buzon(
    *,
    tenant,
    plantillas,
    empresa_codigo: str,
    buzon: dict,
    plantillas_recargar: dict,
):
    try:
        imap_password = decrypt(buzon['imap_password_enc'])
    except Exception as e:
        actualizar_buzon_error(tenant, buzon['id'], f'decrypt_failed: {e!r}')
        tenant.commit()
        LOG.error("buzón %s: no se pudo descifrar imap_password: %s", buzon['id'], e)
        return

    last_uid = int(buzon.get('last_uid_seen') or 0)
    max_uid_visto = last_uid

    try:
        emails = list(buscar_emails_nuevos(
            host=buzon['imap_host'],
            port=int(buzon['imap_port']),
            user=buzon['imap_user'],
            password=imap_password,
            ssl=bool(buzon['imap_ssl']),
            carpeta=buzon['imap_carpeta'] or 'INBOX',
            last_uid_seen=last_uid,
        ))
    except Exception as e:
        actualizar_buzon_error(tenant, buzon['id'], f'imap_error: {e!r}')
        tenant.commit()
        LOG.error("buzón %s: IMAP falló: %s", buzon['id'], e)
        return

    for em in emails:
        procesar_email(
            tenant=tenant,
            plantillas=plantillas,
            empresa_codigo=empresa_codigo,
            chofer_id=buzon['usuario_id'],
            email_obj=em,
            plantillas_recargar=plantillas_recargar,
        )
        if em.uid > max_uid_visto:
            max_uid_visto = em.uid

    actualizar_last_uid(tenant, buzon['id'], max_uid_visto)
    tenant.commit()


def loop():
    plantillas_recargar = {'recargar': True}
    plantillas = []

    while _running:
        ciclo_inicio = time.monotonic()

        # Recargar plantillas (BD + YAML) si toca
        if plantillas_recargar.get('recargar') or not plantillas:
            try:
                cn = admin_conn()
                plantillas = cargar_plantillas_combinadas(cn)
            except Exception as e:
                LOG.exception("error cargando plantillas: %s", e)
                plantillas = []
            plantillas_recargar['recargar'] = False
            LOG.info("ingestor: %d plantillas activas", len(plantillas))

        # Modo IMAP central: 1 buzón único enrutado por destinatario.
        if es_modo_central():
            try:
                cosechados = recoger_emails_central()
                LOG.info("imap_central: %d emails recogidos", len(cosechados))
                # Agrupar por empresa para reusar conexión tenant
                por_empresa: dict[str, list[tuple[int, object]]] = {}
                for empresa_codigo, chofer_id, em in cosechados:
                    por_empresa.setdefault(empresa_codigo, []).append((chofer_id, em))
                for empresa_codigo, lista in por_empresa.items():
                    try:
                        tenant = tenant_conn(empresa_codigo)
                    except Exception as e:
                        LOG.exception("empresa %s: no se pudo conectar: %s", empresa_codigo, e)
                        continue
                    for chofer_id, em in lista:
                        if not _running:
                            break
                        procesar_email(
                            tenant=tenant,
                            plantillas=plantillas,
                            empresa_codigo=empresa_codigo,
                            chofer_id=chofer_id,
                            email_obj=em,
                            plantillas_recargar=plantillas_recargar,
                        )
            except Exception as e:
                LOG.exception("imap_central error de ciclo: %s", e)
            # Sleep y siguiente ciclo (en modo central no usamos chofer_buzones).
            elapsed = time.monotonic() - ciclo_inicio
            sleep_s = max(0, POLL_INTERVAL_SECONDS - elapsed)
            for _ in range(int(sleep_s)):
                if not _running:
                    break
                time.sleep(1)
            continue

        try:
            empresas = empresas_chofocles()
        except Exception as e:
            LOG.exception("error consultando empresas: %s", e)
            empresas = []

        for empresa in empresas:
            empresa_codigo = empresa['codigo']
            try:
                tenant = tenant_conn(empresa_codigo)
            except Exception as e:
                LOG.exception("empresa %s: no se pudo conectar a su BBDD: %s", empresa_codigo, e)
                continue

            try:
                buzones = buzones_activos(empresa_codigo)
            except Exception as e:
                LOG.exception("empresa %s: error listando buzones: %s", empresa_codigo, e)
                continue

            for buzon in buzones:
                if not _running:
                    break
                procesar_buzon(
                    tenant=tenant,
                    plantillas=plantillas,
                    empresa_codigo=empresa_codigo,
                    buzon=buzon,
                    plantillas_recargar=plantillas_recargar,
                )

        # Sleep restante hasta el siguiente ciclo
        elapsed = time.monotonic() - ciclo_inicio
        sleep_s = max(0, POLL_INTERVAL_SECONDS - elapsed)
        for _ in range(int(sleep_s)):
            if not _running:
                break
            time.sleep(1)

    close_all()
    LOG.info("ingestor cerrado limpiamente")


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, _sigterm)
    signal.signal(signal.SIGINT, _sigterm)
    try:
        loop()
    except Exception as e:
        LOG.exception("fallo no controlado: %s", e)
        sys.exit(1)
