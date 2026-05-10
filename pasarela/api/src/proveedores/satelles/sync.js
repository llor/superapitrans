/**
 * Sincronizador Satelles. Por cada credencial activa de Satelles:
 *   1) GET /puba/routes/finished
 *   2) Por cada publicación: mapear y persistir (UPSERT por
 *      proveedor_publication_id) en la BBDD del tenant.
 *   3) POST /routes/finished/commit con los publicationIds que han pasado
 *      OK por nuestra BD.
 *
 * Para boceto, la BBDD del tenant DEBE existir con la migración 0002_tenant
 * aplicada. Si no, log de error y se salta esa empresa.
 */

const { getTenantPool } = require('../../db');
const { listCredencialesActivas, marcarSync } = require('../../auth/provider-cred');
const { getFinishedRoutes, commitFinishedRoutes } = require('./client');
const { mapPublication, PROVEEDOR } = require('./mapper');

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

async function upsertAlbaran(pool, pedidoId, alb) {
    const sql = `
        INSERT INTO albaranes
            (pedido_id, numero, fecha, lugar_carga_codigo, unidad_medida,
             proveedor_codigo, proveedor_albaran_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (proveedor_codigo, proveedor_albaran_id)
        WHERE proveedor_albaran_id IS NOT NULL
        DO UPDATE SET pedido_id = EXCLUDED.pedido_id,
                      numero = EXCLUDED.numero,
                      fecha = EXCLUDED.fecha,
                      lugar_carga_codigo = EXCLUDED.lugar_carga_codigo,
                      unidad_medida = EXCLUDED.unidad_medida,
                      updated_at = NOW()
        RETURNING id, proveedor_albaran_id
    `;
    const r = await pool.query(sql, [
        pedidoId, alb.numero, alb.fecha, alb.lugar_carga_codigo, alb.unidad_medida,
        alb.proveedor_codigo, alb.proveedor_albaran_id,
    ]);
    return r.rows[0];
}

async function insertParada(pool, pedidoId, albaranIdsBySatellesId, parada) {
    const albaranId = parada.albaran_satelles_id
        ? (albaranIdsBySatellesId.get(parada.albaran_satelles_id) || null)
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
    log(`[satelles] sync empresa=${cred.empresaCodigo} entorno=${cred.entorno}`);
    const tenantPool = getTenantPool(cred.empresaCodigo);

    let publications = [];
    try {
        publications = await getFinishedRoutes(cred);
    } catch (err) {
        await marcarSync({ credencialId: cred.credencialId, ok: false, error: err.message });
        log(`[satelles] empresa=${cred.empresaCodigo} ERROR ${err.message}`);
        return { ok: false, error: err.message };
    }

    if (!Array.isArray(publications) || publications.length === 0) {
        await marcarSync({ credencialId: cred.credencialId, ok: true, error: null });
        log(`[satelles] empresa=${cred.empresaCodigo} sin rutas pendientes`);
        return { ok: true, processed: 0 };
    }

    const procesadasOk = [];
    for (const pub of publications) {
        try {
            const { pedido, albaranes, paradas } = mapPublication(pub, {
                tenantCodigo: cred.empresaCodigo,
                tenantCif: null,    // empresas.cif si quisiéramos (pendiente: lookup)
            });

            await tenantPool.query('BEGIN');
            const pedidoId = await upsertPedido(tenantPool, pedido);

            // Borrar paradas antiguas del pedido para reescribirlas (idempotente)
            await tenantPool.query('DELETE FROM paradas WHERE pedido_id = $1', [pedidoId]);

            const idsAlbaran = new Map();
            for (const alb of albaranes) {
                const r = await upsertAlbaran(tenantPool, pedidoId, alb);
                idsAlbaran.set(r.proveedor_albaran_id, r.id);
            }
            for (const p of paradas) {
                await insertParada(tenantPool, pedidoId, idsAlbaran, p);
            }
            await tenantPool.query('COMMIT');
            procesadasOk.push(pub.id);
        } catch (err) {
            try { await tenantPool.query('ROLLBACK'); } catch (_) { /* ignorar */ }
            log(`[satelles] empresa=${cred.empresaCodigo} pub=${pub.id} ERROR ${err.message}`);
        }
    }

    // Commit en Satelles solo de las que han pasado por BD OK.
    // PASARELA_DRY_RUN=true salta el commit: las publicaciones quedan en
    // la cola de Satelles y se pueden volver a descargar. Útil para
    // verificar mapeos sin perder la cola de pruebas.
    const dryRun = process.env.PASARELA_DRY_RUN === 'true';
    let committed = 0;
    if (procesadasOk.length && !dryRun) {
        try {
            await commitFinishedRoutes(cred, procesadasOk);
            committed = procesadasOk.length;
        } catch (err) {
            log(`[satelles] empresa=${cred.empresaCodigo} commit ERROR ${err.message}`);
        }
    } else if (procesadasOk.length && dryRun) {
        log(`[satelles] empresa=${cred.empresaCodigo} DRY_RUN: omitido commit de ${procesadasOk.length} publicaciones`);
    }

    await marcarSync({ credencialId: cred.credencialId, ok: true, error: null });
    log(`[satelles] empresa=${cred.empresaCodigo} procesadas=${procesadasOk.length} commit=${committed}`);
    return { ok: true, processed: procesadasOk.length, committed };
}

async function syncAll(log = console.log) {
    const credenciales = (await listCredencialesActivas())
        .filter((c) => c.proveedorCodigo === PROVEEDOR);
    if (credenciales.length === 0) {
        log('[satelles] sin credenciales activas');
        return { ok: true, processed: 0 };
    }
    let total = 0;
    for (const cred of credenciales) {
        const r = await syncCredencial(cred, log);
        if (r.ok && r.processed) total += r.processed;
    }
    return { ok: true, totalProcesadas: total };
}

module.exports = { syncAll, syncCredencial };
