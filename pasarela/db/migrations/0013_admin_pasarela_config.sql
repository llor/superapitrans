-- 0013_admin_pasarela_config.sql
-- Tabla key/value para la configuración global del pasarela_api gestionable
-- desde la web admin (sin tener que editar .env ni redesplegar). De momento
-- almacena `cron_expr` (frecuencia del cron global de syncs); más adelante
-- se podrán añadir más claves.
--
-- Aplica a saycu_admin. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS pasarela_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pasarela_config (key, value) VALUES
  ('cron_expr', '"* * * * *"'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
