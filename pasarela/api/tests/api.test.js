/**
 * Suite de tests automatizados de los endpoints del pasarela_api.
 *
 * Ejecuta con: `npm test` (desde pasarela/api/).
 *
 * REGLA OPERATIVA — leer antes de tocar:
 *   - Si añades un endpoint nuevo, añade su grupo de tests aquí Y su
 *     ficha en `admin.saycusoft.es/panel/src/pages/ApiDocsPasarela.jsx`.
 *   - Si modificas el contrato (path, body, response, errores), actualiza
 *     los tres sitios: el código (`src/routes/`), este test, y el manual.
 *   - Si añades un nuevo `error_code` en `res.locals.errorCode`,
 *     verifica con un test que viaja en el body como `{ ok:false, error:<code> }`.
 *
 * Cobertura actual:
 *   GET /health                                          (público)
 *   GET /api/health                                      (público)
 *   GET /<no-existe>                                     → 404 not_found
 *   GET /api/datos/pedidos                               (varios casos)
 *   GET /api/datos/pedidos/:id                           (varios casos)
 *   POST /api/datos/pedidos/:id/marcar-procesado         (varios casos)
 *   GET/PUT /api/satelles/drivers|vehicles               (auth, scope,
 *       validación y sin_credencial — la rama feliz llama a Satelles real,
 *       no se prueba en CI; se valida en prod contra ecotrans.satelles.es).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api } = require('./helpers');
const { setupTestData, teardownTestData, TEST_CODIGO } = require('./setup');
const { closeAllPools, getTenantPool } = require('../src/db');

let ctx; // { rawKeyRead, rawKeyRw, pedidoIdSeed }

test.before(async () => {
    process.env.NODE_ENV = 'test';
    ctx = await setupTestData();
    await startServer();
});

test.after(async () => {
    await stopServer();
    await teardownTestData();
    await closeAllPools();
});

/* ─── /health y /api/health ───────────────────────────────────────────── */

test('GET /health → 200 ok=true', async () => {
    const r = await api('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.service, 'pasarela-api');
});

test('GET /api/health → 200 ok=true', async () => {
    const r = await api('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
});

/* ─── 404 catch-all ───────────────────────────────────────────────────── */

test('GET /ruta-inexistente → 404 not_found', async () => {
    const r = await api('GET', '/no-existe-este-path');
    assert.equal(r.status, 404);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, 'not_found');
});

/* ─── Auth: errores ───────────────────────────────────────────────────── */

test('GET /api/datos/pedidos sin Bearer → 401 missing_bearer', async () => {
    const r = await api('GET', '/api/datos/pedidos');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'missing_bearer');
});

test('GET /api/datos/pedidos con Bearer mal formado → 401 invalid_key', async () => {
    const r = await api('GET', '/api/datos/pedidos', { token: 'pas_live_doesnotexist1234567890' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'invalid_key');
});

test('GET /api/datos/pedidos con Bearer válido pero scope insuficiente NO se puede probar:'
    + ' ambas keys del setup tienen datos.read; el caso de scope se prueba en POST', () => {
    // Documental: el scope_required real está cubierto en el grupo POST.
});

/* ─── GET /api/datos/pedidos ──────────────────────────────────────────── */

test('GET /api/datos/pedidos con key read → 200 + estructura', async () => {
    const r = await api('GET', '/api/datos/pedidos', { token: ctx.rawKeyRead });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.ok(Array.isArray(r.body.data.pedidos));
    assert.ok(typeof r.body.data.count === 'number');
    assert.ok(r.body.data.count >= 1, 'debería incluir al menos el pedido seed');
});

test('GET /api/datos/pedidos?limit=1 → respeta el límite', async () => {
    const r = await api('GET', '/api/datos/pedidos?limit=1', { token: ctx.rawKeyRead });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.pedidos.length <= 1);
});

test('GET /api/datos/pedidos?estado=PENDIENTE → filtra por estado', async () => {
    const r = await api('GET', '/api/datos/pedidos?estado=PENDIENTE', { token: ctx.rawKeyRead });
    assert.equal(r.status, 200);
    for (const p of r.body.data.pedidos) {
        assert.equal(p.estado, 'PENDIENTE', 'todos los devueltos deben estar en PENDIENTE');
    }
});

test('GET /api/datos/pedidos?estado=NO_EXISTE → 200 con count 0', async () => {
    const r = await api('GET', '/api/datos/pedidos?estado=ESTADO_INVENTADO', { token: ctx.rawKeyRead });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.count, 0);
});

/* ─── GET /api/datos/pedidos/:id ──────────────────────────────────────── */

test('GET /api/datos/pedidos/abc → 400 id_invalido', async () => {
    const r = await api('GET', '/api/datos/pedidos/no-numerico', { token: ctx.rawKeyRead });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'id_invalido');
});

test('GET /api/datos/pedidos/99999999 → 404 no_encontrado', async () => {
    const r = await api('GET', '/api/datos/pedidos/99999999', { token: ctx.rawKeyRead });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'no_encontrado');
});

test('GET /api/datos/pedidos/:id (seed) → 200 + 4 colecciones', async () => {
    const r = await api('GET', '/api/datos/pedidos/' + ctx.pedidoIdSeed, { token: ctx.rawKeyRead });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.data.pedido.id, ctx.pedidoIdSeed);
    assert.ok(Array.isArray(r.body.data.albaranes));
    assert.ok(Array.isArray(r.body.data.paradas));
    assert.ok(Array.isArray(r.body.data.facturas));
    assert.equal(r.body.data.albaranes.length, 1);
    assert.equal(r.body.data.paradas.length, 2);
});

/* ─── POST /api/datos/pedidos/:id/marcar-procesado ────────────────────── */

test('POST .../marcar-procesado con key sin scope datos.write → 403 scope_required', async () => {
    const r = await api('POST', `/api/datos/pedidos/${ctx.pedidoIdSeed}/marcar-procesado`, { token: ctx.rawKeyRead });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'scope_required');
    assert.equal(r.body.scope, 'datos.write');
});

test('POST .../marcar-procesado con key write → 200 estado=PROCESADO', async () => {
    const r = await api('POST', `/api/datos/pedidos/${ctx.pedidoIdSeed}/marcar-procesado`, { token: ctx.rawKeyRw });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.data.id, ctx.pedidoIdSeed);
    assert.equal(r.body.data.estado, 'PROCESADO');
    // Confirma persistencia leyendo BD directamente.
    const db = await getTenantPool(TEST_CODIGO).query(
        'SELECT estado FROM pedidos WHERE id = $1', [ctx.pedidoIdSeed]
    );
    assert.equal(db.rows[0].estado, 'PROCESADO');
});

test('POST .../marcar-procesado sobre pedido ya procesado → 404 no_encontrado_o_ya_procesado', async () => {
    const r = await api('POST', `/api/datos/pedidos/${ctx.pedidoIdSeed}/marcar-procesado`, { token: ctx.rawKeyRw });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'no_encontrado_o_ya_procesado');
});

test('POST .../marcar-procesado/:id con id no numérico → 400 id_invalido', async () => {
    const r = await api('POST', '/api/datos/pedidos/abc/marcar-procesado', { token: ctx.rawKeyRw });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'id_invalido');
});

/* ─── /api/satelles — maestros (conductores y vehículos) ──────────────────
 *
 * La empresa TEST no tiene credencial Satelles, así que las ramas felices
 * (GET/PUT que sí llegan a Satelles) responden 404 sin_credencial_satelles
 * sin salir a la red. La cobertura es: auth, scope, validación de body y
 * sin_credencial. El proxy real se valida en prod (allowlist Cloudflare).
 */

test('GET /api/satelles/drivers sin Bearer → 401 missing_bearer', async () => {
    const r = await api('GET', '/api/satelles/drivers');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'missing_bearer');
});

test('GET /api/satelles/drivers con key sin satelles.read → 403 scope_required', async () => {
    const r = await api('GET', '/api/satelles/drivers', { token: ctx.rawKeyRead });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'scope_required');
    assert.equal(r.body.scope, 'satelles.read');
});

test('PUT /api/satelles/drivers/:code con key sin satelles.write → 403 scope_required', async () => {
    const r = await api('PUT', '/api/satelles/drivers/SAYCU-X', { token: ctx.rawKeyRead, body: { name: 'X' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'scope_required');
    assert.equal(r.body.scope, 'satelles.write');
});

test('GET /api/satelles/drivers con satelles.read pero empresa sin credencial → 404 sin_credencial_satelles', async () => {
    const r = await api('GET', '/api/satelles/drivers', { token: ctx.rawKeySat });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'sin_credencial_satelles');
});

test('GET /api/satelles/vehicles con satelles.read pero empresa sin credencial → 404 sin_credencial_satelles', async () => {
    const r = await api('GET', '/api/satelles/vehicles', { token: ctx.rawKeySat });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'sin_credencial_satelles');
});

test('PUT /api/satelles/drivers/:code sin name → 400 name_requerido', async () => {
    const r = await api('PUT', '/api/satelles/drivers/SAYCU-X', { token: ctx.rawKeySat, body: { email: 'x@y.es' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'name_requerido');
});

test('PUT /api/satelles/vehicles/:code sin licensePlate → 400 licensePlate_requerido', async () => {
    const r = await api('PUT', '/api/satelles/vehicles/SAYCU-X', { token: ctx.rawKeySat, body: { type: 'StraightTruck' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'licensePlate_requerido');
});
