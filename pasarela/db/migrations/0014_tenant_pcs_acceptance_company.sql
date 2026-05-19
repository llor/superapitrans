-- =========================================================================
-- pasarela — Migración 0014 — Terminal de devolución del contenedor vacío
-- =========================================================================
-- BBDD destino: TODAS las saycu_pasarela_<CODIGO> con servicio pasarela
-- y PCS Valencia activo (a 2026-05-19: saycu_pasarela_JSR). Idempotente.
--
-- Motivo: en los DUTs (Documento Unificado de Transporte) que recibimos del
-- PCS de Valencia, la información de la "Organización de Admisión del
-- contenedor vacío" — es decir, la TERMINAL donde el chofer debe devolver
-- el contenedor vacío al final del viaje — viene a nivel
-- <Containers><AcceptanceDetails><AcceptanceCompany>. Es un dato operativo
-- crítico para el chofer y no se persistía: hasta ahora `AcceptanceCompany`
-- solo se usaba como fallback de la parada de descarga (cuando no había
-- <LoadingUnloadingDetails>), por lo que en cualquier DUT con cliente
-- final declarado se perdía.
--
-- Cuando un DUT NO trae Orden de Entrega (caso reportado por el puerto en
-- el DUT TIBA26051800052093), `AcceptanceCompany` simplemente no aparece
-- en el XML y todas estas columnas quedan NULL — esa ausencia es la señal
-- "no se tiene esa info" que el panel mostrará al usuario.
--
-- Va en `pedidos_pcs_extra` (no en `pedidos`) porque es un dato específico
-- del PCS de Valencia y no aplica a Satelles ni a otros proveedores.
-- =========================================================================

BEGIN;

ALTER TABLE pedidos_pcs_extra
    ADD COLUMN IF NOT EXISTS terminal_devolucion_codigo        VARCHAR(20),   -- AcceptanceCompany/PCSCode
    ADD COLUMN IF NOT EXISTS terminal_devolucion_nombre        VARCHAR(200),  -- AcceptanceCompany/Name
    ADD COLUMN IF NOT EXISTS terminal_devolucion_cif           VARCHAR(30),   -- AcceptanceCompany/NationalIdentityNumber
    ADD COLUMN IF NOT EXISTS terminal_devolucion_direccion     VARCHAR(200),  -- AcceptanceCompany/StreetAddress
    ADD COLUMN IF NOT EXISTS terminal_devolucion_ciudad        VARCHAR(100),  -- AcceptanceCompany/City
    ADD COLUMN IF NOT EXISTS terminal_devolucion_codigo_postal VARCHAR(10),   -- AcceptanceCompany/PostalCode
    ADD COLUMN IF NOT EXISTS terminal_devolucion_unlocode      VARCHAR(20);   -- AcceptanceCompany/UNLOCODE

COMMIT;
