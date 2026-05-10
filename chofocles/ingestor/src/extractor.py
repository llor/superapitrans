"""Motor de extracción de PDFs basado en plantillas YAML.

Refactor de `importarDatosPdf/extraer.py` para uso como librería:
- `extraer_de_pdf(pdf_path) -> dict` devuelve los campos canónicos de la
  orden encontrados, o {} si ningún plantilla casa.
- `extraer_de_texto(texto) -> dict` igual pero a partir de texto ya extraído
  (útil para DOCX / emails).
- Las plantillas viven en `<root>/plantillas/*.yaml` (mismo formato que el
  piloto). En futuro: cargar desde BBDD `saycu_admin.chofocles_plantillas`.

Los nombres de campo del piloto (`cliente`, `carga`, `descarga`, `mercancia`,
`precio`, `email`, `telefono`) se mapean a los **campos canónicos** de
`saycu_admin.chofocles_campos_canonicos` (cabecera/parada/operador) en
`MAPEO_PILOTO_A_CANONICO`.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

PLANTILLAS_DIR = Path(__file__).resolve().parent.parent / 'plantillas'

CAMPOS_PILOTO = ['cliente', 'carga', 'descarga', 'mercancia', 'precio', 'email', 'telefono']

# Mapeo provisional del campo del piloto al campo canónico de chofocles.
# Las plantillas heredadas usan nombres del piloto; la BBDD usa los canónicos.
MAPEO_PILOTO_A_CANONICO = {
    'cliente':  'operador_nombre',
    'carga':    'origen_municipio',
    'descarga': 'destino_municipio',
    'mercancia': 'mercancia_descripcion',
    'precio':   'precio',
    'email':    'operador_email',
    'telefono': 'operador_telefono',
}


# ---------------------------------------------------------------------------
# Extracción de texto desde PDF / DOCX
# ---------------------------------------------------------------------------

def pdf_a_texto(pdf_path: Path) -> str:
    if shutil.which('pdftotext') is None:
        raise RuntimeError("pdftotext no está instalado (paquete poppler-utils)")
    res = subprocess.run(
        ['pdftotext', '-layout', '-enc', 'UTF-8', str(pdf_path), '-'],
        capture_output=True,
        check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(
            f"pdftotext falló para {pdf_path}: {res.stderr.decode('utf-8','replace')}"
        )
    return res.stdout.decode('utf-8', 'replace')


def docx_a_texto(docx_path: Path) -> str:
    """Extrae texto plano de un .docx leyendo word/document.xml directamente.

    No depende de python-docx para no añadir dependencia. Suficiente para
    plantillas basadas en texto literal y regex.
    """
    with zipfile.ZipFile(docx_path) as z:
        with z.open('word/document.xml') as f:
            xml = f.read().decode('utf-8')
    textos = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml)
    return '\n'.join(t for t in textos if t)


def archivo_a_texto(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == '.pdf':
        return pdf_a_texto(path)
    if suffix == '.docx':
        return docx_a_texto(path)
    raise RuntimeError(f"Formato no soportado: {suffix} ({path})")


# ---------------------------------------------------------------------------
# Plantillas (YAML)
# ---------------------------------------------------------------------------

@dataclass
class Plantilla:
    nombre: str
    archivo: Path
    empresa: str
    match: dict
    fields: dict = field(default_factory=dict)

    def aplica(self, texto: str) -> bool:
        all_terms = self.match.get('all') or []
        any_terms = self.match.get('any') or []
        if all_terms and not all(t in texto for t in all_terms):
            return False
        if any_terms and not any(t in texto for t in any_terms):
            return False
        if not all_terms and not any_terms:
            return False
        return True


def cargar_plantillas(plantillas_dir: Path = PLANTILLAS_DIR) -> list[Plantilla]:
    if not plantillas_dir.is_dir():
        raise RuntimeError(f"No existe la carpeta de plantillas: {plantillas_dir}")
    plantillas: list[Plantilla] = []
    for archivo in sorted(plantillas_dir.glob('*.yaml')):
        with archivo.open('r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        if not isinstance(data, dict):
            raise RuntimeError(f"Plantilla {archivo} no es un objeto YAML válido")
        plantillas.append(Plantilla(
            nombre=archivo.stem,
            archivo=archivo,
            empresa=data.get('empresa') or archivo.stem,
            match=data.get('match') or {},
            fields=data.get('fields') or {},
        ))
    return plantillas


# ---------------------------------------------------------------------------
# Extractores de campo (sin cambios respecto al piloto)
# ---------------------------------------------------------------------------

def aplicar_regex(texto: str, spec: dict) -> str:
    pattern = spec['pattern']
    flags = 0
    for f in (spec.get('flags') or []):
        flags |= getattr(re, f.upper())
    m = re.search(pattern, texto, flags)
    if not m:
        return ''
    if 'group' in spec:
        try:
            valor = m.group(spec['group'])
        except (IndexError, re.error):
            return ''
    elif m.groups():
        valor = m.group(1)
    else:
        valor = m.group(0)
    return _post(valor, spec)


def aplicar_lineas(texto: str, spec: dict) -> str:
    raw_lines = texto.splitlines()
    seleccion: list[str] = []
    if 'numeros' in spec:
        for n in spec['numeros']:
            if 1 <= n <= len(raw_lines):
                seleccion.append(raw_lines[n - 1])
    elif 'start_pattern' in spec and 'end_pattern' in spec:
        start = re.compile(spec['start_pattern'])
        end = re.compile(spec['end_pattern'])
        i = 0
        while i < len(raw_lines) and not start.search(raw_lines[i]):
            i += 1
        i += 1
        while i < len(raw_lines) and not end.search(raw_lines[i]):
            seleccion.append(raw_lines[i])
            i += 1
    else:
        return ''
    seleccion = [_strip_columna(l, spec) for l in seleccion]
    seleccion = [l for l in (s.strip() for s in seleccion) if l]
    if 'drop_patterns' in spec:
        drops = [re.compile(p) for p in spec['drop_patterns']]
        seleccion = [l for l in seleccion if not any(d.search(l) for d in drops)]
    sep = spec.get('join', ' ')
    return _post(sep.join(seleccion), spec)


def _strip_columna(linea: str, spec: dict) -> str:
    column = spec.get('column')
    if not column:
        return linea
    split_col = spec.get('split_col')
    if split_col is None:
        return linea
    if column == 'left':
        return linea[:split_col]
    if column == 'right':
        return linea[split_col:]
    return linea


def aplicar_columna(texto: str, spec: dict) -> str:
    raw_lines = texto.splitlines()
    start_re = re.compile(spec['start_pattern'])
    end_re = re.compile(spec['end_pattern'])
    i = 0
    while i < len(raw_lines) and not start_re.search(raw_lines[i]):
        i += 1
    if i >= len(raw_lines):
        return ''
    linea_start = raw_lines[i]
    i += 1
    split_col = spec.get('split_col')
    if 'split_anchor' in spec:
        idx = linea_start.find(spec['split_anchor'])
        if idx >= 0:
            split_col = idx
    if split_col is None:
        split_col = len(linea_start) // 2
    bloque: list[str] = []
    while i < len(raw_lines) and not end_re.search(raw_lines[i]):
        bloque.append(raw_lines[i])
        i += 1
    column = spec.get('column', 'left')
    if column == 'left':
        partes = [l[:split_col] for l in bloque]
    elif column == 'right':
        partes = [l[split_col:] for l in bloque]
    else:
        partes = bloque
    partes = [re.sub(r'[ \t]+', ' ', p).strip() for p in partes]
    partes = [p for p in partes if p]
    if 'drop_patterns' in spec:
        drops = [re.compile(p) for p in spec['drop_patterns']]
        partes = [p for p in partes if not any(d.search(p) for d in drops)]
    sep = spec.get('join', ' ')
    return _post(sep.join(partes), spec)


def _post(valor: str, spec: dict) -> str:
    if not valor:
        return ''
    valor = valor.strip()
    valor = re.sub(r'[ \t]+', ' ', valor)
    if spec.get('lower'):
        valor = valor.lower()
    if spec.get('upper'):
        valor = valor.upper()
    if spec.get('strip_chars'):
        valor = valor.strip(spec['strip_chars'])
    return valor


EXTRACTORES = {
    'regex': aplicar_regex,
    'lineas': aplicar_lineas,
    'columna': aplicar_columna,
}


def _extraer_campo(texto: str, spec: Any) -> str:
    if spec is None:
        return ''
    if isinstance(spec, list):
        for sub in spec:
            valor = _extraer_campo(texto, sub)
            if valor:
                return valor
        return ''
    if not isinstance(spec, dict):
        return ''
    tipo = spec.get('tipo')
    if tipo not in EXTRACTORES:
        raise RuntimeError(f"tipo de extractor desconocido: {tipo!r}")
    return EXTRACTORES[tipo](texto, spec)


# ---------------------------------------------------------------------------
# Punto de entrada como librería
# ---------------------------------------------------------------------------

@dataclass
class Resultado:
    plantilla: str | None
    empresa: str | None
    valores: dict[str, str]            # claves = campos canónicos chofocles
    valores_piloto: dict[str, str]     # claves = nombres del piloto (debug)


def extraer_de_texto(
    texto: str,
    plantillas: list[Plantilla] | None = None,
) -> Resultado:
    if plantillas is None:
        plantillas = cargar_plantillas()
    if not texto.strip():
        return Resultado(plantilla=None, empresa=None, valores={}, valores_piloto={})
    plantilla = next((p for p in plantillas if p.aplica(texto)), None)
    if plantilla is None:
        return Resultado(plantilla=None, empresa=None, valores={}, valores_piloto={})
    valores_piloto: dict[str, str] = {}
    for campo in CAMPOS_PILOTO:
        spec = plantilla.fields.get(campo)
        valores_piloto[campo] = _extraer_campo(texto, spec)
    valores: dict[str, str] = {}
    for piloto, canonico in MAPEO_PILOTO_A_CANONICO.items():
        if valores_piloto.get(piloto):
            valores[canonico] = valores_piloto[piloto]
    return Resultado(
        plantilla=plantilla.nombre,
        empresa=plantilla.empresa,
        valores=valores,
        valores_piloto=valores_piloto,
    )


def extraer_de_archivo(
    path: Path,
    plantillas: list[Plantilla] | None = None,
) -> Resultado:
    texto = archivo_a_texto(path)
    return extraer_de_texto(texto, plantillas)
