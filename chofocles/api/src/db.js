/**
 * Pool de conexiones a PostgreSQL.
 *
 * chofocles usa BBDDs separadas:
 *   - saycu_admin                : catálogo de plantillas + operadores logísticos
 *   - saycu_chofocles_<CODIGO>   : una BBDD por tenant (empresa de transporte)
 *
 * Para no abrir y cerrar conexiones por cada query, mantenemos un pool por BBDD
 * en un Map con caché. Patrón Saycu (mismo enfoque que saycutrans).
 */

const { Pool } = require('pg');

const required = (name) => {
    const v = process.env[name];
    if (v === undefined || v === '') {
        throw new Error(`Variable de entorno ${name} no definida`);
    }
    return v;
};

const baseConfig = () => ({
    host: required('DB_HOST'),
    port: parseInt(required('DB_PORT'), 10),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

const adminPool = new Pool({
    ...baseConfig(),
    database: 'saycu_admin',
});

const tenantPools = new Map();

function tenantDbName(empresaCodigo) {
    if (!empresaCodigo || typeof empresaCodigo !== 'string') {
        throw new Error('empresaCodigo requerido y debe ser string');
    }
    return `saycu_chofocles_${empresaCodigo.toLowerCase()}`;
}

function getTenantPool(empresaCodigo) {
    const dbName = tenantDbName(empresaCodigo);
    if (!tenantPools.has(dbName)) {
        tenantPools.set(dbName, new Pool({
            ...baseConfig(),
            database: dbName,
        }));
    }
    return tenantPools.get(dbName);
}

async function pingDB() {
    const r = await adminPool.query('SELECT 1 AS ok');
    return r.rows[0];
}

async function closeAllPools() {
    await adminPool.end();
    for (const pool of tenantPools.values()) {
        await pool.end();
    }
    tenantPools.clear();
}

module.exports = {
    adminPool,
    getTenantPool,
    tenantDbName,
    pingDB,
    closeAllPools,
};
