-- =========================================================================
-- pasarela — Migración 0002 — Tablas canónicas por tenant
-- =========================================================================
-- BBDD destino: saycu_pasarela_<CODIGO> (una por empresa-tenant).
-- 4 tablas relacionadas, ninguna excluyente:
--   pedidos       (cabecera)
--   albaranes     (1 pedido → 0..N)
--   facturas      (1 pedido → 0..N)
--   paradas       (1 pedido → 0..N; opcionalmente vinculadas a un albarán)
--
-- Los nombres son nuestros (sin prefijo TT). El consumidor (módulo
-- transporte de a3ERP) lee los campos que correspondan a sus columnas TT*.
-- =========================================================================

BEGIN;

-- Función trigger updated_at compartida por todas las tablas del tenant.
CREATE OR REPLACE FUNCTION trigger_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------------
-- 1. pedidos — cabecera
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos (
    id                          BIGSERIAL    PRIMARY KEY,

    -- Identificación
    id_viaje                    BIGINT,                     -- TTIDVI · route.id en Satelles
    id_ruta_externa             VARCHAR(100),               -- TTIDRU · id que ponga el operador / remitente

    -- Cliente Saycu (tenant)
    cliente_codigo              VARCHAR(50),                -- TTCLIE (cod) · empresa-tenant Saycu
    cliente_cif                 VARCHAR(20),                -- TTCLIE (cif)

    -- Delegación
    delegacion_codigo           VARCHAR(20),                -- TTDELE

    -- Emails (sin prefijo TT, varios por flexibilidad)
    email_chofer                VARCHAR(200),               -- TTCORR (parte 1)
    email_remitente             VARCHAR(200),               -- TTCORR (parte 2) · sender del PDF/email
    email_otros                 TEXT,                       -- json o csv libre, futura ampliación

    -- Choferes
    chofer_principal_codigo     VARCHAR(50),                -- TTCHOP (cod)
    chofer_principal_cif        VARCHAR(20),                -- TTCHOP (cif)
    chofer_secundario_codigo    VARCHAR(50),                -- TTCHOS (cod)
    chofer_secundario_cif       VARCHAR(20),                -- TTCHOS (cif)

    -- Tercero (proveedor / operador logístico que paga el viaje)
    tercero_codigo              VARCHAR(50),                -- TTTERC (cod)
    tercero_cif                 VARCHAR(20),                -- TTTERC (cif)

    -- Vehículo
    matricula_tractor           VARCHAR(20),                -- TTCABE
    matricula_remolque          VARCHAR(20),                -- TTPLAT

    -- Documentos
    numero_pedido               VARCHAR(100),               -- TTNPEDI
    albaranes_concatenados      VARCHAR(500),               -- TTNALB · resumen rápido (los albaranes detallados van en su tabla)

    -- Tipo y estado
    tipo                        VARCHAR(20)  NOT NULL DEFAULT 'PEDIDO'
                                CHECK (tipo IN ('PEDIDO', 'ALBARAN')),                       -- TTTIPO
    estado                      VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
                                CHECK (estado IN ('PENDIENTE', 'PROCESADO')),                -- TTESTA

    -- Fechas
    fecha_plan                  DATE,                       -- TTFECH (plan) · route.planDate en Satelles
    fecha_reparto               DATE,                       -- TTFECH (reparto) · delivery.deliveryDate

    -- Origen del dato (qué vía nos lo trajo)
    origen                      VARCHAR(40)  NOT NULL DEFAULT 'desconocido'
                                CHECK (origen IN ('cliente_externo', 'proveedor_externo',
                                                  'chofocles_email', 'manual_admin', 'desconocido')),
    proveedor_codigo            VARCHAR(40),                -- ej. 'satelles' (cuando origen = 'proveedor_externo')

    -- Idempotencia: clave única por publicación del proveedor
    proveedor_publication_id    BIGINT,                     -- ej. publicationId de Satelles

    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pedidos_proveedor_pub
    ON pedidos (proveedor_codigo, proveedor_publication_id)
    WHERE proveedor_publication_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_estado_fecha
    ON pedidos (estado, fecha_reparto);
CREATE INDEX IF NOT EXISTS idx_pedidos_tercero
    ON pedidos (tercero_cif);

DROP TRIGGER IF EXISTS trg_pedidos_upd ON pedidos;
CREATE TRIGGER trg_pedidos_upd BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 2. albaranes — 1 pedido → 0..N
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS albaranes (
    id                  BIGSERIAL    PRIMARY KEY,
    pedido_id           BIGINT       NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    numero              VARCHAR(100) NOT NULL,
    fecha               DATE,
    lugar_carga_codigo  VARCHAR(100),
    unidad_medida       VARCHAR(20),
    -- Identificador en el proveedor (idempotencia)
    proveedor_codigo    VARCHAR(40),
    proveedor_albaran_id BIGINT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_albaranes_pedido ON albaranes (pedido_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_albaranes_proveedor_id
    ON albaranes (proveedor_codigo, proveedor_albaran_id)
    WHERE proveedor_albaran_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_albaranes_upd ON albaranes;
CREATE TRIGGER trg_albaranes_upd BEFORE UPDATE ON albaranes
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 3. facturas — 1 pedido → 0..N (vacía hasta que llegue info de facturas)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS facturas (
    id          BIGSERIAL    PRIMARY KEY,
    pedido_id   BIGINT       NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    numero      VARCHAR(100) NOT NULL,
    fecha       DATE,
    base_imponible NUMERIC(14,4),
    iva         NUMERIC(5,2),
    total       NUMERIC(14,4),
    estado      VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facturas_pedido ON facturas (pedido_id);

DROP TRIGGER IF EXISTS trg_facturas_upd ON facturas;
CREATE TRIGGER trg_facturas_upd BEFORE UPDATE ON facturas
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 4. paradas — 1 pedido → 0..N. Opcionalmente vinculada a un albarán
--    cuando el documento lo indique claramente.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS paradas (
    id                  BIGSERIAL    PRIMARY KEY,
    pedido_id           BIGINT       NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    albaran_id          BIGINT       REFERENCES albaranes(id) ON DELETE SET NULL,

    -- Identificación
    reparto_id_externo  BIGINT,                              -- TTIDRE · delivery.id

    -- Tipo
    tipo                VARCHAR(20)  NOT NULL
                        CHECK (tipo IN ('CARGA', 'DESCARGA')),    -- TTTIPO (detalle)
    orden               VARCHAR(20)  NOT NULL
                        CHECK (orden IN ('ORIGEN', 'DESTINO')),   -- TTORDE
    secuencia           INTEGER,                              -- orden de la parada en la ruta

    -- Lugar
    tipo_lugar          VARCHAR(50),                          -- TTFABR · texto libre (FABRICA, GRANJA, ALMACEN, …)
    lugar_codigo        VARCHAR(100),
    lugar_nombre        VARCHAR(200),
    direccion1          VARCHAR(200),                         -- TTDIR1
    direccion2          VARCHAR(200),                         -- TTDIR2
    codigo_postal       VARCHAR(10),                          -- TTCOPO
    municipio           VARCHAR(100),                         -- TTMUNI
    provincia           VARCHAR(100),                         -- TTPROV
    pais                VARCHAR(50),                          -- TTPAIS
    telefono            VARCHAR(30),                          -- TTTELE
    persona_contacto    VARCHAR(100),                         -- TTPCON
    latitud             NUMERIC(10,7),
    longitud            NUMERIC(10,7),

    -- Mercancía
    producto            VARCHAR(200),                         -- TTMERC
    cantidad            NUMERIC(14,3),                        -- TTCANT
    unidad_medida       VARCHAR(20),

    -- Tiempos
    llegada_prevista    TIMESTAMPTZ,
    salida_prevista     TIMESTAMPTZ,
    llegada_real        TIMESTAMPTZ,
    salida_real         TIMESTAMPTZ,

    -- Distancia del tramo hasta esta parada (no acumulada)
    kms_tramo           NUMERIC(10,2),                        -- TTKMRE

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paradas_pedido     ON paradas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_paradas_albaran    ON paradas (albaran_id);
CREATE INDEX IF NOT EXISTS idx_paradas_pedido_seq ON paradas (pedido_id, secuencia);

DROP TRIGGER IF EXISTS trg_paradas_upd ON paradas;
CREATE TRIGGER trg_paradas_upd BEFORE UPDATE ON paradas
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- Owners: la pasarela conecta como `saycutrans` (DB_USER); si esta
-- migración se ejecuta como `postgres`, los objetos quedan con owner
-- postgres y la pasarela falla con "permission denied". Garantizamos owner
-- saycutrans de forma idempotente.
-- -------------------------------------------------------------------------

ALTER TABLE pedidos    OWNER TO saycutrans;
ALTER TABLE albaranes  OWNER TO saycutrans;
ALTER TABLE facturas   OWNER TO saycutrans;
ALTER TABLE paradas    OWNER TO saycutrans;

ALTER SEQUENCE pedidos_id_seq    OWNER TO saycutrans;
ALTER SEQUENCE albaranes_id_seq  OWNER TO saycutrans;
ALTER SEQUENCE facturas_id_seq   OWNER TO saycutrans;
ALTER SEQUENCE paradas_id_seq    OWNER TO saycutrans;

ALTER FUNCTION trigger_updated_at() OWNER TO saycutrans;


COMMIT;
