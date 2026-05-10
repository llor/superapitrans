-- =========================================================================
-- chofocles — Migración 0002 — Esquema del tenant
-- =========================================================================
-- BBDD destino: saycu_chofocles_<CODIGO>  (una BD dedicada por empresa).
-- Aplica a CUALQUIER tenant DB de chofocles. El backend la usa para
-- auto-provisionar nuevos tenants (regla AUTO-PROVISIONING de saycu).
-- Idempotente.
-- Fecha:   2026-04-30
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 0. Función trigger_updated_at en este tenant.
--    No referenciamos la de saycu_admin porque es otra BD.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trigger_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------------------------
-- 1. Catálogo de roles (mismo patrón que saycutrans).
--    En MVP solo necesitamos 'admin' (oficina de la empresa) y 'chofer'.
--    Más roles ('operador', etc.) se añaden cuando aparezcan.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    id          BIGSERIAL    PRIMARY KEY,
    codigo      VARCHAR(50)  NOT NULL UNIQUE,
    nombre      VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_roles_upd ON roles;
CREATE TRIGGER trg_roles_upd BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

INSERT INTO roles (codigo, nombre) VALUES
    ('admin',  'Administrador'),
    ('chofer', 'Chofer')
ON CONFLICT (codigo) DO NOTHING;


-- -------------------------------------------------------------------------
-- 2. Usuarios (admin de la empresa + choferes).
--    Estructura calcada de saycutrans, sin los campos que no aplican
--    en chofocles (vehiculo_id, codigo_externo, codigo_externo_original).
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usuarios (
    id                      BIGSERIAL    PRIMARY KEY,
    rol_id                  BIGINT       NOT NULL REFERENCES roles(id),
    login                   VARCHAR(100) NOT NULL UNIQUE,
    email                   VARCHAR(255),
    password_hash           VARCHAR(255) NOT NULL,
    nombre                  VARCHAR(100) NOT NULL,
    apellidos               VARCHAR(150),
    telefono                VARCHAR(50),
    movil                   VARCHAR(50),
    dni                     VARCHAR(20),
    activo                  BOOLEAN      NOT NULL DEFAULT TRUE,
    refresh_token           TEXT,
    refresh_token_expires   TIMESTAMPTZ,
    ultimo_acceso           TIMESTAMPTZ,
    device_token            TEXT,
    app_version             VARCHAR(50),
    app_session_id          UUID,
    app_session_device_id   VARCHAR(100),
    permisos                JSONB        NOT NULL DEFAULT '{}'::jsonb,
    deleted_at              TIMESTAMPTZ,
    deleted_by              INTEGER,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_activo
    ON usuarios(activo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_usuarios_not_deleted
    ON usuarios(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_deleted
    ON usuarios(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_dni_not_deleted
    ON usuarios(dni) WHERE deleted_at IS NULL AND dni IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_rol_id ON usuarios(rol_id);

DROP TRIGGER IF EXISTS trg_usuarios_upd ON usuarios;
CREATE TRIGGER trg_usuarios_upd BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


-- -------------------------------------------------------------------------
-- 3. Buzones de los choferes (1:1 con usuario de rol 'chofer').
--    Tabla separada para no mezclar credenciales SMTP/IMAP con datos
--    de identidad y para que solo los choferes (no los admins) tengan
--    fila aquí.
--
--    SEGURIDAD: imap_password_enc / smtp_password_enc se guardan
--    cifradas por la aplicación (clave del proyecto en .env) antes
--    del INSERT. La columna en BBDD es TEXT plano cifrado.
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chofer_buzones (
    id                  BIGSERIAL    PRIMARY KEY,
    usuario_id          BIGINT       NOT NULL
                        REFERENCES usuarios(id) ON DELETE CASCADE,
    email_buzon         VARCHAR(255) NOT NULL,
    -- IMAP (entrada)
    imap_host           VARCHAR(200) NOT NULL,
    imap_port           INTEGER      NOT NULL DEFAULT 993,
    imap_user           VARCHAR(255) NOT NULL,
    imap_password_enc   TEXT         NOT NULL,
    imap_ssl            BOOLEAN      NOT NULL DEFAULT TRUE,
    imap_carpeta        VARCHAR(100) NOT NULL DEFAULT 'INBOX',
    -- SMTP (salida — para futuras respuestas / albaranes)
    smtp_host           VARCHAR(200) NOT NULL,
    smtp_port           INTEGER      NOT NULL DEFAULT 587,
    smtp_user           VARCHAR(255) NOT NULL,
    smtp_password_enc   TEXT         NOT NULL,
    smtp_ssl            BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Estado del polling
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    last_poll_at        TIMESTAMPTZ,
    last_poll_error     TEXT,
    last_uid_seen       BIGINT,           -- último UID IMAP procesado
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_chofer_buzones_activo
    ON chofer_buzones(activo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_chofer_buzones_usuario
    ON chofer_buzones(usuario_id);

DROP TRIGGER IF EXISTS trg_chofer_buzones_upd ON chofer_buzones;
CREATE TRIGGER trg_chofer_buzones_upd BEFORE UPDATE ON chofer_buzones
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();


COMMIT;
