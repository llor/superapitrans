-- =========================================================================
-- chofocles — Migración 0005 — Reasignación por orden (multi-chofer)
-- =========================================================================
-- BBDD destino: saycu_chofocles_<CODIGO>
--
-- Si la empresa-tenant tiene más de un chofer, los pedidos pueden
-- reasignarse al siguiente chofer cuando el actual no acepta dentro del
-- timeout. El "jefe" (rol admin del tenant) gestiona el orden.
--
-- Idempotente.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Orden de reasignación de cada chofer dentro de la empresa.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_choferes_orden (
    usuario_id              BIGINT       PRIMARY KEY
                            REFERENCES usuarios(id) ON DELETE CASCADE,
    -- Orden ascendente: el chofer con orden=0 recibe primero. Cuando no
    -- acepta dentro de su timeout, el pedido pasa al siguiente.
    orden                   INTEGER      NOT NULL DEFAULT 100,

    -- Override del timeout del operador (NULL = usar el del operador).
    timeout_aceptacion_min  INTEGER,

    -- Vacaciones (rango). NULL = sin vacaciones programadas.
    vacaciones_inicio       DATE,
    vacaciones_fin          DATE,

    -- Días disponibles de la semana. JSON: {"1":true,...,"7":true} (1=lunes)
    -- NULL o todo true = siempre disponible.
    dias_disponibles        JSONB        NOT NULL DEFAULT '{"1":true,"2":true,"3":true,"4":true,"5":true,"6":true,"7":true}'::jsonb,

    activo                  BOOLEAN      NOT NULL DEFAULT TRUE,

    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chofocles_choferes_orden_orden
    ON chofocles_choferes_orden(orden) WHERE activo;

DROP TRIGGER IF EXISTS trg_chofocles_choferes_orden_upd ON chofocles_choferes_orden;
CREATE TRIGGER trg_chofocles_choferes_orden_upd
    BEFORE UPDATE ON chofocles_choferes_orden
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 2. Auditoría de reasignaciones (para depurar y para el panel del jefe).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofocles_reasignaciones (
    id              BIGSERIAL    PRIMARY KEY,
    viaje_id        BIGINT       NOT NULL REFERENCES viajes(id) ON DELETE CASCADE,
    chofer_anterior BIGINT       REFERENCES usuarios(id),
    chofer_nuevo    BIGINT       REFERENCES usuarios(id),
    motivo          VARCHAR(40)  NOT NULL
                    CHECK (motivo IN ('timeout', 'rechazo', 'manual', 'vacaciones', 'caducado')),
    notas           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chofocles_reasignaciones_viaje
    ON chofocles_reasignaciones(viaje_id);
CREATE INDEX IF NOT EXISTS idx_chofocles_reasignaciones_fecha
    ON chofocles_reasignaciones(created_at DESC);


COMMIT;
