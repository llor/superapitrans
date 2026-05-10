/**
 * Endpoints del "panel del jefe" del tenant chofocles.
 *
 * Solo accesible por usuarios con rol 'admin' del tenant. Permiten gestionar
 * el orden de reasignación de los choferes, sus vacaciones y los días de la
 * semana en los que están disponibles.
 *
 *   GET    /api/jefe/choferes
 *   PUT    /api/jefe/choferes/:usuarioId/orden
 *
 * Forma del payload de PUT:
 *   { orden: 0|1|..., timeout_aceptacion_min: 30,
 *     vacaciones_inicio: "2026-08-01", vacaciones_fin: "2026-08-15",
 *     dias_disponibles: {"1":true,"2":true,...,"7":false},
 *     activo: true }
 */

const express = require('express');
const { getTenantPool } = require('../db');
const { authMiddleware } = require('../auth/middleware');

const router = express.Router();

const soloJefe = authMiddleware({ roles: ['admin'] });

router.get('/choferes', soloJefe, async (req, res) => {
    try {
        const pool = getTenantPool(req.empresaCodigo);
        const r = await pool.query(`
            SELECT u.id, u.login, u.nombre, u.apellidos, u.email, u.telefono,
                   u.activo,
                   COALESCE(co.orden, 100)                AS orden,
                   co.timeout_aceptacion_min,
                   co.vacaciones_inicio,
                   co.vacaciones_fin,
                   COALESCE(co.dias_disponibles, '{"1":true,"2":true,"3":true,"4":true,"5":true,"6":true,"7":true}'::jsonb) AS dias_disponibles,
                   COALESCE(co.activo, TRUE)              AS reasignacion_activa
              FROM usuarios u
              JOIN roles r ON r.id = u.rol_id
              LEFT JOIN chofocles_choferes_orden co ON co.usuario_id = u.id
             WHERE u.deleted_at IS NULL AND r.codigo = 'chofer'
             ORDER BY orden ASC, u.login ASC
        `);
        res.json({ ok: true, data: { choferes: r.rows } });
    } catch (e) {
        console.error('[jefe/choferes]', e);
        res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

router.put('/choferes/:usuarioId/orden', soloJefe, async (req, res) => {
    const usuarioId = parseInt(req.params.usuarioId, 10);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({ ok: false, error: 'usuarioId inválido' });
    }
    const {
        orden, timeout_aceptacion_min,
        vacaciones_inicio, vacaciones_fin,
        dias_disponibles, activo,
    } = req.body || {};

    try {
        const pool = getTenantPool(req.empresaCodigo);
        const r = await pool.query(`
            INSERT INTO chofocles_choferes_orden
                (usuario_id, orden, timeout_aceptacion_min,
                 vacaciones_inicio, vacaciones_fin, dias_disponibles, activo)
            VALUES ($1, COALESCE($2, 100), $3, $4, $5,
                    COALESCE($6::jsonb, '{"1":true,"2":true,"3":true,"4":true,"5":true,"6":true,"7":true}'::jsonb),
                    COALESCE($7, TRUE))
            ON CONFLICT (usuario_id) DO UPDATE
               SET orden                  = COALESCE($2, chofocles_choferes_orden.orden),
                   timeout_aceptacion_min = $3,
                   vacaciones_inicio      = $4,
                   vacaciones_fin         = $5,
                   dias_disponibles       = COALESCE($6::jsonb, chofocles_choferes_orden.dias_disponibles),
                   activo                 = COALESCE($7, chofocles_choferes_orden.activo),
                   updated_at             = NOW()
            RETURNING *
        `, [
            usuarioId,
            orden ?? null,
            timeout_aceptacion_min ?? null,
            vacaciones_inicio ?? null,
            vacaciones_fin ?? null,
            dias_disponibles ? JSON.stringify(dias_disponibles) : null,
            activo ?? null,
        ]);
        res.json({ ok: true, data: r.rows[0] });
    } catch (e) {
        console.error('[jefe/choferes PUT]', e);
        res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

module.exports = router;
