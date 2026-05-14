-- =========================================================================
-- pasarela — Migración 0010 — Campos extra del PCS Valencia
-- =========================================================================
-- BBDD destino: TODAS las saycu_pasarela_<CODIGO> (idempotente).
--
-- Motivo: el XML del PCS de Valencia trae datos relevantes (matrícula del
-- contenedor, BL, expediente del transitario, naviera, buque, puertos,
-- detalle del contenedor, mercancía, precinto, aduanas) que hasta ahora se
-- descartaban porque no había hueco en el modelo canónico. Se añaden los
-- campos transversales a `pedidos` (los que también tienen sentido para
-- Satelles o cualquier otro proveedor en el futuro) y se crea una tabla
-- 1:1 `pedidos_pcs_extra` para el detalle marítimo específico del puerto.
--
-- Todas las columnas son NULLABLE: para Satelles se quedan vacías.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Campos transversales nuevos en `pedidos`
-- -------------------------------------------------------------------------

ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS matricula_contenedor   VARCHAR(20),    -- ContainerDetails/PlateNumber (BOLU5600867)
    ADD COLUMN IF NOT EXISTS bl_numero              VARCHAR(50),    -- BLNumber (Bill of Lading)
    ADD COLUMN IF NOT EXISTS expediente_transitario VARCHAR(50),    -- ForwarderFileNumber
    ADD COLUMN IF NOT EXISTS operacion_tipo         VARCHAR(20),    -- IMPORT / EXPORT
    ADD COLUMN IF NOT EXISTS naviera_codigo         VARCHAR(20),    -- OceanCarrier/SCAC o ContainerLine/Code
    ADD COLUMN IF NOT EXISTS naviera_nombre         VARCHAR(200),   -- OceanCarrier/Name o ContainerLine/Name
    ADD COLUMN IF NOT EXISTS buque_nombre           VARCHAR(200),   -- UnloadingVesselDetails/VesselName
    ADD COLUMN IF NOT EXISTS viaje_buque            VARCHAR(50);    -- UnloadingVesselDetails/VoyageNumber

CREATE INDEX IF NOT EXISTS idx_pedidos_matricula_contenedor
    ON pedidos (matricula_contenedor)
    WHERE matricula_contenedor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_bl_numero
    ON pedidos (bl_numero)
    WHERE bl_numero IS NOT NULL;


-- -------------------------------------------------------------------------
-- 2. Tabla anexa `pedidos_pcs_extra` — detalle marítimo PCS (1:1)
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pedidos_pcs_extra (
    pedido_id                          BIGINT       PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,

    -- Operación
    transporte_tipo                    VARCHAR(40),                -- CARRIER_HAULAGE, MERCHANT_HAULAGE...
    transporte_ferroviario             BOOLEAN,                    -- IsRailTransport

    -- Localizadores y referencias
    locator_release                    VARCHAR(50),                -- ReleaseDetails/References/LocatorCode
    locator_acceptance                 VARCHAR(50),                -- AcceptanceDetails/References/LocatorCode
    berth_request                      VARCHAR(50),                -- BerthRequestNumber

    -- Puertos
    puerto_carga_codigo                VARCHAR(20),                -- Ports[Function=LOADING]/UNLOCODE
    puerto_carga_nombre                VARCHAR(200),               -- Ports[Function=LOADING]/Name
    puerto_origen_codigo               VARCHAR(20),                -- Ports[Function=ORIGIN]/UNLOCODE
    puerto_origen_nombre               VARCHAR(200),               -- Ports[Function=ORIGIN]/Name

    -- Contenedor (detalle marítimo)
    contenedor_iso_tipo                VARCHAR(20),                -- ContainerDetails/ISOType
    contenedor_iso_descripcion         VARCHAR(200),               -- ContainerDetails/ISODescription
    contenedor_full_state              VARCHAR(20),                -- FullOrEmptyState/FullContainerDetails (FCL/LCL)
    contenedor_estado_release          VARCHAR(20),                -- FullOrEmptyState/Release (FULL/EMPTY)
    contenedor_estado_acceptance       VARCHAR(20),                -- FullOrEmptyState/Acceptance (FULL/EMPTY)
    contenedor_descargado              BOOLEAN,                    -- ContainerUnloaded
    contenedor_tara                    NUMERIC(10,2),              -- Weights/Tare
    contenedor_peso_bruto              NUMERIC(10,2),              -- Weights/Gross

    -- Aduanas y precinto
    customs_status                     VARCHAR(20),                -- CustomsStatus
    precinto_numero                    VARCHAR(50),                -- Seals/Value
    precinto_proveedor                 VARCHAR(40),                -- Seals/Provider

    -- Mercancía
    mercancia_descripcion              VARCHAR(500),               -- Goods/Description
    mercancia_peso_bruto               NUMERIC(12,2),              -- Goods/GrossWeight
    mercancia_bultos_numero            INTEGER,                    -- Goods/NumberOfPackages
    mercancia_bultos_tipo_codigo       VARCHAR(10),                -- Goods/TypeOfPackages/Code
    mercancia_bultos_tipo_descripcion  VARCHAR(100),               -- Goods/TypeOfPackages/Description

    created_at                         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_pedidos_pcs_extra_upd ON pedidos_pcs_extra;
CREATE TRIGGER trg_pedidos_pcs_extra_upd BEFORE UPDATE ON pedidos_pcs_extra
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 3. Owner: la pasarela conecta como `saycutrans`; mantener owner coherente
-- -------------------------------------------------------------------------

ALTER TABLE pedidos_pcs_extra OWNER TO saycutrans;


COMMIT;
