/**
 * set-pcs-valencia-cred.js — Inserta o actualiza la credencial OAuth de
 * PCS ValenciaportPCS para una empresa-tenant Saycu, cifrándola con
 * PASARELA_SECRETS_KEY.
 *
 * Uso (dentro del contenedor pasarela_api):
 *   node scripts/set-pcs-valencia-cred.js \
 *     --empresa JSR \
 *     --client-id messaging.JSRO \
 *     --client-secret @Jasaro_2026 \
 *     [--token-url https://www.valenciaportpcs.net/oauth/connect/token] \
 *     [--api-base  https://api.valenciaportpcs.net/messaging] \
 *     [--entorno   prod|sandbox]   (defecto prod)
 *
 * Si --token-url y/o --api-base no se pasan, se usan los valores PROD por
 * defecto.
 */
'use strict';

const { Pool } = require('pg');
const path = require('node:path');
const readline = require('node:readline');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { cifrarJson } = require('../src/secrets');

const DEFAULT_TOKEN_URL = 'https://www.valenciaportpcs.net/oauth/connect/token';
const DEFAULT_API_BASE  = 'https://api.valenciaportpcs.net/messaging';
const TEST_TOKEN_URL    = 'https://test.valenciaportpcs.net/oauth/connect/token';
const TEST_API_BASE     = 'https://testapi.valenciaportpcs.net/messaging';

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            out[key] = true;
        } else {
            out[key] = next;
            i++;
        }
    }
    return out;
}

async function readStdin() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin });
        let line = '';
        rl.on('line', (l) => { line = l; rl.close(); });
        rl.on('close', () => resolve(line));
    });
}

async function main() {
    const args = parseArgs(process.argv);
    const empresa = (args.empresa || '').toString().toUpperCase();
    const entorno = (args.entorno || 'prod').toString();
    const clientId = (args['client-id'] || '').toString();
    let clientSecret = args['client-secret'];
    const tokenUrl = (args['token-url'] || (entorno === 'sandbox' ? TEST_TOKEN_URL : DEFAULT_TOKEN_URL)).toString();
    const apiBase  = (args['api-base']  || (entorno === 'sandbox' ? TEST_API_BASE  : DEFAULT_API_BASE)).toString();

    if (!empresa)  return fail('--empresa requerido (código de empresa Saycu)');
    if (!clientId) return fail('--client-id requerido');
    if (!['prod', 'sandbox'].includes(entorno)) {
        return fail('--entorno debe ser prod|sandbox');
    }
    if (!clientSecret || clientSecret === true) {
        process.stderr.write('client-secret (no echo): ');
        clientSecret = await readStdin();
    }
    if (!clientSecret) return fail('client-secret vacío');

    const adminDb = process.env.SAYCU_ADMIN_DB || 'saycu_admin';
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: adminDb,
    });

    try {
        const empRes = await pool.query(
            `SELECT id FROM empresas WHERE UPPER(codigo) = $1 AND deleted_at IS NULL`,
            [empresa]
        );
        if (empRes.rowCount === 0) {
            return fail(`empresa ${empresa} no encontrada en ${adminDb}.empresas`);
        }
        const empresaId = empRes.rows[0].id;

        const provRes = await pool.query(
            `SELECT id FROM pasarela_proveedores WHERE codigo = 'pcs-valencia' AND activo = TRUE`
        );
        if (provRes.rowCount === 0) {
            return fail(`proveedor 'pcs-valencia' no existe o no está activo. Aplica 0006 + 0008 antes.`);
        }
        const proveedorId = provRes.rows[0].id;

        const blob = cifrarJson({
            client_id: clientId,
            client_secret: clientSecret,
            token_url: tokenUrl,
            api_base: apiBase,
        });

        const r = await pool.query(
            `INSERT INTO pasarela_proveedores_credenciales
                (empresa_id, proveedor_id, entorno, credencial_cifrada, activo)
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (empresa_id, proveedor_id, entorno)
             DO UPDATE SET credencial_cifrada = EXCLUDED.credencial_cifrada,
                           activo = TRUE,
                           ultimo_error = NULL,
                           updated_at = NOW()
             RETURNING id, (xmax = 0) AS inserted`,
            [empresaId, proveedorId, entorno, blob]
        );
        const ins = r.rows[0];
        console.log(`OK ${ins.inserted ? 'INSERT' : 'UPDATE'} credencial id=${ins.id} empresa=${empresa} proveedor=pcs-valencia entorno=${entorno}`);
    } finally {
        await pool.end();
    }
}

function fail(msg) {
    console.error(`[set-pcs-valencia-cred][ERROR] ${msg}`);
    process.exit(2);
}

main().catch((err) => fail(err.stack || err.message));
