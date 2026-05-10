-- =========================================================================
-- pasarela — Migración 0001 — Catálogo en saycu_admin
-- =========================================================================
-- BBDD destino: saycu_admin (compartida entre todos los productos Saycu).
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT.
-- Fecha:   2026-05-01
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 0. Añadir 'pasarela' al ENUM servicio_tipo (idempotente).
-- -------------------------------------------------------------------------

ALTER TYPE servicio_tipo ADD VALUE IF NOT EXISTS 'pasarela';

COMMIT;

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Catálogo de proveedores externos (Satelles, futuros).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pasarela_proveedores (
    id           BIGSERIAL    PRIMARY KEY,
    codigo       VARCHAR(40)  NOT NULL UNIQUE,
    nombre       VARCHAR(200) NOT NULL,
    host_base    VARCHAR(300) NOT NULL,
    api_version  VARCHAR(20),
    descripcion  TEXT,
    activo       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_pasarela_proveedores_upd ON pasarela_proveedores;
CREATE TRIGGER trg_pasarela_proveedores_upd
    BEFORE UPDATE ON pasarela_proveedores
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

INSERT INTO pasarela_proveedores (codigo, nombre, host_base, api_version, descripcion) VALUES
    ('satelles', 'Satelles ERPSYNC', 'https://novossistemas.satelles.es', '1.6.0',
     'Cola de rutas finalizadas + maestros editables. OAuth 2.0 client credentials. Scopes: satelles-erpsync:write, satelles-publications:finished-routes.')
ON CONFLICT (codigo) DO NOTHING;


-- -------------------------------------------------------------------------
-- 2. Credenciales por (empresa, proveedor). Cifradas AES-256-GCM por la
--    capa de aplicación con la clave PASARELA_SECRETS_KEY del .env.
--    Cada cliente Saycu trae sus propias credenciales del proveedor (no
--    globales).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pasarela_proveedores_credenciales (
    id              BIGSERIAL    PRIMARY KEY,
    empresa_id      BIGINT       NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    proveedor_id    BIGINT       NOT NULL REFERENCES pasarela_proveedores(id) ON DELETE CASCADE,
    entorno         VARCHAR(20)  NOT NULL DEFAULT 'prod' CHECK (entorno IN ('sandbox', 'prod')),
    -- Credenciales cifradas. Para Satelles: client_id, client_secret.
    -- El blob descifrado es JSON: { "client_id": "...", "client_secret": "...", "scopes": "..." }.
    credencial_cifrada TEXT      NOT NULL,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    ultima_sync_at  TIMESTAMPTZ,
    ultima_sync_ok  BOOLEAN,
    ultimo_error    TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (empresa_id, proveedor_id, entorno)
);

CREATE INDEX IF NOT EXISTS idx_pasarela_creds_empresa
    ON pasarela_proveedores_credenciales (empresa_id) WHERE activo;

DROP TRIGGER IF EXISTS trg_pasarela_creds_upd ON pasarela_proveedores_credenciales;
CREATE TRIGGER trg_pasarela_creds_upd
    BEFORE UPDATE ON pasarela_proveedores_credenciales
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 3. API keys de cliente (inbound). Granularidad: empresa-tenant +
--    aplicación. Una empresa puede tener N keys.
--    Almacenamos hash bcrypt, NO el plaintext.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pasarela_clientes_keys (
    id            BIGSERIAL    PRIMARY KEY,
    empresa_id    BIGINT       NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    aplicacion    VARCHAR(100) NOT NULL,
    -- prefijo identificable para mostrar en listados (ej. "pas_live_a3f7…")
    -- los últimos chars del prefijo + bcrypt del secreto entero.
    key_prefix    VARCHAR(40)  NOT NULL,
    key_hash      VARCHAR(120) NOT NULL,
    -- scopes permitidos para esta key. Array de texto, ej:
    -- ARRAY['datos.read','datos.write','utilidades.chofocles','utilidades.general']
    scopes        TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    expira_at     TIMESTAMPTZ,
    ultimo_uso_at TIMESTAMPTZ,
    notas         TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (empresa_id, aplicacion)
);

CREATE INDEX IF NOT EXISTS idx_pasarela_keys_prefix
    ON pasarela_clientes_keys (key_prefix) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_pasarela_keys_empresa
    ON pasarela_clientes_keys (empresa_id) WHERE activo;

DROP TRIGGER IF EXISTS trg_pasarela_keys_upd ON pasarela_clientes_keys;
CREATE TRIGGER trg_pasarela_keys_upd
    BEFORE UPDATE ON pasarela_clientes_keys
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


COMMIT;
