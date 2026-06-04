-- =========================================================================
-- pasarela — Migración 0016 — Km por viaje (Satelles trips.summary)
-- =========================================================================
-- BBDD destino: saycu_pasarela_<CODIGO> (tenant).
--
-- Satelles entrega en route.trips[].summary los km reales del viaje
-- desglosados en cargado / vacío / total. Los sumamos por todos los
-- trips de la ruta y los persistimos en la cabecera del pedido.
-- =========================================================================

BEGIN;

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS km_total   NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS km_vacio   NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS km_cargado NUMERIC(10,2);

COMMENT ON COLUMN pedidos.km_total   IS 'Suma distance de todos los trips de la ruta';
COMMENT ON COLUMN pedidos.km_vacio   IS 'Suma distanceEmpty de todos los trips';
COMMENT ON COLUMN pedidos.km_cargado IS 'Suma distanceLoaded de todos los trips';

COMMIT;
