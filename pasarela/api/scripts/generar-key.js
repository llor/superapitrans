/**
 * Genera una API key inbound para un cliente (empresa + aplicación) y la
 * inserta en saycu_admin.pasarela_clientes_keys.
 *
 * Uso (dentro del contenedor pasarela_api):
 *   node scripts/generar-key.js <empresa_codigo> <aplicacion> <scopes_csv> [expira_dias]
 *
 * Ejemplo:
 *   node scripts/generar-key.js demo a3erp \
 *       'datos.read,datos.write,utilidades.chofocles,utilidades.general'
 *
 * El secreto plano se imprime UNA SOLA VEZ y no se vuelve a poder recuperar.
 */

require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getAdminPool, closeAllPools } = require('../src/db');

const PREFIX_LENGTH = 16;   // alineado con auth/client-key.js
const BCRYPT_ROUNDS = 10;

function uso(msg) {
    if (msg) console.error(`error: ${msg}`);
    console.error(
        'uso: node scripts/generar-key.js <empresa_codigo> <aplicacion> <scopes_csv> [expira_dias]'
    );
    process.exit(1);
}

async function main() {
    const [empresaCodigo, aplicacion, scopesCsv, expiraDiasStr] = process.argv.slice(2);
    if (!empresaCodigo || !aplicacion || !scopesCsv) uso('faltan argumentos');

    const scopes = scopesCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (scopes.length === 0) uso('scopes vacíos');

    let expiraAt = null;
    if (expiraDiasStr) {
        const n = Number(expiraDiasStr);
        if (!Number.isInteger(n) || n <= 0) uso('expira_dias debe ser entero positivo');
        expiraAt = new Date(Date.now() + n * 86400 * 1000);
    }

    const pool = getAdminPool();

    // Localizar empresa por código
    const empRes = await pool.query(
        'SELECT id, codigo, nombre FROM empresas WHERE codigo = $1 LIMIT 1',
        [empresaCodigo]
    );
    if (empRes.rows.length === 0) {
        console.error(`error: empresa con código '${empresaCodigo}' no existe`);
        await closeAllPools();
        process.exit(2);
    }
    const empresa = empRes.rows[0];

    // Generar token: 'pas_live_' + 32 hex random (256 bits)
    const random = crypto.randomBytes(16).toString('hex');
    const token = `pas_live_${random}`;
    const prefix = token.slice(0, PREFIX_LENGTH);
    const hash = await bcrypt.hash(token, BCRYPT_ROUNDS);

    // Insertar (UNIQUE empresa_id + aplicacion → en conflicto, error claro)
    try {
        const ins = await pool.query(
            `INSERT INTO pasarela_clientes_keys
                (empresa_id, aplicacion, key_prefix, key_hash, scopes, expira_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, created_at`,
            [empresa.id, aplicacion, prefix, hash, scopes, expiraAt]
        );
        const row = ins.rows[0];

        console.log('');
        console.log('===============================================================');
        console.log('  API key generada — apuntad el secreto AHORA, no se reimprime');
        console.log('===============================================================');
        console.log(`  empresa     : ${empresa.codigo} (${empresa.nombre}) [id ${empresa.id}]`);
        console.log(`  aplicacion  : ${aplicacion}`);
        console.log(`  scopes      : ${scopes.join(', ')}`);
        console.log(`  expira_at   : ${expiraAt ? expiraAt.toISOString() : '(sin caducidad)'}`);
        console.log(`  key_id      : ${row.id}`);
        console.log(`  key_prefix  : ${prefix}`);
        console.log(`  created_at  : ${row.created_at.toISOString()}`);
        console.log('---------------------------------------------------------------');
        console.log(`  SECRETO     : ${token}`);
        console.log('===============================================================');
        console.log('');
        console.log('Uso desde cliente:');
        console.log(`  Authorization: Bearer ${token}`);
        console.log('');
    } catch (err) {
        if (err.code === '23505') {
            console.error(
                `error: ya existe una key para empresa '${empresaCodigo}' + aplicacion '${aplicacion}'.`
            );
            console.error('Borra la anterior antes de crear una nueva, o usa otra aplicación.');
        } else {
            console.error('error insertando key:', err.message);
        }
        await closeAllPools();
        process.exit(3);
    }

    await closeAllPools();
}

main().catch(async (err) => {
    console.error('error inesperado:', err);
    try { await closeAllPools(); } catch (_) {}
    process.exit(99);
});
