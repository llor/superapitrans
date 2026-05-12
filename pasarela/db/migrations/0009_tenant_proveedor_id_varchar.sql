-- =========================================================================
-- pasarela — Migración 0009 — proveedor_publication_id y proveedor_albaran_id a VARCHAR
-- =========================================================================
-- BBDD destino: TODAS las saycu_pasarela_<CODIGO> (idempotente).
--
-- Motivo: Satelles usa IDs numéricos (BIGINT cabía), pero PCS ValenciaportPCS
-- envía IDs alfanuméricos (ej. 'VPRT6136551210'). Se cambia el tipo a VARCHAR
-- para soportar ambos. Los índices únicos
--   uniq_pedidos_proveedor_pub  (proveedor_codigo, proveedor_publication_id)
--   uniq_albaranes_proveedor_id (proveedor_codigo, proveedor_albaran_id)
-- se reconstruyen automáticamente con el ALTER COLUMN.
--
-- Aplicar a cada BBDD tenant: saycu_pasarela_demo, saycu_pasarela_gfe,
-- saycu_pasarela_jsr, saycu_pasarela_test, saycu_pasarela_heip,
-- saycu_pasarela_prieto, etc.
-- =========================================================================

BEGIN;

ALTER TABLE pedidos
    ALTER COLUMN proveedor_publication_id TYPE VARCHAR(80)
    USING proveedor_publication_id::text;

ALTER TABLE albaranes
    ALTER COLUMN proveedor_albaran_id TYPE VARCHAR(80)
    USING proveedor_albaran_id::text;

COMMIT;
