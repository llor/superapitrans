-- =========================================================================
-- pasarela — Migración 0004 — Descriptor de campos por proveedor
-- =========================================================================
-- BBDD destino: saycu_admin.
--
-- Cada proveedor externo declara qué campos espera en sus credenciales
-- (ej. Satelles: client_id, client_secret, scopes; PCS Valencia:
--  user, pass, oauth_url, api_base). La UI de admin.saycusoft.es lee
-- este descriptor y pinta el formulario tipado, evitando que el usuario
-- tenga que adivinar los nombres técnicos.
--
-- Estructura del JSON:
--   [
--     {
--       "clave":   "client_id",          -- nombre técnico (key del JSON cifrado)
--       "label":   "Client ID",          -- etiqueta visible al usuario
--       "secreto": false,                -- true → input type="password"
--       "ayuda":   "El identificador..."  -- texto de ayuda opcional
--     },
--     ...
--   ]
--
-- Si campos_credenciales = [] (default), la UI cae al modo libre
-- (pares clave/valor introducidos a mano por el usuario).
-- =========================================================================

BEGIN;

ALTER TABLE pasarela_proveedores
    ADD COLUMN IF NOT EXISTS campos_credenciales JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Pre-seed para Satelles (OAuth 2.0 client credentials, scopes documentados).
UPDATE pasarela_proveedores
   SET campos_credenciales = '[
        {"clave":"client_id",     "label":"Client ID",     "secreto":false, "ayuda":"Identificador OAuth 2.0 entregado por el integrador."},
        {"clave":"client_secret", "label":"Client Secret", "secreto":true,  "ayuda":"Secreto OAuth 2.0 entregado por el integrador. No se mostrará tras guardar."},
        {"clave":"scopes",        "label":"Scopes",        "secreto":false, "ayuda":"Lista separada por espacios. Por defecto: satelles-erpsync:write satelles-publications:finished-routes"}
       ]'::jsonb,
       updated_at = NOW()
 WHERE codigo = 'satelles'
   AND (campos_credenciales IS NULL OR campos_credenciales = '[]'::jsonb);

COMMIT;
