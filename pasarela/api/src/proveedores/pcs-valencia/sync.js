/**
 * Sincronizador PCS ValenciaportPCS.
 *
 * Por cada credencial activa de `pcs-valencia`:
 *   1) GET /messages/download/{box}                 listado de pendientes.
 *   2) Por cada mensaje: GET /messages/download/{box}/{id} → XML → mapper.
 *   3) BEGIN/UPSERT pedido + albaranes + paradas/COMMIT en el tenant.
 *   4) [NO IMPLEMENTADO TODAVÍA] ack mediante POST /messages/upload/{box}
 *      con un Acknowledgement: requiere XSD/cuerpo confirmado por PCS.
 *      Mientras tanto el GET no consume el mensaje y la idempotencia por
 *      `(proveedor_codigo, proveedor_publication_id)` evita duplicados.
 *
 * PASARELA_DRY_RUN=true: lista + descarga + mapea pero NO toca la BD.
 * Útil para verificar el mapeo contra prod sin persistir.
 */

const { getTenantPool } = require('../../db');
const { listCredencialesActivas, marcarSync } = require('../../auth/provider-cred');
const { listMessages, downloadMessage } = require('./client');
const { mapMessage, PROVEEDOR } = require('./mapper');

async function upsertPedido(pool, pedido) {
    const cols = Object.keys(pedido);
    const values = cols.map((c) => pedido[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const updateSet = cols
        .filter((c) => c !== 'proveedor_codigo' && c !== 'proveedor_publication_id')
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');
    const sql = `
        INSERT INTO pedidos (${cols.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (proveedor_codigo, proveedor_publication_id)
        WHERE proveedor_publication_id IS NOT NULL
        DO UPDATE SET ${updateSet}, updated_at = NOW()
        RETURNING id
    `;
    const r = await pool.query(sql, values);
    return r.rows[0].id;
}

// 1:1 con `pedidos`. Persiste el detalle marítimo del PCS (mercancía,
// contenedor, precinto, puertos, etc.) que llega en el XML pero no encaja
// en el modelo canónico común con Satelles. Si `pcsExtra` es null (mensaje
// que no aporta extras, p.ej. Confirmations cortas) se borra cualquier
// fila previa para no quedar con datos viejos.
async function upsertPedidoExtra(pool, pedidoId, pcsExtra) {
    if (!pcsExtra) {
        await pool.query('DELETE FROM pedidos_pcs_extra WHERE pedido_id = $1', [pedidoId]);
        return;
    }
    const cols = ['pedido_id', ...Object.keys(pcsExtra)];
    const values = [pedidoId, ...Object.keys(pcsExtra).map((k) => pcsExtra[k])];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const updateSet = cols
        .filter((c) => c !== 'pedido_id')
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');
    const sql = `
        INSERT INTO pedidos_pcs_extra (${cols.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (pedido_id)
        DO UPDATE SET ${updateSet}, updated_at = NOW()
    `;
    await pool.query(sql, values);
}

async function upsertAlbaran(pool, pedidoId, alb) {
    const sql = `
        INSERT INTO albaranes
            (pedido_id, numero, fecha, lugar_carga_codigo, unidad_medida,
             proveedor_codigo, proveedor_albaran_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (proveedor_codigo, proveedor_albaran_id)
        WHERE proveedor_albaran_id IS NOT NULL
        DO UPDATE SET pedido_id          = EXCLUDED.pedido_id,
                      numero             = EXCLUDED.numero,
                      fecha              = EXCLUDED.fecha,
                      lugar_carga_codigo = EXCLUDED.lugar_carga_codigo,
                      unidad_medida      = EXCLUDED.unidad_medida,
                      updated_at         = NOW()
        RETURNING id, proveedor_albaran_id
    `;
    const r = await pool.query(sql, [
        pedidoId, alb.numero, alb.fecha, alb.lugar_carga_codigo, alb.unidad_medida,
        alb.proveedor_codigo, alb.proveedor_albaran_id,
    ]);
    return r.rows[0];
}

async function insertParada(pool, pedidoId, idsAlbaranPorPcsId, parada) {
    const albaranId = parada.albaran_proveedor_id
        ? (idsAlbaranPorPcsId.get(parada.albaran_proveedor_id) || null)
        : null;
    const cols = [
        'pedido_id', 'albaran_id', 'reparto_id_externo', 'tipo', 'orden',
        'secuencia', 'tipo_lugar', 'lugar_codigo', 'lugar_nombre',
        'direccion1', 'direccion2', 'codigo_postal', 'municipio', 'provincia',
        'pais', 'telefono', 'persona_contacto', 'latitud', 'longitud',
        'producto', 'cantidad', 'unidad_medida',
        'llegada_prevista', 'salida_prevista', 'llegada_real', 'salida_real',
        'kms_tramo',
    ];
    const vals = [
        pedidoId, albaranId, parada.reparto_id_externo, parada.tipo, parada.orden,
        parada.secuencia, parada.tipo_lugar, parada.lugar_codigo, parada.lugar_nombre,
        parada.direccion1, parada.direccion2, parada.codigo_postal, parada.municipio, parada.provincia,
        parada.pais, parada.telefono, parada.persona_contacto, parada.latitud, parada.longitud,
        parada.producto, parada.cantidad, parada.unidad_medida,
        parada.llegada_prevista, parada.salida_prevista, parada.llegada_real, parada.salida_real,
        parada.kms_tramo,
    ];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
        `INSERT INTO paradas (${cols.join(', ')}) VALUES (${placeholders})`,
        vals
    );
}

async function syncCredencial(cred, log) {
    log(`[${PROVEEDOR}] sync empresa=${cred.empresaCodigo} entorno=${cred.entorno}`);
    const tenantPool = getTenantPool(cred.empresaCodigo);

    let pendientes;
    try {
        pendientes = await listMessages(cred);
    } catch (err) {
        await marcarSync({ credencialId: cred.credencialId, ok: false, error: err.message });
        log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} list ERROR ${err.message}`);
        return { ok: false, error: err.message };
    }
    if (!Array.isArray(pendientes) || pendientes.length === 0) {
        await marcarSync({ credencialId: cred.credencialId, ok: true, error: null });
        log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} sin mensajes pendientes`);
        return { ok: true, processed: 0 };
    }

    const dryRun = process.env.PASARELA_DRY_RUN === 'true';
    log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} pendientes=${pendientes.length}${dryRun ? ' (DRY_RUN)' : ''}`);

    let procesadas = 0;
    let saltadas = 0;
    let errores = 0;
    for (const meta of pendientes) {
        try {
            const xml = await downloadMessage(cred, meta.id);
            const mapMeta = { ...meta, tenantCodigo: cred.empresaCodigo };
            const { pedido, albaranes, paradas, pcsExtra, _unhandled } = mapMessage(xml, mapMeta);

            if (_unhandled) {
                log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} ${meta.id} tipo=${meta.messageType} UNHANDLED (cabecera persistida sin paradas/albaranes)`);
            }
            if (dryRun) {
                saltadas++;
                continue;
            }

            await tenantPool.query('BEGIN');
            const pedidoId = await upsertPedido(tenantPool, pedido);
            await upsertPedidoExtra(tenantPool, pedidoId, pcsExtra);
            await tenantPool.query('DELETE FROM paradas WHERE pedido_id = $1', [pedidoId]);
            const idsAlbaranPorPcsId = new Map();
            for (const alb of albaranes) {
                const r = await upsertAlbaran(tenantPool, pedidoId, alb);
                idsAlbaranPorPcsId.set(r.proveedor_albaran_id, r.id);
            }
            for (const p of paradas) {
                await insertParada(tenantPool, pedidoId, idsAlbaranPorPcsId, p);
            }
            await tenantPool.query('COMMIT');
            procesadas++;
        } catch (err) {
            errores++;
            try { await tenantPool.query('ROLLBACK'); } catch (_) { /* ignorar */ }
            log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} ${meta.id} tipo=${meta.messageType} ERROR ${err.message}`);
        }
    }

    await marcarSync({ credencialId: cred.credencialId, ok: errores === 0, error: errores ? `${errores} errores` : null });
    log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} procesadas=${procesadas} saltadas=${saltadas} errores=${errores}`);
    return { ok: errores === 0, processed: procesadas, skipped: saltadas, errors: errores };
}

async function syncAll(log = console.log) {
    const credenciales = (await listCredencialesActivas())
        .filter((c) => c.proveedorCodigo === PROVEEDOR);
    if (credenciales.length === 0) {
        log(`[${PROVEEDOR}] sin credenciales activas`);
        return { ok: true, processed: 0 };
    }
    let total = 0;
    for (const cred of credenciales) {
        const r = await syncCredencial(cred, log);
        if (r.ok && r.processed) total += r.processed;
    }
    return { ok: true, totalProcesadas: total };
}

module.exports = { PROVEEDOR, syncAll, syncCredencial };
