/**
 * /datos — endpoints inbound sobre las 4 tablas canónicas del tenant.
 *
 * Patrón: el tenant lo determina la API key del cliente
 * (req.client.empresaCodigo). El cliente nunca elige tenant; va al suyo.
 *
 * Boceto: GET pedidos (listado paginado) y GET pedidos/:id (detalle con
 * albaranes + paradas + facturas). POST pedidos para insertar manualmente
 * o desde clientes externos.
 */

const { Router } = require('express');
const { getTenantPool } = require('../db');
const { requireKey } = require('../auth/client-key');

const router = Router();

router.get('/pedidos', requireKey(['datos.read']), async (req, res, next) => {
    try {
        const pool = getTenantPool(req.client.empresaCodigo);
        const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
        const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
        const estado = req.query.estado || null;
        const params = [];
        let where = '';
        if (estado) {
            params.push(estado);
            where = `WHERE estado = $${params.length}`;
        }
        params.push(limit, offset);
        const sql = `
            SELECT * FROM pedidos
            ${where}
            ORDER BY id DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `;
        const r = await pool.query(sql, params);
        res.json({ ok: true, data: { pedidos: r.rows, count: r.rowCount } });
    } catch (err) {
        next(err);
    }
});

router.get('/pedidos/:id', requireKey(['datos.read']), async (req, res, next) => {
    try {
        const pool = getTenantPool(req.client.empresaCodigo);
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(id)) {
            res.locals.errorCode = 'id_invalido';
            return res.status(400).json({ ok: false, error: 'id_invalido' });
        }
        const [pedido, albaranes, paradas, facturas, pcsExtra] = await Promise.all([
            pool.query('SELECT * FROM pedidos WHERE id = $1', [id]),
            pool.query('SELECT * FROM albaranes WHERE pedido_id = $1 ORDER BY id', [id]),
            pool.query('SELECT * FROM paradas WHERE pedido_id = $1 ORDER BY secuencia, id', [id]),
            pool.query('SELECT * FROM facturas WHERE pedido_id = $1 ORDER BY id', [id]),
            pool.query('SELECT * FROM pedidos_pcs_extra WHERE pedido_id = $1', [id]),
        ]);
        if (pedido.rowCount === 0) {
            res.locals.errorCode = 'no_encontrado';
            return res.status(404).json({ ok: false, error: 'no_encontrado' });
        }
        res.json({
            ok: true,
            data: {
                pedido: pedido.rows[0],
                albaranes: albaranes.rows,
                paradas: paradas.rows,
                facturas: facturas.rows,
                // Detalle marítimo del PCS Valencia (1:1 con pedido). Solo
                // se rellena cuando el pedido proviene de PCS; con Satelles
                // u otros proveedores queda null.
                pcs_extra: pcsExtra.rowCount > 0 ? pcsExtra.rows[0] : null,
            },
        });
    } catch (err) {
        next(err);
    }
});

// Estados válidos por orden semántico: el ERP los marca a medida que avanza
// el ciclo de un pedido (catálogo cerrado, mismo CHECK que la BD).
const ESTADOS_VALIDOS = ['PENDIENTE', 'LEIDO', 'ACEPTADO', 'INICIADO', 'TERMINADO'];

router.patch('/pedidos/:id/estado',
    requireKey(['datos.write']),
    async (req, res, next) => {
        try {
            const pool = getTenantPool(req.client.empresaCodigo);
            const id = Number.parseInt(req.params.id, 10);
            if (!Number.isFinite(id)) {
                res.locals.errorCode = 'id_invalido';
                return res.status(400).json({ ok: false, error: 'id_invalido' });
            }
            const nuevoEstado = String(req.body?.estado || '').toUpperCase().trim();
            if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
                res.locals.errorCode = 'estado_invalido';
                return res.status(400).json({
                    ok: false,
                    error: 'estado_invalido',
                    estados_validos: ESTADOS_VALIDOS,
                });
            }
            const r = await pool.query(
                `UPDATE pedidos SET estado = $1, updated_at = NOW()
                 WHERE id = $2
                 RETURNING id, estado`,
                [nuevoEstado, id]
            );
            if (r.rowCount === 0) {
                res.locals.errorCode = 'no_encontrado';
                return res.status(404).json({ ok: false, error: 'no_encontrado' });
            }
            res.json({ ok: true, data: r.rows[0] });
        } catch (err) {
            next(err);
        }
    }
);

// Compatibilidad: el endpoint viejo "marcar-procesado" ahora marca como
// TERMINADO (era su semántica real). Cualquier integración antigua del ERP
// sigue funcionando sin tocar su código.
router.post('/pedidos/:id/marcar-procesado',
    requireKey(['datos.write']),
    async (req, res, next) => {
        try {
            const pool = getTenantPool(req.client.empresaCodigo);
            const id = Number.parseInt(req.params.id, 10);
            if (!Number.isFinite(id)) {
                res.locals.errorCode = 'id_invalido';
                return res.status(400).json({ ok: false, error: 'id_invalido' });
            }
            const r = await pool.query(
                `UPDATE pedidos SET estado = 'TERMINADO', updated_at = NOW()
                 WHERE id = $1 AND estado <> 'TERMINADO'
                 RETURNING id, estado`,
                [id]
            );
            if (r.rowCount === 0) {
                res.locals.errorCode = 'no_encontrado_o_ya_terminado';
                return res.status(404).json({ ok: false, error: 'no_encontrado_o_ya_terminado' });
            }
            res.json({ ok: true, data: r.rows[0], deprecated: 'use PATCH /pedidos/:id/estado' });
        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;
