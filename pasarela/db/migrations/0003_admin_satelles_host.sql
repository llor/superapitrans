-- =========================================================================
-- pasarela — Migración 0003 — Corrección host_base Satelles
-- =========================================================================
-- BBDD destino: saycu_admin.
--
-- En 0001_admin se registró Satelles con host_base
-- 'https://novossistemas.satelles.es' (instancia del integrador). El
-- host operativo del cliente Ecotrans es 'https://ecotrans.satelles.es'.
--
-- Comprobado vía OAuth + endpoints maestros (drivers, operators) el
-- 2026-05-05 con el client_id facilitado por Novossistemas.
-- =========================================================================

BEGIN;

UPDATE pasarela_proveedores
   SET host_base = 'https://ecotrans.satelles.es',
       updated_at = NOW()
 WHERE codigo = 'satelles';

COMMIT;
