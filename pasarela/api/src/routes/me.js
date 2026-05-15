/**
 * pasarela — endpoints "/me" para el PANEL WEB del N2.
 *
 * El usuario está autenticado por JWT (Authorization: Bearer …). La empresa
 * se determina por `req.user.empresa_codigo`: el panel nunca elige tenant,
 * va al suyo (admin global puede llegar marcando empresa al loguearse).
 *
 * Clona la lógica de admin.saycusoft.es/backend/src/routes/pasarela-datos.js
 * (listado + detalle) pero forzando la empresa del token.
 *
 * Endpoints:
 *   GET /api/me/pedidos              listado paginado con filtros
 *   GET /api/me/pedidos/:id          detalle (pedido + paradas + albaranes + pcs_extra)
 */

const { Router } = require('express');
const { getAdminPool, getTenantPool } = require('../db');
const { requireUser } = require('../auth/user-jwt');

const router = Router();

router.use(requireUser);

async function ensureEmpresaConPasarela(empresaCodigo) {
    if (!empresaCodigo) {
        const err = new Error('empresa no determinada en el token');
        err.status = 401;
        throw err;
    }
    const r = await getAdminPool().query(
        `SELECT codigo, nombre, servicios::text[] AS servicios
           FROM empresas
          WHERE UPPER(codigo) = UPPER($1)
            AND activo = TRUE`,
        [empresaCodigo]
    );
    if (!r.rowCount) {
        const err = new Error('empresa no encontrada');
        err.status = 404;
        throw err;
    }
    const emp = r.rows[0];
    if (!emp.servicios.includes('pasarela')) {
        const err = new Error('la empresa no tiene el servicio pasarela activo');
        err.status = 400;
        throw err;
    }
    return emp;
}

router.get('/pedidos', async (req, res, next) => {
    try {
        const empresa = await ensureEmpresaConPasarela(req.user.empresa_codigo);
        const pool = getTenantPool(empresa.codigo);

        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const whereParts = [];
        const params = [];

        const estado = String(req.query.estado || '').trim().toUpperCase();
        if (estado && estado !== 'TODOS') {
            // "TERMINADO" no es un valor de pedidos.estado (el CHECK acepta
            // PENDIENTE/PROCESADO). El visor usa la banda Terminado/Pendiente
            // según pedidos.tipo (ALBARAN/PEDIDO), así que cuando el filtro
            // pide "Terminados" lo mapeamos a `tipo = 'ALBARAN'`.
            if (estado === 'TERMINADO') {
                whereParts.push(`p.tipo = 'ALBARAN'`);
            } else {
                params.push(estado);
                whereParts.push(`p.estado = $${params.length}`);
            }
        }
        const proveedor = String(req.query.proveedor || '').trim();
        if (proveedor && proveedor !== 'todos') {
            params.push(proveedor);
            whereParts.push(`p.proveedor_codigo = $${params.length}`);
        }
        const cliente = String(req.query.cliente || '').trim();
        if (cliente && cliente !== 'todos') {
            params.push(cliente);
            whereParts.push(`p.tercero_codigo = $${params.length}`);
        }
        const delegacion = String(req.query.delegacion || '').trim();
        if (delegacion && delegacion !== 'todas') {
            params.push(delegacion);
            whereParts.push(`p.delegacion_codigo = $${params.length}`);
        }
        const q = String(req.query.q || '').trim();
        if (q) {
            params.push(`%${q}%`);
            const ph = `$${params.length}`;
            whereParts.push(`(
                p.numero_pedido ILIKE ${ph}
                OR p.id_ruta_externa ILIKE ${ph}
                OR p.cliente_codigo ILIKE ${ph}
                OR p.cliente_cif ILIKE ${ph}
                OR p.tercero_codigo ILIKE ${ph}
                OR p.tercero_cif ILIKE ${ph}
                OR p.delegacion_codigo ILIKE ${ph}
                OR p.matricula_tractor ILIKE ${ph}
                OR p.matricula_remolque ILIKE ${ph}
                OR p.matricula_contenedor ILIKE ${ph}
                OR p.chofer_principal_codigo ILIKE ${ph}
                OR p.chofer_principal_cif ILIKE ${ph}
                OR p.chofer_secundario_codigo ILIKE ${ph}
                OR p.chofer_secundario_cif ILIKE ${ph}
                OR p.proveedor_codigo ILIKE ${ph}
                OR p.albaranes_concatenados ILIKE ${ph}
                OR p.bl_numero ILIKE ${ph}
                OR p.expediente_transitario ILIKE ${ph}
                OR p.operacion_tipo ILIKE ${ph}
                OR p.naviera_codigo ILIKE ${ph}
                OR p.naviera_nombre ILIKE ${ph}
                OR p.buque_nombre ILIKE ${ph}
                OR p.viaje_buque ILIKE ${ph}
            )`);
        }

        const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const sortableFields = new Set([
            'fecha_reparto', 'fecha_plan', 'created_at', 'numero_pedido',
            'estado', 'tipo', 'cliente_codigo', 'proveedor_codigo',
            'delegacion_codigo', 'tercero_codigo', 'matricula_tractor',
            'id_viaje', 'id_ruta_externa', 'bl_numero', 'expediente_transitario',
        ]);
        const sortByRaw = String(req.query.sortBy || 'fecha_reparto');
        const sortBy = sortableFields.has(sortByRaw) ? sortByRaw : 'fecha_reparto';
        const sortOrder = String(req.query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM pedidos p ${whereSql}`,
            params
        );
        const total = countResult.rows[0]?.total || 0;

        const dataResult = await pool.query(
            `SELECT
                 p.id, p.id_viaje, p.id_ruta_externa,
                 p.cliente_codigo, p.cliente_cif, p.delegacion_codigo,
                 p.tercero_codigo, p.tercero_cif,
                 p.numero_pedido, p.albaranes_concatenados,
                 p.matricula_tractor, p.matricula_remolque,
                 p.chofer_principal_codigo, p.chofer_principal_cif,
                 p.tipo, p.estado, p.fecha_plan, p.fecha_reparto,
                 p.origen, p.proveedor_codigo, p.proveedor_publication_id,
                 p.created_at, p.updated_at,
                 COALESCE((SELECT COUNT(*)::int FROM paradas WHERE pedido_id = p.id), 0) AS paradas_count,
                 COALESCE((SELECT COUNT(*)::int FROM albaranes WHERE pedido_id = p.id), 0) AS albaranes_count,
                 -- "Dónde" del listado: COALESCE(municipio, lugar_nombre) porque
                 -- algunos proveedores (Satelles) no entregan municipio discreto
                 -- y todo el "dónde" cae en lugar_nombre. La canónica sigue
                 -- siendo una sola tabla; el visor compone el mejor texto disponible.
                 (SELECT COALESCE(municipio, lugar_nombre) FROM paradas
                   WHERE pedido_id = p.id AND tipo = 'CARGA'
                   ORDER BY secuencia NULLS LAST, orden, id LIMIT 1) AS origen_municipio,
                 (SELECT COALESCE(municipio, lugar_nombre) FROM paradas
                   WHERE pedido_id = p.id AND tipo = 'DESCARGA'
                   ORDER BY secuencia DESC NULLS LAST, orden DESC, id DESC LIMIT 1) AS destino_municipio
             FROM pedidos p
             ${whereSql}
             ORDER BY p.${sortBy} ${sortOrder} NULLS LAST, p.id DESC
             LIMIT $${params.length + 1}
             OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        return res.json({
            ok: true,
            success: true,
            data: dataResult.rows,
            pagination: {
                page, limit, total,
                totalPages: Math.ceil(total / limit) || 0,
            },
            empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
        next(err);
    }
});

router.get('/pedidos/:id', async (req, res, next) => {
    try {
        const empresa = await ensureEmpresaConPasarela(req.user.empresa_codigo);
        const pool = getTenantPool(empresa.codigo);
        const pedidoId = Number.parseInt(req.params.id, 10);
        if (!Number.isFinite(pedidoId)) {
            return res.status(400).json({ ok: false, error: 'id_invalido' });
        }

        const pedRes = await pool.query(`SELECT * FROM pedidos WHERE id = $1`, [pedidoId]);
        if (!pedRes.rowCount) return res.status(404).json({ ok: false, error: 'no_encontrado' });
        const pedido = pedRes.rows[0];

        const [paradasRes, albaranesRes] = await Promise.all([
            pool.query(
                `SELECT * FROM paradas WHERE pedido_id = $1
                  ORDER BY CASE WHEN orden = 'ORIGEN' THEN 1 WHEN orden = 'DESTINO' THEN 2 ELSE 3 END, id`,
                [pedidoId]
            ),
            pool.query(
                `SELECT * FROM albaranes WHERE pedido_id = $1 ORDER BY fecha NULLS LAST, id`,
                [pedidoId]
            ),
        ]);

        // Detalle marítimo PCS Valencia (1:1 con pedidos). Tolera ausencia
        // de la tabla en tenants donde no se aplicó la migración 0010.
        let pcsExtra = null;
        try {
            const r = await pool.query('SELECT * FROM pedidos_pcs_extra WHERE pedido_id = $1', [pedidoId]);
            pcsExtra = r.rowCount > 0 ? r.rows[0] : null;
        } catch (err) {
            if (!err || err.code !== '42P01') throw err;
        }

        return res.json({
            ok: true,
            success: true,
            data: {
                pedido,
                paradas: paradasRes.rows,
                albaranes: albaranesRes.rows,
                pcs_extra: pcsExtra,
            },
            empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
        });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
        next(err);
    }
});

module.exports = router;
