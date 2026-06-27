/**
 * /satelles — maestros de Satelles ERPSYNC (outbound) para el ERP del cliente.
 *
 * Proxy autenticado: el ERP consulta y da de alta/actualiza conductores y
 * vehículos en Satelles a través de la pasarela, sin manejar él las
 * credenciales OAuth de Satelles. El tenant (y por tanto la credencial
 * Satelles de la empresa) se infiere de la API key del cliente —
 * `req.client.empresaId`, igual que en /datos.
 *
 *   GET  /satelles/drivers          lista de conductores
 *   GET  /satelles/drivers/:code    un conductor
 *   PUT  /satelles/drivers/:code    crear o actualizar conductor (upsert por code)
 *   GET  /satelles/vehicles         lista de vehículos
 *   GET  /satelles/vehicles/:code   un vehículo
 *   PUT  /satelles/vehicles/:code   crear o actualizar vehículo (upsert por code)
 *
 * Scopes: satelles.read (GET), satelles.write (PUT).
 * Entorno de la credencial Satelles: prod por defecto; ?entorno=sandbox para
 * el sandbox de Satelles si la empresa lo tiene dado de alta.
 *
 * REGLA OPERATIVA: cualquier cambio de contrato (path, body, response,
 * error_code) toca TRES sitios — este archivo, `tests/api.test.js` y
 * `admin.saycusoft.es/panel/src/pages/ApiDocsPasarela.jsx`.
 */

const { Router } = require('express');
const { requireKey } = require('../auth/client-key');
const { getCredencial } = require('../auth/provider-cred');
const satelles = require('../proveedores/satelles/client');

const router = Router();

// Carga la credencial Satelles del tenant de la key. Si la empresa no tiene
// credencial Satelles activa para ese entorno, responde 404 y devuelve null.
async function credencialTenant(req, res) {
    const entorno = req.query.entorno === 'sandbox' ? 'sandbox' : 'prod';
    const cred = await getCredencial({
        empresaId: req.client.empresaId,
        proveedorCodigo: 'satelles',
        entorno,
    });
    if (!cred) {
        res.locals.errorCode = 'sin_credencial_satelles';
        res.status(404).json({ ok: false, error: 'sin_credencial_satelles' });
        return null;
    }
    return cred;
}

// Traduce un fallo HTTP de Satelles (upstream) a 502 sin propagarlo al
// error-reporter — no es un bug nuestro, es la respuesta del tercero.
// Cualquier otro error (sin statusCode) sí sube a next para que se reporte.
function falloUpstream(err, res, next) {
    if (err && err.statusCode) {
        res.locals.errorCode = `satelles_upstream_${err.statusCode}`;
        return res.status(502).json({
            ok: false,
            error: 'satelles_upstream_error',
            status: err.statusCode,
            detail: err.upstream || null,
        });
    }
    return next(err);
}

/* ─── Conductores ─────────────────────────────────────────────────────────── */

router.get('/drivers', requireKey(['satelles.read']), async (req, res, next) => {
    try {
        const cred = await credencialTenant(req, res);
        if (!cred) return;
        const data = await satelles.getDrivers(cred);
        res.json({ ok: true, data });
    } catch (err) { falloUpstream(err, res, next); }
});

router.get('/drivers/:code', requireKey(['satelles.read']), async (req, res, next) => {
    try {
        const cred = await credencialTenant(req, res);
        if (!cred) return;
        const data = await satelles.getDriver(cred, req.params.code);
        res.json({ ok: true, data });
    } catch (err) { falloUpstream(err, res, next); }
});

router.put('/drivers/:code', requireKey(['satelles.write']), async (req, res, next) => {
    try {
        const body = req.body || {};
        if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
            res.locals.errorCode = 'name_requerido';
            return res.status(400).json({ ok: false, error: 'name_requerido' });
        }
        const cred = await credencialTenant(req, res);
        if (!cred) return;
        const data = await satelles.putDriver(cred, req.params.code, body);
        res.json({ ok: true, data: data ?? { code: req.params.code } });
    } catch (err) { falloUpstream(err, res, next); }
});

/* ─── Vehículos ───────────────────────────────────────────────────────────── */

router.get('/vehicles', requireKey(['satelles.read']), async (req, res, next) => {
    try {
        const cred = await credencialTenant(req, res);
        if (!cred) return;
        const data = await satelles.getVehicles(cred);
        res.json({ ok: true, data });
    } catch (err) { falloUpstream(err, res, next); }
});

router.get('/vehicles/:code', requireKey(['satelles.read']), async (req, res, next) => {
    try {
        const cred = await credencialTenant(req, res);
        if (!cred) return;
        const data = await satelles.getVehicle(cred, req.params.code);
        res.json({ ok: true, data });
    } catch (err) { falloUpstream(err, res, next); }
});

router.put('/vehicles/:code', requireKey(['satelles.write']), async (req, res, next) => {
    try {
        const body = req.body || {};
        if (!body.licensePlate || typeof body.licensePlate !== 'string' || !body.licensePlate.trim()) {
            res.locals.errorCode = 'licensePlate_requerido';
            return res.status(400).json({ ok: false, error: 'licensePlate_requerido' });
        }
        const cred = await credencialTenant(req, res);
        if (!cred) return;
        const data = await satelles.putVehicle(cred, req.params.code, body);
        res.json({ ok: true, data: data ?? { code: req.params.code } });
    } catch (err) { falloUpstream(err, res, next); }
});

module.exports = router;
