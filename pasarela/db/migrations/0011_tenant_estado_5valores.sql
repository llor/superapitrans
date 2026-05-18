-- 0011_tenant_estado_5valores.sql
-- Amplía pedidos.estado de 2 valores (PENDIENTE, PROCESADO) a 5
-- (PENDIENTE, LEIDO, ACEPTADO, INICIADO, TERMINADO).
--
-- ORDEN IMPORTANTE: quitar la constraint vieja ANTES de migrar valores,
-- porque PROCESADO->TERMINADO violaría la check antigua que solo admite
-- PENDIENTE/PROCESADO.
-- Idempotente: se puede ejecutar más de una vez.

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
UPDATE pedidos SET estado = 'TERMINADO' WHERE estado = 'PROCESADO';
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('PENDIENTE', 'LEIDO', 'ACEPTADO', 'INICIADO', 'TERMINADO'));
