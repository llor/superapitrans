-- =========================================================================
-- pasarela — Migración 0015 — Número de expedición (customerShipment)
-- =========================================================================
-- BBDD destino: saycu_pasarela_<CODIGO> (todas las de tenant).
--
-- Satelles ha añadido el campo delivery.customerShipment a la API de
-- rutas finalizadas (comunicación de Novos Sistemas 2026-06-02).
-- Nutreco lo llama "número de expedición". Se persiste en la cabecera
-- del pedido como texto concatenado (varias entregas pueden tener
-- expediciones distintas dentro de la misma ruta).
-- =========================================================================

BEGIN;

ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS expedicion VARCHAR(200);

COMMENT ON COLUMN pedidos.expedicion
    IS 'Nº de expedición del cliente (delivery.customerShipment en Satelles). Concatenado con ; si hay varios distintos por ruta.';

COMMIT;
