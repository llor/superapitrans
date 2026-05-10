/**
 * pasarela — pool admin + Map<empresa_codigo, pool> con caché.
 * Patrón Saycu (mismo enfoque que chofocles/api/src/db.js).
 */

const { Pool } = require('pg');

const ADMIN_DB = process.env.SAYCU_ADMIN_DB || 'saycu_admin';
const TENANT_PREFIX = 'saycu_pasarela_';

const baseConfig = () => ({
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: Number.parseInt(process.env.DB_POOL_MAX, 10) || 10,
});

let adminPool = null;
const tenantPools = new Map();

function getAdminPool() {
    if (!adminPool) {
        adminPool = new Pool({ ...baseConfig(), database: ADMIN_DB });
    }
    return adminPool;
}

function getTenantPool(empresaCodigo) {
    if (!empresaCodigo) throw new Error('empresaCodigo requerido');
    const key = String(empresaCodigo).toLowerCase();
    if (!tenantPools.has(key)) {
        tenantPools.set(key, new Pool({
            ...baseConfig(),
            database: `${TENANT_PREFIX}${key}`,
        }));
    }
    return tenantPools.get(key);
}

async function pingAdmin() {
    const r = await getAdminPool().query('SELECT 1 AS ok');
    return r.rows[0].ok === 1;
}

async function closeAllPools() {
    const closes = [];
    if (adminPool) closes.push(adminPool.end());
    for (const p of tenantPools.values()) closes.push(p.end());
    await Promise.all(closes);
    adminPool = null;
    tenantPools.clear();
}

module.exports = {
    getAdminPool,
    getTenantPool,
    pingAdmin,
    closeAllPools,
    TENANT_PREFIX,
};
