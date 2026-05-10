-- =========================================================================
-- pasarela — Migración 0007 — Tabla de logs de la API
-- =========================================================================
-- BBDD destino: saycu_admin (compartida).
-- Almacena un registro por cada petición HTTP procesada por pasarela_api,
-- para visualizarlo desde admin.saycusoft.es → /logs-pasarela.
--
-- empresa_id y key_id quedan NULL cuando la petición falla la autenticación
-- antes de poder identificar al cliente (ej. missing_bearer, invalid_key).
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pasarela_logs_api (
    id              BIGSERIAL    PRIMARY KEY,
    empresa_id      BIGINT       REFERENCES empresas(id) ON DELETE SET NULL,
    key_id          BIGINT       REFERENCES pasarela_clientes_keys(id) ON DELETE SET NULL,
    aplicacion      VARCHAR(100),                 -- copia desde la key (sobrevive si la key se borra)
    method          VARCHAR(10)  NOT NULL,
    endpoint        VARCHAR(500) NOT NULL,        -- ruta original (req.originalUrl)
    status_code     INTEGER      NOT NULL,
    error_code      VARCHAR(60),                  -- p.ej. missing_bearer, invalid_key, scope_required, no_encontrado
    ip_origen       VARCHAR(60),
    user_agent      VARCHAR(300),
    request_size    INTEGER,                      -- bytes leídos en req
    response_size   INTEGER,                      -- bytes en res (Content-Length)
    duracion_ms     INTEGER      NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pasarela_logs_created_at
    ON pasarela_logs_api (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pasarela_logs_empresa_created
    ON pasarela_logs_api (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pasarela_logs_status
    ON pasarela_logs_api (status_code);
CREATE INDEX IF NOT EXISTS idx_pasarela_logs_endpoint
    ON pasarela_logs_api (endpoint);
CREATE INDEX IF NOT EXISTS idx_pasarela_logs_ip
    ON pasarela_logs_api (ip_origen);

COMMIT;
