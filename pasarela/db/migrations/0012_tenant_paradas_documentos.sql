-- 0012_tenant_paradas_documentos.sql
-- Columna JSONB en paradas para guardar los documentos que el chofer
-- adjunta en Satelles (route.destinations[].documents). Vienen en el
-- payload de /puba/routes/finished y no por un endpoint aparte
-- (probado contra ecotrans.satelles.es 2026-05-18: /api/erpsync/routes/
-- no está expuesto). Se persiste durante el sync.
--
-- Estructura esperada (a confirmar cuando GFE empiece a subir):
-- [
--   { "id": "...", "url": "...", "name": "albaran.pdf",
--     "contentType": "application/pdf", "uploadedAt": "..." },
--   ...
-- ]
--
-- Idempotente.

ALTER TABLE paradas
  ADD COLUMN IF NOT EXISTS documentos JSONB NOT NULL DEFAULT '[]'::jsonb;
