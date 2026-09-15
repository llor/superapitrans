-- =========================================================================
-- pasarela — Migración 0018 — Ampliar matricula_tractor a VARCHAR(50)
-- =========================================================================
-- BBDD destino: saycu_pasarela_<CODIGO> (todas las de tenant).
--
-- matricula_tractor nació VARCHAR(20) en 0002_tenant pensada para una
-- matrícula de camión (TTCABE). El PCS de Valencia no siempre manda una
-- matrícula en <TruckPlateNumber>: APM Terminals Valencia (TTCV) envía ahí
-- su código interno de cita, más largo. Verificado en JSR el 2026-09-15:
-- los mensajes ReleaseConfirmationv2 VPRT6194731464, VPRT6194731490 y
-- VPRT6194731547 traen «2609150800CTTCVNRTZESCXQ» (24 caracteres). El
-- UPSERT fallaba con «value too long for type character varying(20)» y
-- hacía ROLLBACK: el mensaje no se guardaba, no se ackeaba al portal y
-- volvía a la cola ciclo tras ciclo.
--
-- 50 caracteres: el doble largo de lo observado y la misma medida que las
-- otras referencias de texto corto del proveedor (bl_numero, viaje_buque,
-- locator_release). Ampliar un VARCHAR no reescribe la tabla y es
-- idempotente (re-ejecutar con la columna ya a 50 no hace nada).
-- =========================================================================

BEGIN;

ALTER TABLE pedidos ALTER COLUMN matricula_tractor TYPE VARCHAR(50);

COMMENT ON COLUMN pedidos.matricula_tractor
    IS 'TTCABE · matrícula del tractor. En PCS Valencia llega de <TruckPlateNumber>, que algunas terminales usan para su código de cita. VARCHAR(50) desde la 0018.';

COMMIT;
