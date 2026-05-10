-- =========================================================================
-- chofocles — Migración 0001 — Catálogo en saycu_admin
-- =========================================================================
-- BBDD destino: saycu_admin (compartida entre todos los productos Saycu).
-- Idempotente: usa IF NOT EXISTS / IF EXISTS para poder reejecutarse.
-- Fecha:   2026-04-30
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Añadir 'chofocles' al ENUM servicio_tipo existente
--    (valores actuales: transporte, control_presencial, datos_facturacion).
-- -------------------------------------------------------------------------

ALTER TYPE servicio_tipo ADD VALUE IF NOT EXISTS 'chofocles';


-- -------------------------------------------------------------------------
-- 2. Catálogo de operadores logísticos (Jasaro, Logicer, Saycusoft, …)
--    Es el remitente de la orden de carga (NO el cliente final).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_operadores_logisticos (
    id          BIGSERIAL    PRIMARY KEY,
    cif         VARCHAR(20)  NOT NULL UNIQUE,
    nombre      VARCHAR(200) NOT NULL,
    direccion   TEXT,
    telefono    VARCHAR(100),
    email       VARCHAR(200),
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chofocles_oplog_activo
    ON chofocles_operadores_logisticos (activo) WHERE activo;

DROP TRIGGER IF EXISTS trg_chofocles_oplog_upd
    ON chofocles_operadores_logisticos;
CREATE TRIGGER trg_chofocles_oplog_upd
    BEFORE UPDATE ON chofocles_operadores_logisticos
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 3. Plantillas de extracción.
--    Una por (operador, version). Se versiona porque los operadores
--    cambian formato y queremos historial de qué versión extrajo qué.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_plantillas (
    id          BIGSERIAL    PRIMARY KEY,
    operador_id BIGINT       NOT NULL
                REFERENCES chofocles_operadores_logisticos(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    version     INTEGER      NOT NULL DEFAULT 1,
    activa      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (operador_id, version)
);

CREATE INDEX IF NOT EXISTS idx_chofocles_plantillas_operador
    ON chofocles_plantillas (operador_id) WHERE activa;

DROP TRIGGER IF EXISTS trg_chofocles_plantillas_upd
    ON chofocles_plantillas;
CREATE TRIGGER trg_chofocles_plantillas_upd
    BEFORE UPDATE ON chofocles_plantillas
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 4. Reglas de match — cómo se identifica que un PDF/DOCX viene del
--    operador X (CIF en cabecera, texto distintivo, regex…).
--    Se evalúan por `orden` ascendente; primer match positivo gana.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_plantilla_match_rules (
    id           BIGSERIAL PRIMARY KEY,
    plantilla_id BIGINT      NOT NULL
                 REFERENCES chofocles_plantillas(id) ON DELETE CASCADE,
    tipo         VARCHAR(20) NOT NULL
                 CHECK (tipo IN ('cif', 'texto_cabecera', 'regex')),
    valor        TEXT        NOT NULL,
    orden        INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chofocles_match_plantilla
    ON chofocles_plantilla_match_rules (plantilla_id);


-- -------------------------------------------------------------------------
-- 5. Catálogo canónico de campos extraíbles.
--    Limita y describe los campos que las plantillas pueden extraer.
--    Mismo nombre de columna que en `viajes` / `viajes_paradas` de
--    saycutrans cuando aplica (decisión del usuario, abril 2026).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_campos_canonicos (
    id          BIGSERIAL    PRIMARY KEY,
    codigo      VARCHAR(50)  NOT NULL UNIQUE,
    descripcion VARCHAR(200) NOT NULL,
    grupo       VARCHAR(20)  NOT NULL
                CHECK (grupo IN ('cabecera', 'parada_carga', 'parada_descarga', 'operador')),
    tipo_dato   VARCHAR(20)  NOT NULL
                CHECK (tipo_dato IN ('texto', 'fecha', 'numero', 'email', 'telefono', 'cif', 'matricula')),
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_chofocles_campos_upd
    ON chofocles_campos_canonicos;
CREATE TRIGGER trg_chofocles_campos_upd
    BEFORE UPDATE ON chofocles_campos_canonicos
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

-- Población inicial del catálogo (idempotente con ON CONFLICT).
INSERT INTO chofocles_campos_canonicos (codigo, descripcion, grupo, tipo_dato) VALUES
    -- Cabecera del viaje (mapean a tabla `viajes` del tenant)
    ('referencia_externa',     'Nº de orden de carga del operador', 'cabecera', 'texto'),
    ('cliente_nombre',         'Cliente final del transporte',       'cabecera', 'texto'),
    ('mercancia_descripcion',  'Descripción de la mercancía',        'cabecera', 'texto'),
    ('tractora_matricula',     'Matrícula de la tractora',           'cabecera', 'matricula'),
    ('remolque_matricula',     'Matrícula del remolque',             'cabecera', 'matricula'),
    ('origen_municipio',       'Municipio del origen (cabecera)',    'cabecera', 'texto'),
    ('origen_direccion1',      'Dirección del origen (cabecera)',    'cabecera', 'texto'),
    ('destino_municipio',      'Municipio del destino (cabecera)',   'cabecera', 'texto'),
    ('destino_direccion1',     'Dirección del destino (cabecera)',   'cabecera', 'texto'),
    ('fecha_carga',            'Fecha prevista de carga',            'cabecera', 'fecha'),
    ('fecha_descarga',         'Fecha prevista de descarga',         'cabecera', 'fecha'),
    ('precio',                 'Precio del transporte (€)',          'cabecera', 'numero'),
    ('notas',                  'Notas / observaciones del operador', 'cabecera', 'texto'),
    -- Parada de carga (mapean a `viajes_paradas` con tipo='carga')
    ('origen_nombre_cliente',  'Nombre de la fábrica de origen',          'parada_carga', 'texto'),
    ('origen_codigo_postal',   'CP del punto de carga',                   'parada_carga', 'texto'),
    ('origen_poblacion',       'Población del punto de carga',            'parada_carga', 'texto'),
    ('origen_provincia',       'Provincia del punto de carga',            'parada_carga', 'texto'),
    ('origen_contacto',        'Persona de contacto en carga',            'parada_carga', 'texto'),
    ('origen_telefono',        'Teléfono del punto de carga',             'parada_carga', 'telefono'),
    -- Parada de descarga (mapean a `viajes_paradas` con tipo='descarga')
    ('destino_nombre_cliente', 'Nombre de la fábrica de destino',         'parada_descarga', 'texto'),
    ('destino_codigo_postal',  'CP del punto de descarga',                'parada_descarga', 'texto'),
    ('destino_poblacion',      'Población del punto de descarga',         'parada_descarga', 'texto'),
    ('destino_provincia',      'Provincia del punto de descarga',         'parada_descarga', 'texto'),
    ('destino_contacto',       'Persona de contacto en descarga',         'parada_descarga', 'texto'),
    ('destino_telefono',       'Teléfono del punto de descarga',          'parada_descarga', 'telefono'),
    -- Operador logístico (emisor de la orden — específico de chofocles)
    ('operador_cif',           'CIF del operador (clave para matching)',  'operador', 'cif'),
    ('operador_nombre',        'Nombre del operador logístico',           'operador', 'texto'),
    ('operador_email',         'Email del operador logístico',            'operador', 'email'),
    ('operador_telefono',      'Teléfono del operador logístico',         'operador', 'telefono')
ON CONFLICT (codigo) DO NOTHING;


-- -------------------------------------------------------------------------
-- 6. Reglas de extracción por campo dentro de cada plantilla.
--    Cada fila = "para esta plantilla, este campo se extrae así".
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_plantilla_campos (
    id              BIGSERIAL PRIMARY KEY,
    plantilla_id    BIGINT      NOT NULL
                    REFERENCES chofocles_plantillas(id) ON DELETE CASCADE,
    campo_id        BIGINT      NOT NULL
                    REFERENCES chofocles_campos_canonicos(id),
    tipo_extraccion VARCHAR(30) NOT NULL
                    CHECK (tipo_extraccion IN ('regex', 'columna_izq', 'columna_der', 'linea_siguiente', 'literal')),
    patron          TEXT,
    ancla           TEXT,
    orden           INTEGER     NOT NULL DEFAULT 0,
    UNIQUE (plantilla_id, campo_id)
);

CREATE INDEX IF NOT EXISTS idx_chofocles_pcampos_plantilla
    ON chofocles_plantilla_campos (plantilla_id);


COMMIT;
