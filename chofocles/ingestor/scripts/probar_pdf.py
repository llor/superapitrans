"""Procesa un PDF/DOCX local como si viniera de un email del chofer.

Uso (dentro del contenedor chofocles_ingestor):
    python /app/scripts/probar_pdf.py /tmp/orden.pdf [--persistir]
                                      [--empresa DEMO] [--chofer-id 1]

Por defecto NO toca la BD: solo muestra qué se extraería (plantilla o IA),
qué valores y qué plantilla generaría la IA. Con --persistir crea documento,
plantilla y viaje de verdad.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, '/app/src')

from extractor import archivo_a_texto, extraer_de_archivo  # noqa: E402
from template_loader_db import cargar_plantillas_combinadas, insertar_plantilla_bd  # noqa: E402
from ai_client import llamar_claude  # noqa: E402
from db import admin_conn, tenant_conn  # noqa: E402
from persister import _guardar_binario, insertar_documento, insertar_viaje, marcar_documento_procesado  # noqa: E402
from pasarela_sync import volcar_a_pasarela  # noqa: E402


def _resumen_texto(texto: str, limite: int = 500) -> str:
    if not texto:
        return '(vacío)'
    if len(texto) <= limite:
        return texto
    return texto[:limite] + f'\n... (+{len(texto) - limite} chars)'


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('archivo', type=Path)
    p.add_argument('--empresa', default='DEMO')
    p.add_argument('--chofer-id', type=int, default=1)
    p.add_argument('--persistir', action='store_true')
    args = p.parse_args()

    if not args.archivo.is_file():
        print(f'ERROR: no existe {args.archivo}', file=sys.stderr)
        return 2

    print(f'=== ARCHIVO: {args.archivo.name}  ({args.archivo.stat().st_size} bytes) ===')

    # 1) Plantillas activas (BD admin)
    cn_admin = admin_conn()
    plantillas = cargar_plantillas_combinadas(cn_admin)
    print(f'Plantillas cargadas: {len(plantillas)}')

    # 2) Extracción texto + matching de plantilla
    try:
        texto = archivo_a_texto(args.archivo)
    except Exception as e:
        print(f'ERROR extrayendo texto: {e!r}')
        return 3
    print(f'\n--- TEXTO ({len(texto)} chars) ---')
    print(_resumen_texto(texto))

    resultado = extraer_de_archivo(args.archivo, plantillas)
    if resultado.plantilla:
        print(f'\n--- PLANTILLA YA EXISTENTE: {resultado.plantilla} ({resultado.empresa}) ---')
        print(json.dumps(resultado.valores, indent=2, ensure_ascii=False))
        if not args.persistir:
            print('\n[dry-run] no se inserta en BD. Usa --persistir para crear el viaje.')
            return 0
        _persistir(args, resultado.valores)
        return 0

    print('\n--- NINGUNA PLANTILLA CASA → llamando a IA ---')
    res_ia = llamar_claude(
        texto=texto,
        remitente=f'(test) {args.archivo.name}',
        asunto=f'(test) {args.archivo.stem}',
    )
    if not res_ia.ok:
        print(f'IA SIN CERTEZA: {res_ia.fail_motivo}')
        print('--- método A:'); print(json.dumps(res_ia.raw_a, indent=2, ensure_ascii=False))
        print('--- método B:'); print(json.dumps(res_ia.raw_b, indent=2, ensure_ascii=False))
        return 4

    print('IA OK ✓ (consenso A=B en campos críticos)')
    print(f'Operador: {res_ia.operador_nombre}  CIF: {res_ia.operador_cif}  '
          f'dominio: {res_ia.operador_email_dominio}')
    print('\n--- VALORES CONSENSUADOS ---')
    print(json.dumps(res_ia.valores, indent=2, ensure_ascii=False))
    print('\n--- PLANTILLA PROPUESTA POR LA IA ---')
    print(json.dumps(res_ia.plantilla, indent=2, ensure_ascii=False))

    if not args.persistir:
        print('\n[dry-run] no se inserta. Usa --persistir para guardar plantilla + viaje.')
        return 0

    # 3) Persistir plantilla + documento + viaje (modo --persistir)
    if res_ia.plantilla:
        try:
            insertar_plantilla_bd(
                cn_admin,
                operador_cif=res_ia.operador_cif,
                operador_email_dominio=res_ia.operador_email_dominio,
                operador_nombre=res_ia.operador_nombre,
                definicion=res_ia.plantilla,
                creada_por_ia=True,
                notas=f'auto-generada por test_procesar_pdf con {args.archivo.name}',
            )
            cn_admin.commit()
            print('Plantilla persistida en saycu_admin.chofocles_plantillas_json ✓')
        except Exception as e:
            cn_admin.rollback()
            print(f'⚠ no se pudo persistir plantilla: {e!r}')

    _persistir(args, res_ia.valores)
    return 0


def _persistir(args, valores: dict) -> None:
    """Crea documento + viaje en el tenant."""
    tenant = tenant_conn(args.empresa)
    contenido = args.archivo.read_bytes()
    ruta_destino, digest = _guardar_binario(
        storage_root=Path('/var/chofocles/documentos'),
        empresa=args.empresa,
        contenido=contenido,
        nombre_original=args.archivo.name,
    )
    documento_id = insertar_documento(
        tenant,
        chofer_id=args.chofer_id,
        email_message_id=f'test:{args.archivo.name}',
        email_remitente='(test)',
        email_asunto=f'(test) {args.archivo.stem}',
        email_fecha=None,
        archivo_ruta=ruta_destino,
        archivo_nombre=args.archivo.name,
        archivo_mime='application/pdf',
        archivo_tamaño=len(contenido),
        archivo_hash=digest,
    )
    viaje_id = insertar_viaje(
        tenant,
        documento_id=documento_id,
        chofer_id=args.chofer_id,
        valores=valores,
    )
    marcar_documento_procesado(tenant, documento_id)
    tenant.commit()

    try:
        volcar_a_pasarela(
            empresa_codigo=args.empresa,
            documento_id=documento_id,
            chofer_id=args.chofer_id,
            valores=valores,
            operador_cif=valores.get('operador_cif'),
            operador_nombre=valores.get('operador_nombre'),
        )
    except Exception as e:
        print(f'⚠ pasarela_sync no crítico falló: {e!r}')

    print(f'Documento {documento_id} + viaje {viaje_id} creados en tenant {args.empresa} ✓')


if __name__ == '__main__':
    sys.exit(main())
