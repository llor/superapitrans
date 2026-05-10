-- =========================================================================
-- chofocles — Migración 0004 — Plantillas en JSON + ampliaciones para IA
-- =========================================================================
-- BBDD destino: saycu_admin
-- Idempotente.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Plantillas en formato JSON (compatible con el extractor del ingestor).
--    Permite que la IA genere plantillas nuevas sin tocar el esquema
--    relacional de campos. Convive con `chofocles_plantillas` (relacional).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_plantillas_json (
    id              BIGSERIAL    PRIMARY KEY,
    -- Identificación de la procedencia:
    -- - operador_cif si conocemos el CIF (preferente)
    -- - operador_email_dominio si solo tenemos el dominio del remitente
    -- - operador_nombre como respaldo legible
    operador_cif            VARCHAR(20),
    operador_email_dominio  VARCHAR(200),
    operador_nombre         VARCHAR(200),

    -- Versión incremental por procedencia (la última activa gana)
    version         INTEGER      NOT NULL DEFAULT 1,
    activa          BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Definición de la plantilla (compatible con el formato YAML del
    -- ingestor existente: { match: { all/any }, fields: { campo: spec } }).
    definicion      JSONB        NOT NULL,

    -- Auditoría de origen
    creada_por_ia   BOOLEAN      NOT NULL DEFAULT FALSE,
    notas           TEXT,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chofocles_pjson_cif
    ON chofocles_plantillas_json (operador_cif) WHERE activa;
CREATE INDEX IF NOT EXISTS idx_chofocles_pjson_dominio
    ON chofocles_plantillas_json (operador_email_dominio) WHERE activa;
CREATE INDEX IF NOT EXISTS idx_chofocles_pjson_activa
    ON chofocles_plantillas_json (activa) WHERE activa;

DROP TRIGGER IF EXISTS trg_chofocles_pjson_upd ON chofocles_plantillas_json;
CREATE TRIGGER trg_chofocles_pjson_upd BEFORE UPDATE ON chofocles_plantillas_json
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 2. Config por operador (timeout de aceptación, modo albarán/factura).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_operadores_config (
    operador_id           BIGINT       PRIMARY KEY
                          REFERENCES chofocles_operadores_logisticos(id) ON DELETE CASCADE,

    -- Tiempo (minutos) que damos al chofer para aceptar/rechazar antes de
    -- considerar el pedido caducado. Configurable por operador porque cada
    -- proveedor tiene su ritmo.
    timeout_aceptacion_min INTEGER     NOT NULL DEFAULT 30,

    -- Modo de emisión: 'albaran' o 'factura'. Influye en cómo se generan
    -- las facturas internas y qué valida la IA.
    modo                  VARCHAR(20)  NOT NULL DEFAULT 'albaran'
                          CHECK (modo IN ('albaran', 'factura')),

    notas                 TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_chofocles_opcfg_upd ON chofocles_operadores_config;
CREATE TRIGGER trg_chofocles_opcfg_upd BEFORE UPDATE ON chofocles_operadores_config
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 3. Relación chofer ↔ procedencia (operador). Por chofer (no global).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_chofer_operador (
    -- chofer = (empresa_codigo + chofer_id_en_tenant). Sin FK cross-DB.
    empresa_codigo  VARCHAR(80)  NOT NULL,
    chofer_id       BIGINT       NOT NULL,
    operador_id     BIGINT       NOT NULL
                    REFERENCES chofocles_operadores_logisticos(id) ON DELETE CASCADE,
    primer_email_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (empresa_codigo, chofer_id, operador_id)
);

CREATE INDEX IF NOT EXISTS idx_chofocles_co_operador
    ON chofocles_chofer_operador (operador_id);


COMMIT;
