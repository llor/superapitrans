-- =========================================================================
-- pasarela — Migración 0017 — Ampliar numero_pedido a VARCHAR(500)
-- =========================================================================
-- BBDD destino: saycu_pasarela_<CODIGO> (todas las de tenant).
--
-- numero_pedido nació VARCHAR(100) en 0002_tenant. Es la concatenación con
-- ';' de TODAS las referencias de pedido de una ruta (TTNPEDI). En rutas
-- con muchas entregas (10-12 referencias de 10 dígitos) supera los 100
-- caracteres y el UPSERT fallaba con "value too long for type character
-- varying(100)", haciendo ROLLBACK: esos pedidos no se importaban y se
-- quedaban dando vueltas en la cola de Satelles ciclo tras ciclo, sin
-- avisar (el error se quedaba solo en el log del bucle de publicaciones).
-- Verificado en GFE el 2026-06-30: publicaciones 29757/29990/30491/32269
-- con numero_pedido de 109, 120, 120 y 131 caracteres.
--
-- Se iguala a albaranes_concatenados (VARCHAR(500)), que sigue el mismo
-- patrón de concatenación y crece a la par. 500 ≈ 45 referencias: margen
-- de sobra sobre las 12 observadas. Ampliar un VARCHAR no reescribe la
-- tabla y es idempotente (re-ejecutar con la columna ya a 500 no hace nada).
-- =========================================================================

BEGIN;

ALTER TABLE pedidos ALTER COLUMN numero_pedido TYPE VARCHAR(500);

COMMENT ON COLUMN pedidos.numero_pedido
    IS 'TTNPEDI · referencias de pedido de la ruta concatenadas con ;. VARCHAR(500) como albaranes_concatenados (ampliado en 0017).';

COMMIT;
