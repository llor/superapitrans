/**
 * Rutas de viajes para chofocles.
 *
 *   GET  /api/viajes                       — viajes del chofer logado (filtra por conductor_id)
 *   GET  /api/viajes/:id                   — detalle del viaje + paradas
 *   POST /api/viajes/:id/comando           — { comando, notas?, lat?, lng? }
 *                                             aplica la transición y registra historial
 */

const express = require('express');
const { getTenantPool } = require('../db');
const { authMiddleware } = require('../auth/middleware');
const {
    ok, validationError, notFound, serverError, badRequest, forbidden,
} = require('../utils/responses');
const {
    planificarComando, TransicionInvalida, COMANDOS,
} = require('../services/transiciones');

const router = express.Router();

// Solo choferes acceden a sus viajes desde la app móvil. Para admin, hay
// rutas paralelas (no implementadas en este MVP).
const requireChofer = authMiddleware({ roles: ['chofer'] });


// ──────────────── GET /api/viajes ────────────────

router.get('/', requireChofer, async (req, res) => {
    try {
        const tenant = getTenantPool(req.empresaCodigo);
        const result = await tenant.query(
            `SELECT v.id, v.referencia_externa, v.fecha,
                    v.cliente_nombre, v.mercancia_descripcion, v.precio,
                    v.origen_municipio, v.destino_municipio,
                    e.codigo AS estado_codigo, e.nombre AS estado_nombre
             FROM viajes v
             JOIN estados_viaje e ON e.id = v.estado_id
             WHERE v.conductor_id = $1
               AND v.deleted_at IS NULL
               AND v.visible_chofer = TRUE
             ORDER BY v.fecha DESC, v.id DESC
             LIMIT 200`,
            [req.userId]
        );
        return ok(res, { viajes: result.rows });
    } catch (err) {
        return serverError(res, err);
    }
});


// ──────────────── GET /api/viajes/:id ────────────────

router.get('/:id', requireChofer, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id_invalido');

        const tenant = getTenantPool(req.empresaCodigo);
        const viajeRes = await tenant.query(
            `SELECT v.*, e.codigo AS estado_codigo, e.nombre AS estado_nombre
             FROM viajes v
             JOIN estados_viaje e ON e.id = v.estado_id
             WHERE v.id = $1 AND v.deleted_at IS NULL`,
            [id]
        );
        if (viajeRes.rowCount === 0) return notFound(res, 'Viaje no encontrado');
        const viaje = viajeRes.rows[0];
        if (viaje.conductor_id !== req.userId) {
            return forbidden(res, 'Este viaje no está asignado a ti');
        }

        const paradasRes = await tenant.query(
            `SELECT p.*, ep.codigo AS estado_codigo, ep.nombre AS estado_nombre
             FROM viajes_paradas p
             LEFT JOIN estados_parada ep ON ep.id = p.estado_id
             WHERE p.viaje_id = $1 AND p.deleted_at IS NULL
             ORDER BY p.orden ASC`,
            [id]
        );
        return ok(res, { viaje, paradas: paradasRes.rows });
    } catch (err) {
        return serverError(res, err);
    }
});


// ──────────────── POST /api/viajes/:id/comando ────────────────

router.post('/:id/comando', requireChofer, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id_invalido');

    const { comando, notas = '', lat = null, lng = null } = req.body || {};
    if (!comando) return validationError(res, ['comando']);
    if (!COMANDOS.has(comando)) {
        return badRequest(res, 'comando_desconocido', { comandos_validos: [...COMANDOS] });
    }

    const tenant = getTenantPool(req.empresaCodigo);
    const client = await tenant.connect();
    try {
        await client.query('BEGIN');

        // Cargar viaje y paradas con sus códigos de estado
        const vRes = await client.query(
            `SELECT v.*, e.codigo AS estado_codigo
             FROM viajes v
             JOIN estados_viaje e ON e.id = v.estado_id
             WHERE v.id = $1 AND v.deleted_at IS NULL
             FOR UPDATE`,
            [id]
        );
        if (vRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return notFound(res, 'Viaje no encontrado');
        }
        const viaje = vRes.rows[0];
        if (viaje.conductor_id !== req.userId) {
            await client.query('ROLLBACK');
            return forbidden(res, 'Este viaje no está asignado a ti');
        }

        const pRes = await client.query(
            `SELECT p.*, ep.codigo AS estado_codigo
             FROM viajes_paradas p
             LEFT JOIN estados_parada ep ON ep.id = p.estado_id
             WHERE p.viaje_id = $1 AND p.deleted_at IS NULL
             ORDER BY p.orden`,
            [id]
        );
        const paradas = pRes.rows;

        let plan;
        try {
            plan = planificarComando(comando, { viaje, paradas, notas });
        } catch (err) {
            await client.query('ROLLBACK');
            if (err instanceof TransicionInvalida) {
                return badRequest(res, 'transicion_invalida', { message: err.message });
            }
            throw err;
        }

        // Aplicar cambio de estado del viaje (si hay) + historial
        if (plan.viaje) {
            const nuevoEstadoRes = await client.query(
                'SELECT id FROM estados_viaje WHERE codigo = $1',
                [plan.viaje.nuevo_estado]
            );
            const nuevoEstadoId = nuevoEstadoRes.rows[0]?.id;

            await client.query(
                `INSERT INTO estados_viaje_historial
                    (viaje_id, estado_anterior_id, estado_nuevo_id,
                     usuario_id, usuario_nombre, usuario_rol, notas, gps_lat, gps_lng)
                 VALUES ($1, $2, $3, $4, $5, 'chofer', $6, $7, $8)`,
                [
                    id, viaje.estado_id, nuevoEstadoId,
                    req.userId, req.userName, notas, lat, lng,
                ]
            );

            const camposExtra = [];
            const valoresExtra = [];
            let p = 3;
            if (plan.viaje.nuevo_estado === 'aceptado') {
                camposExtra.push(`fecha_aceptacion = NOW()`);
                camposExtra.push(`estado_aceptacion = 'aceptado'`);
            } else if (plan.viaje.nuevo_estado === 'rechazado') {
                camposExtra.push(`estado_aceptacion = 'rechazado'`);
                if (plan.viaje.motivo_rechazo) {
                    camposExtra.push(`motivo_rechazo = $${p++}`);
                    valoresExtra.push(plan.viaje.motivo_rechazo);
                }
            } else if (plan.viaje.nuevo_estado === 'terminado') {
                camposExtra.push(`fecha_completado = NOW()`);
            } else if (plan.viaje.nuevo_estado === 'cancelado_chofer' && plan.viaje.motivo_rechazo) {
                camposExtra.push(`motivo_rechazo = $${p++}`);
                valoresExtra.push(plan.viaje.motivo_rechazo);
            }
            const setExtra = camposExtra.length ? `, ${camposExtra.join(', ')}` : '';
            await client.query(
                `UPDATE viajes
                 SET estado_id = $1${setExtra}
                 WHERE id = $2`,
                [nuevoEstadoId, id, ...valoresExtra]
            );
        }

        // Aplicar cambio de estado de la parada (si hay) + historial
        if (plan.parada) {
            const nepRes = await client.query(
                `SELECT id FROM estados_parada WHERE codigo = $1 AND tipo = $2`,
                [plan.parada.nuevo_estado, plan.parada.tipo]
            );
            const nuevoEstadoParadaId = nepRes.rows[0]?.id;
            const paradaActual = paradas.find(p => p.id === plan.parada.id);

            await client.query(
                `INSERT INTO estados_parada_historial
                    (parada_id, estado_anterior_id, estado_nuevo_id,
                     usuario_id, usuario_nombre, notas, gps_lat, gps_lng)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    plan.parada.id, paradaActual?.estado_id || null, nuevoEstadoParadaId,
                    req.userId, req.userName, notas, lat, lng,
                ]
            );

            const sets = [`estado_id = $1`];
            const params = [nuevoEstadoParadaId];
            let pp = 2;
            if (plan.parada.nuevo_estado === 'llegado') {
                sets.push(`fecha_llegada = NOW()`);
            } else if (plan.parada.nuevo_estado === 'completado') {
                sets.push(`fecha_completado = NOW()`);
            }
            params.push(plan.parada.id);
            await client.query(
                `UPDATE viajes_paradas SET ${sets.join(', ')} WHERE id = $${pp + 1}`,
                params
            );
        }

        await client.query('COMMIT');

        return ok(res, { plan }, 'Comando aplicado');
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        return serverError(res, err);
    } finally {
        client.release();
    }
});


module.exports = router;
