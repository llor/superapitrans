/**
 * Rutas de incidencias para chofocles.
 *
 *   GET  /api/incidencias?viaje_id=...   — incidencias del chofer (filtra por conductor_id)
 *   POST /api/incidencias                — { viaje_id, tipo, descripcion, lat?, lng?, origen? }
 */

const express = require('express');
const { getTenantPool } = require('../db');
const { authMiddleware } = require('../auth/middleware');
const {
    ok, created, validationError, notFound, serverError, badRequest, forbidden,
} = require('../utils/responses');

const router = express.Router();
const requireChofer = authMiddleware({ roles: ['chofer'] });

const ORIGENES_VALIDOS = new Set(['voz', 'manual', 'sistema']);


router.get('/', requireChofer, async (req, res) => {
    try {
        const tenant = getTenantPool(req.empresaCodigo);
        const params = [req.userId];
        let where = `WHERE i.conductor_id = $1`;
        if (req.query.viaje_id) {
            const vid = Number(req.query.viaje_id);
            if (!Number.isInteger(vid) || vid <= 0) return badRequest(res, 'viaje_id_invalido');
            params.push(vid);
            where += ` AND i.viaje_id = $${params.length}`;
        }
        const result = await tenant.query(
            `SELECT i.id, i.viaje_id, i.tipo, i.descripcion, i.lat, i.lng,
                    i.resuelta, i.resolucion, i.origen, i.created_at
             FROM incidencias i
             ${where}
             ORDER BY i.created_at DESC
             LIMIT 200`,
            params
        );
        return ok(res, { incidencias: result.rows });
    } catch (err) {
        return serverError(res, err);
    }
});


router.post('/', requireChofer, async (req, res) => {
    try {
        const { viaje_id, tipo, descripcion = '', lat = null, lng = null, origen = 'manual' } = req.body || {};
        const missing = [];
        if (!viaje_id) missing.push('viaje_id');
        if (!tipo) missing.push('tipo');
        if (missing.length) return validationError(res, missing);

        if (!ORIGENES_VALIDOS.has(origen)) {
            return badRequest(res, 'origen_invalido', { origenes_validos: [...ORIGENES_VALIDOS] });
        }

        const vid = Number(viaje_id);
        if (!Number.isInteger(vid) || vid <= 0) return badRequest(res, 'viaje_id_invalido');

        const tenant = getTenantPool(req.empresaCodigo);

        // Verificar que el viaje existe y es del chofer logado
        const v = await tenant.query(
            `SELECT id, conductor_id FROM viajes WHERE id = $1 AND deleted_at IS NULL`,
            [vid]
        );
        if (v.rowCount === 0) return notFound(res, 'Viaje no encontrado');
        if (v.rows[0].conductor_id !== req.userId) {
            return forbidden(res, 'Viaje no asignado a ti');
        }

        const ins = await tenant.query(
            `INSERT INTO incidencias (viaje_id, conductor_id, tipo, descripcion, lat, lng, origen)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, viaje_id, tipo, descripcion, lat, lng, origen, created_at`,
            [vid, req.userId, String(tipo), String(descripcion), lat, lng, origen]
        );
        return created(res, { incidencia: ins.rows[0] }, 'Incidencia creada');
    } catch (err) {
        return serverError(res, err);
    }
});


module.exports = router;
