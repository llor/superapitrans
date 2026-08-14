/**
 * Setup de datos para los tests automatizados.
 *
 * Idempotente. Antes de cada ejecución asegura:
 *   - empresa TEST en saycu_admin (codigo TEST, servicios incluyen 'pasarela').
 *   - BD `saycu_pasarela_test` con tablas pedidos/albaranes/paradas/facturas
 *     (clonada desde saycu_pasarela_demo si no existe).
 *   - 2 API keys de la empresa TEST: una solo lectura ('test-read', scopes
 *     ['datos.read']) y otra lectura+escritura ('test-rw', ['datos.read',
 *     'datos.write']). Antes de regenerar, se borran las anteriores.
 *   - 1 pedido seed PENDIENTE con 1 albarán y 2 paradas, para que los GETs
 *     felices y el POST marcar-procesado tengan algo concreto sobre lo que
 *     responder.
 *
 * Devuelve { rawKeyRead, rawKeyRw, pedidoIdSeed }. Las raw keys se usan
 * directamente como `Authorization: Bearer <raw>` en los tests.
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getAdminPool, getTenantPool } = require('../src/db');

const TEST_CODIGO = 'TEST';
const TEST_DBNAME = 'saycu_pasarela_test';
const DEMO_DBNAME = 'saycu_pasarela_demo';
// db_name de la FICHA de saycu_admin: por convención del grupo es siempre la BD
// de TRANSPORTE (saycutrans_empresa_<codigo>), la ponga quien la ponga y
// contrate el servicio que contrate — así la rellena el alta oficial del panel
// de administración. La pasarela NO lo usa: compone su BD con su prefijo
// (saycu_pasarela_<codigo>), igual que saycucontrol con el suyo; el único
// servicio que lee db_name es saycutrans. Poniendo aquí la BD de la pasarela,
// cualquier petición de transporte con esta empresa buscaba esa BD en el
// clúster de transporte, no la encontraba y devolvía 500 (dev, 2026-08-13).
const EMPRESA_DBNAME = `saycutrans_empresa_${TEST_CODIGO.toLowerCase()}`;

async function ensureTenantDb() {
    const adminPool = new Pool({
        host: process.env.DB_HOST,
        port: Number.parseInt(process.env.DB_PORT, 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'postgres',
        max: 1,
    });
    try {
        const exists = await adminPool.query(
            'SELECT 1 FROM pg_database WHERE datname = $1',
            [TEST_DBNAME]
        );
        if (exists.rowCount === 0) {
            // Cerrar conexiones a la DEMO antes de usarla como TEMPLATE.
            await adminPool.query(
                `SELECT pg_terminate_backend(pid)
                 FROM pg_stat_activity
                 WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [DEMO_DBNAME]
            );
            await adminPool.query(
                `CREATE DATABASE ${TEST_DBNAME} TEMPLATE ${DEMO_DBNAME}`
            );
        }
    } finally {
        await adminPool.end();
    }
}

async function ensureEmpresaTest() {
    const r = await getAdminPool().query(
        `INSERT INTO empresas (codigo, nombre, db_name, servicios, activo)
         VALUES ($1, 'Empresa TEST (auto)', $2, ARRAY['pasarela']::servicio_tipo[], true)
         ON CONFLICT (codigo) DO UPDATE
            SET activo = true,
                db_name = EXCLUDED.db_name,
                servicios = (SELECT array_agg(DISTINCT s) FROM unnest(empresas.servicios || ARRAY['pasarela']::servicio_tipo[]) s)
         RETURNING id`,
        [TEST_CODIGO, EMPRESA_DBNAME]
    );
    return r.rows[0].id;
}

function generateRawKey() {
    return 'pas_live_' + crypto.randomBytes(20).toString('hex');
}

async function regenerarApiKey(empresaId, aplicacion, scopes) {
    const raw = generateRawKey();
    const prefix = raw.slice(0, 16);
    const hash = await bcrypt.hash(raw, 8);
    await getAdminPool().query(
        `INSERT INTO pasarela_clientes_keys
            (empresa_id, aplicacion, key_prefix, key_hash, scopes, activo)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (empresa_id, aplicacion) DO UPDATE
            SET key_prefix = EXCLUDED.key_prefix,
                key_hash   = EXCLUDED.key_hash,
                scopes     = EXCLUDED.scopes,
                activo     = true,
                updated_at = NOW()`,
        [empresaId, aplicacion, prefix, hash, scopes]
    );
    return raw;
}

async function ensurePedidoSeed() {
    const pool = getTenantPool(TEST_CODIGO);
    // Limpieza idempotente: borramos cualquier pedido seed previo (CASCADE
    // arrastra paradas/albaranes/facturas).
    await pool.query(`DELETE FROM pedidos WHERE id_ruta_externa = 'TEST-SEED-1'`);

    const ped = await pool.query(
        `INSERT INTO pedidos
            (id_viaje, id_ruta_externa, cliente_codigo, numero_pedido, tipo, estado,
             fecha_plan, fecha_reparto, origen, proveedor_codigo, matricula_tractor)
         VALUES (999001, 'TEST-SEED-1', 'TEST', 'PED-TEST-1', 'PEDIDO', 'PENDIENTE',
                 CURRENT_DATE, CURRENT_DATE, 'manual_admin', 'test', '0000-TST')
         RETURNING id`
    );
    const pedidoId = ped.rows[0].id;

    const alb = await pool.query(
        `INSERT INTO albaranes (pedido_id, numero, fecha)
         VALUES ($1, 'ALB-TEST-1', CURRENT_DATE)
         RETURNING id`,
        [pedidoId]
    );
    const albaranId = alb.rows[0].id;

    await pool.query(
        `INSERT INTO paradas (pedido_id, albaran_id, tipo, orden, secuencia, lugar_nombre, municipio)
         VALUES ($1, $2, 'CARGA',    'ORIGEN',  1, 'Origen TEST',  'Madrid'),
                ($1, $2, 'DESCARGA', 'DESTINO', 2, 'Destino TEST', 'Barcelona')`,
        [pedidoId, albaranId]
    );

    return pedidoId;
}

async function setupTestData() {
    await ensureTenantDb();
    const empresaId = await ensureEmpresaTest();
    const rawKeyRead = await regenerarApiKey(empresaId, 'test-read', ['datos.read']);
    const rawKeyRw   = await regenerarApiKey(empresaId, 'test-rw',   ['datos.read', 'datos.write']);
    const rawKeySat  = await regenerarApiKey(empresaId, 'test-satelles', ['satelles.read', 'satelles.write']);
    const pedidoIdSeed = await ensurePedidoSeed();
    return { empresaId, rawKeyRead, rawKeyRw, rawKeySat, pedidoIdSeed };
}

async function teardownTestData() {
    // Solo desactivamos las keys; dejamos empresa y BD para revisión y
    // reuso en la próxima ejecución.
    await getAdminPool().query(
        `UPDATE pasarela_clientes_keys
            SET activo = false, updated_at = NOW()
          WHERE empresa_id = (SELECT id FROM empresas WHERE codigo = $1)
            AND aplicacion IN ('test-read', 'test-rw', 'test-satelles')`,
        [TEST_CODIGO]
    );
}

module.exports = {
    setupTestData,
    teardownTestData,
    TEST_CODIGO,
};
