-- =========================================================================
-- chofocles — Migración 0003 — Modelo de viajes (tenant)
-- =========================================================================
-- BBDD destino: saycu_chofocles_<CODIGO>
-- Bloque 3: vehículos, viajes (cabecera), paradas, estados (catálogo +
--           historial), incidencias, documentos.
-- Calcado de saycutrans en estructura y nombres de columnas/estados,
-- con campos chofocles-específicos: precio, operador_cif, plantilla_id,
-- documento_id en `viajes`. La función trigger_updated_at ya existe en
-- esta BD desde 0002.
-- Idempotente.
-- Fecha:   2026-04-30
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Tipos de vehículo (catálogo).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tipos_vehiculo (
    id          BIGSERIAL    PRIMARY KEY,
    codigo      VARCHAR(50)  NOT NULL UNIQUE,
    nombre      VARCHAR(100) NOT NULL,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_tipos_vehiculo_upd ON tipos_vehiculo;
CREATE TRIGGER trg_tipos_vehiculo_upd BEFORE UPDATE ON tipos_vehiculo
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

INSERT INTO tipos_vehiculo (codigo, nombre) VALUES
    ('tractora',   'Tractora'),
    ('remolque',   'Remolque'),
    ('plataforma', 'Plataforma'),
    ('rigido',     'Rígido')
ON CONFLICT (codigo) DO NOTHING;


-- -------------------------------------------------------------------------
-- 2. Vehículos (calcado de saycutrans, simplificado).
--    En chofocles el chofer autónomo tiene 1-2 vehículos. La tabla se
--    alimenta por UPSERT cuando un PDF trae una matrícula nueva.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vehiculos (
    id                 BIGSERIAL    PRIMARY KEY,
    matricula          VARCHAR(20)  NOT NULL UNIQUE,
    matricula_original VARCHAR(20),
    marca              VARCHAR(80),
    modelo             VARCHAR(80),
    tipo_id            BIGINT       REFERENCES tipos_vehiculo(id),
    es_plataforma      BOOLEAN      NOT NULL DEFAULT FALSE,
    plataforma_id      BIGINT       REFERENCES vehiculos(id),
    capacidad_kg       NUMERIC(12,2),
    capacidad_m3       NUMERIC(12,3),
    combustible        VARCHAR(30),
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_at         TIMESTAMPTZ,
    deleted_by         INTEGER,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehiculos_not_deleted
    ON vehiculos(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehiculos_deleted
    ON vehiculos(deleted_at) WHERE deleted_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_vehiculos_upd ON vehiculos;
CREATE TRIGGER trg_vehiculos_upd BEFORE UPDATE ON vehiculos
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

-- vehículo_id en usuarios para el chofer-autónomo: añadimos la columna
-- ahora que vehiculos existe. No la metimos en 0002 para no obligar a
-- que ese bloque dependa de este.
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS vehiculo_id BIGINT REFERENCES vehiculos(id);
CREATE INDEX IF NOT EXISTS idx_usuarios_vehiculo_id
    ON usuarios(vehiculo_id) WHERE vehiculo_id IS NOT NULL;


-- -------------------------------------------------------------------------
-- 3. Estados de viaje (catálogo + historial). Calcado de saycutrans.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS estados_viaje (
    id          BIGSERIAL    PRIMARY KEY,
    codigo      VARCHAR(50)  NOT NULL UNIQUE,
    nombre      VARCHAR(100) NOT NULL,
    color       VARCHAR(20),
    orden       INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_estados_viaje_upd ON estados_viaje;
CREATE TRIGGER trg_estados_viaje_upd BEFORE UPDATE ON estados_viaje
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

INSERT INTO estados_viaje (codigo, nombre, orden) VALUES
    ('pendiente',         'Pendiente',             10),
    ('aceptado',          'Aceptado',              15),
    ('rechazado',         'Rechazado',             16),
    ('en_curso',          'En curso',              20),
    ('terminado',         'Terminado',             30),
    ('caducado',          'Caducado',              35),
    ('cancelado',         'Cancelado',             40),
    ('cancelado_chofer',  'Cancelado por chófer',  41)
ON CONFLICT (codigo) DO NOTHING;


CREATE TABLE IF NOT EXISTS estados_viaje_historial (
    id                 BIGSERIAL    PRIMARY KEY,
    viaje_id           BIGINT       NOT NULL,
    estado_anterior_id BIGINT       REFERENCES estados_viaje(id),
    estado_nuevo_id    BIGINT       NOT NULL REFERENCES estados_viaje(id),
    usuario_id         BIGINT       REFERENCES usuarios(id),
    usuario_nombre     VARCHAR(100),
    usuario_rol        VARCHAR(20),
    notas              TEXT,
    gps_lat            NUMERIC(10,8),
    gps_lng            NUMERIC(11,8),
    fecha_cambio       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estados_viaje_hist_viaje
    ON estados_viaje_historial(viaje_id);
CREATE INDEX IF NOT EXISTS idx_estados_viaje_hist_fecha
    ON estados_viaje_historial(fecha_cambio);


-- -------------------------------------------------------------------------
-- 4. Estados de parada (catálogo + historial). Calcado de saycutrans
--    pero simplificado al MVP — chofocles arranca sin firma/foto.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS estados_parada (
    id          BIGSERIAL    PRIMARY KEY,
    codigo      VARCHAR(50)  NOT NULL,
    nombre      VARCHAR(100) NOT NULL,
    tipo        VARCHAR(20)  NOT NULL DEFAULT 'entrega',
    color       VARCHAR(20),
    orden       INTEGER      NOT NULL DEFAULT 0,
    es_final    BOOLEAN      NOT NULL DEFAULT FALSE,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tipo, codigo)
);

DROP TRIGGER IF EXISTS trg_estados_parada_upd ON estados_parada;
CREATE TRIGGER trg_estados_parada_upd BEFORE UPDATE ON estados_parada
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

INSERT INTO estados_parada (codigo, nombre, tipo, orden, es_final) VALUES
    ('pendiente',  'Pendiente',     'recogida', 10, FALSE),
    ('en_camino',  'En camino',     'recogida', 20, FALSE),
    ('llegado',    'Llegado',       'recogida', 30, FALSE),
    ('completado', 'Cargado',       'recogida', 40, TRUE),
    ('problema',   'Con problema',  'recogida', 50, FALSE),
    ('pendiente',  'Pendiente',     'entrega',  10, FALSE),
    ('en_camino',  'En camino',     'entrega',  20, FALSE),
    ('llegado',    'Llegado',       'entrega',  30, FALSE),
    ('completado', 'Descargado',    'entrega',  40, TRUE),
    ('problema',   'Con problema',  'entrega',  50, FALSE)
ON CONFLICT (tipo, codigo) DO NOTHING;


CREATE TABLE IF NOT EXISTS estados_parada_historial (
    id                 BIGSERIAL    PRIMARY KEY,
    parada_id          BIGINT       NOT NULL,
    estado_anterior_id BIGINT       REFERENCES estados_parada(id),
    estado_nuevo_id    BIGINT       NOT NULL REFERENCES estados_parada(id),
    usuario_id         BIGINT       REFERENCES usuarios(id),
    usuario_nombre     VARCHAR(100),
    notas              TEXT,
    gps_lat            NUMERIC(10,8),
    gps_lng            NUMERIC(11,8),
    fecha_cambio       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estados_parada_hist_parada
    ON estados_parada_historial(parada_id);
CREATE INDEX IF NOT EXISTS idx_estados_parada_hist_fecha
    ON estados_parada_historial(fecha_cambio);


-- -------------------------------------------------------------------------
-- 5. Documentos originales (PDF / DOCX / imagen) recibidos por email.
--    Cada documento puede generar 0..N viajes (raro pero posible).
--    Cada viaje viene de exactamente 1 documento (o NULL si manual).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documentos (
    id                  BIGSERIAL    PRIMARY KEY,
    chofer_id           BIGINT       NOT NULL REFERENCES usuarios(id),
    email_message_id    VARCHAR(255),
    email_remitente     VARCHAR(255),
    email_asunto        VARCHAR(500),
    email_fecha         TIMESTAMPTZ,
    archivo_ruta        TEXT         NOT NULL,
    archivo_nombre      VARCHAR(255) NOT NULL,
    archivo_mime        VARCHAR(100),
    archivo_tamaño      BIGINT,
    archivo_hash_sha256 VARCHAR(64),
    texto_extraido      TEXT,
    procesado           BOOLEAN      NOT NULL DEFAULT FALSE,
    procesado_at        TIMESTAMPTZ,
    error_proceso       TEXT,
    plantilla_id        BIGINT,      -- id en saycu_admin.chofocles_plantillas (sin FK cross-DB)
    operador_cif        VARCHAR(20), -- referencia natural al operador en saycu_admin
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_chofer
    ON documentos(chofer_id);
CREATE INDEX IF NOT EXISTS idx_documentos_no_procesado
    ON documentos(id) WHERE procesado = FALSE;
CREATE INDEX IF NOT EXISTS idx_documentos_email_msgid
    ON documentos(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_hash
    ON documentos(archivo_hash_sha256) WHERE archivo_hash_sha256 IS NOT NULL;

DROP TRIGGER IF EXISTS trg_documentos_upd ON documentos;
CREATE TRIGGER trg_documentos_upd BEFORE UPDATE ON documentos
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 6. Viajes (cabecera). Calcado de saycutrans + chofocles-específicos.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS viajes (
    id                          BIGSERIAL    PRIMARY KEY,
    referencia_externa          VARCHAR(100) NOT NULL UNIQUE,
    referencia_externa_original VARCHAR(100),
    numero_viaje                VARCHAR(100),
    fecha                       DATE         NOT NULL,
    estado_id                   BIGINT       REFERENCES estados_viaje(id),
    conductor_id                BIGINT       REFERENCES usuarios(id),
    tractora_id                 BIGINT       REFERENCES vehiculos(id),
    plataforma_id               BIGINT       REFERENCES vehiculos(id),
    visible_chofer              BOOLEAN      NOT NULL DEFAULT FALSE,
    estado_aceptacion           VARCHAR(20),
    notas_conductor             TEXT,
    cliente_nombre              VARCHAR(255),
    mercancia_descripcion       TEXT,
    origen_municipio            VARCHAR(120),
    origen_direccion1           VARCHAR(255),
    destino_municipio           VARCHAR(120),
    destino_direccion1          VARCHAR(255),
    mercancias_peligrosas       BOOLEAN,
    adr                         BOOLEAN,
    notas                       TEXT,
    notas_albaran               TEXT,
    fecha_aceptacion            TIMESTAMPTZ,
    fecha_completado            TIMESTAMPTZ,
    motivo_rechazo              TEXT,
    -- chofocles-específicos
    precio                      NUMERIC(10,2),
    operador_cif                VARCHAR(20),     -- ref. natural a saycu_admin.chofocles_operadores_logisticos
    documento_id                BIGINT           REFERENCES documentos(id),
    plantilla_id                BIGINT,          -- id en saycu_admin.chofocles_plantillas (sin FK cross-DB)
    -- soft delete + auditoría
    deleted_at                  TIMESTAMPTZ,
    deleted_by                  INTEGER,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON viajes(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_viajes_estado_id ON viajes(estado_id);
CREATE INDEX IF NOT EXISTS idx_viajes_conductor_id ON viajes(conductor_id);
CREATE INDEX IF NOT EXISTS idx_viajes_not_deleted
    ON viajes(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_viajes_deleted
    ON viajes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viajes_documento_id
    ON viajes(documento_id) WHERE documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viajes_operador_cif
    ON viajes(operador_cif) WHERE operador_cif IS NOT NULL;

DROP TRIGGER IF EXISTS trg_viajes_upd ON viajes;
CREATE TRIGGER trg_viajes_upd BEFORE UPDATE ON viajes
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 7. Paradas del viaje (carga / descarga). Calcado de saycutrans.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS viajes_paradas (
    id                  BIGSERIAL    PRIMARY KEY,
    viaje_id            BIGINT       NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
    referencia          VARCHAR(100),
    referencia_original VARCHAR(100),
    pedido_referencia   VARCHAR(100),
    orden               INTEGER      NOT NULL,
    tipo                VARCHAR(20)  NOT NULL,    -- 'recogida' | 'entrega'
    estado_id           BIGINT       REFERENCES estados_parada(id),
    nombre_cliente      VARCHAR(255),
    contacto            VARCHAR(120),
    telefono            VARCHAR(60),
    direccion1          VARCHAR(255),
    direccion2          VARCHAR(255),
    codigo_postal       VARCHAR(20),
    poblacion           VARCHAR(120),
    provincia           VARCHAR(120),
    pais                VARCHAR(120),
    latitud             NUMERIC(10,8),
    longitud            NUMERIC(11,8),
    hora_desde          VARCHAR(10),
    hora_hasta          VARCHAR(10),
    instrucciones       TEXT,
    mercancia           TEXT,
    bultos              INTEGER,
    peso                NUMERIC(10,2),
    fecha_llegada       TIMESTAMPTZ,
    fecha_completado    TIMESTAMPTZ,
    notas_entrega       TEXT,
    problema_descripcion TEXT,
    problema_resultado  TEXT,
    deleted_at          TIMESTAMPTZ,
    deleted_by          INTEGER,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viajes_paradas_viaje_id
    ON viajes_paradas(viaje_id);
CREATE INDEX IF NOT EXISTS idx_viajes_paradas_estado_id
    ON viajes_paradas(estado_id);
CREATE INDEX IF NOT EXISTS idx_viajes_paradas_not_deleted
    ON viajes_paradas(id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_viajes_paradas_upd ON viajes_paradas;
CREATE TRIGGER trg_viajes_paradas_upd BEFORE UPDATE ON viajes_paradas
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 8. Incidencias. Calcado de saycutrans, con `origen` (voz/manual) añadido
--    para distinguir las dictadas por voz de las introducidas por la app.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS incidencias (
    id              BIGSERIAL    PRIMARY KEY,
    viaje_id        BIGINT       NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
    conductor_id    BIGINT       NOT NULL REFERENCES usuarios(id),
    tipo            VARCHAR(50)  NOT NULL,
    descripcion     TEXT,
    lat             NUMERIC(10,8),
    lng             NUMERIC(11,8),
    resuelta        BOOLEAN      NOT NULL DEFAULT FALSE,
    resolucion      TEXT,
    origen          VARCHAR(20)  NOT NULL DEFAULT 'manual'
                    CHECK (origen IN ('voz', 'manual', 'sistema')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidencias_viaje_id
    ON incidencias(viaje_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_conductor_id
    ON incidencias(conductor_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_created
    ON incidencias(created_at DESC);

DROP TRIGGER IF EXISTS trg_incidencias_upd ON incidencias;
CREATE TRIGGER trg_incidencias_upd BEFORE UPDATE ON incidencias
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


COMMIT;
