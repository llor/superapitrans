-- =========================================================================
-- chofocles — Migración 0006 — Pasos por chofer + tokens push
-- =========================================================================
-- BBDD destino: saycu_chofocles_<CODIGO>
--
-- Añade:
--  - usuarios.pasos_activos (jsonb): interruptores de pasos del viaje que
--    el chofer activa/desactiva en su panel/app.
--  - usuarios.push_tokens (jsonb array): tokens FCM/APNS del chofer.
--    Permite varios dispositivos simultáneos. Cada elemento:
--    { token: "...", plataforma: "android"|"ios"|"web", registrado_at }.
-- =========================================================================

BEGIN;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS pasos_activos JSONB
        NOT NULL DEFAULT '{"aceptar":true,"rechazar":true,"en_camino":true,"llegado":true,"cargado":true,"descargado":true,"terminar":true,"cancelar":true}'::jsonb;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS push_tokens JSONB
        NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_usuarios_push_tokens
    ON usuarios USING gin(push_tokens) WHERE push_tokens != '[]'::jsonb;

COMMIT;
