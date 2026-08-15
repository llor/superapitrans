/**
 * Sincronizador PCS ValenciaportPCS.
 *
 * Por cada credencial activa de `pcs-valencia`:
 *   1) GET    /messages/download/{box}        listado de pendientes.
 *   2) Por cada mensaje: GET /messages/download/{box}/{id} → XML → mapper.
 *   3) BEGIN/UPSERT pedido + albaranes + paradas/COMMIT en el tenant.
 *   4) DELETE /messages/download/{box}/{id}   "ack" según Swagger oficial: el
 *      mensaje deja de salir en la siguiente call a List. Solo se invoca tras
 *      COMMIT correcto; los errores de mapeo/BD dejan el mensaje en cola para
 *      reintento. Idempotente (202 también si ya estaba marcado). Si el DELETE
 *      falla, se loguea y se sigue: la idempotencia por
 *      `(proveedor_codigo, proveedor_publication_id)` evita duplicados.
 *
 * PASARELA_DRY_RUN=true: lista + descarga + mapea pero NO toca la BD NI
 * borra el mensaje del portal. Útil para verificar el mapeo contra prod
 * sin persistir y sin consumir la cola.
 */

const { getTenantPool } = require('../../db');
const { listCredencialesActivas, marcarSync } = require('../../auth/provider-cred');
const { listMessages, downloadMessage, deleteMessage } = require('./client');
const { mapMessage, PROVEEDOR } = require('./mapper');
const errorReporter = require('../../utils/error-reporter-client');
const { crearRastreadorFallos } = require('../../utils/fallo-persistente');

// Anti-ruido (mismo criterio que satelles/sync.js): un fallo del cron solo se
// reporta al receptor si PERSISTE este nº de ciclos consecutivos; el 1er fallo
// aislado se queda en el log. Tres ámbitos por proceso:
//  - listado: el GET de pendientes falla (clave = credencialId).
//  - mensaje: un mensaje concreto falla al descargar/mapear/guardar
//    (clave = `${credencialId}:${msgId}`).
//  - ack: el DELETE de ack al portal falla (clave = credencialId).
const UMBRAL_CICLOS_FALLO = 2;
const fallosListado = crearRastreadorFallos(UMBRAL_CICLOS_FALLO);
const fallosMensaje = crearRastreadorFallos(UMBRAL_CICLOS_FALLO);
const fallosAck = crearRastreadorFallos(UMBRAL_CICLOS_FALLO);

// La racha del ack se cierra desde dos sitios (cola vacía, y ciclo con acks
// correctos) y los dos tienen que avisar de la recuperación igual: de ahí esta
// función, para que no se quede uno sin el aviso.
function cerrarRachaAck(cred, log) {
    const rec = fallosAck.ok(cred.credencialId);
    if (!rec.recuperado) return;
    log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} ack RECUPERADO tras ${rec.fallos} ciclos fallando`);
    errorReporter.reportRecovery({
        ...rec.payload,
        extra: { ...rec.payload.extra, ciclos_hasta_recuperar: rec.fallos },
    });
}

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
        const rec = fallosListado.ok(cred.credencialId);
        if (rec.recuperado) {
            log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} listado RECUPERADO tras ${rec.fallos} ciclos fallando`);
            errorReporter.reportRecovery({
                ...rec.payload,
                extra: { ...rec.payload.extra, ciclos_hasta_recuperar: rec.fallos },
            });
        }
    } catch (err) {
        await marcarSync({ credencialId: cred.credencialId, ok: false, error: err.message });
        log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} list ERROR ${err.message}`);
        // Anti-ruido: el 1er fallo solo va al log (un corte transitorio del
        // portal se cura al ciclo siguiente). Reportar solo si PERSISTE
        // UMBRAL_CICLOS_FALLO ciclos seguidos, una vez por racha.
        const l = fallosListado.fallo(cred.credencialId, (ciclos) => ({
            source: 'process',
            severity: 'error',
            message: `PCS Valencia: no se pudo listar mensajes (empresa ${cred.empresaCodigo}) de forma persistente (${ciclos} ciclos consecutivos): ${err.message}`,
            stack: err.stack,
            empresa_codigo: cred.empresaCodigo,
            extra: {
                proveedor: 'pcs-valencia',
                entorno: cred.entorno,
                host_base: cred.hostBase,
                funcion: 'syncCredencial -> listMessages',
                ciclos_consecutivos: ciclos,
            },
        }));
        if (l.reportar) {
            errorReporter.reportError(l.payload);
        }
        return { ok: false, error: err.message };
    }
    if (!Array.isArray(pendientes) || pendientes.length === 0) {
        await marcarSync({ credencialId: cred.credencialId, ok: true, error: null });
        // Cola vacía: ningún mensaje vivo y nada que ackear → cerrar rachas.
        fallosMensaje.purgar(`${cred.credencialId}:`, new Set());
        cerrarRachaAck(cred, log);
        log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} sin mensajes pendientes`);
        return { ok: true, processed: 0 };
    }

    const dryRun = process.env.PASARELA_DRY_RUN === 'true';
    log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} pendientes=${pendientes.length}${dryRun ? ' (DRY_RUN)' : ''}`);

    let procesadas = 0;
    let saltadas = 0;
    let errores = 0;
    let ackOk = 0;
    let ackErr = 0;
    const msgsVivos = new Set();
    for (const meta of pendientes) {
        const msgKey = `${cred.credencialId}:${meta.id}`;
        msgsVivos.add(msgKey);
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
            const rec = fallosMensaje.ok(msgKey);
            if (rec.recuperado) {
                log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} ${meta.id} RECUPERADO tras ${rec.fallos} ciclos fallando`);
                errorReporter.reportRecovery({
                    ...rec.payload,
                    extra: { ...rec.payload.extra, ciclos_hasta_recuperar: rec.fallos },
                });
            }
            // Ack al portal SOLO tras COMMIT correcto. Si falla el DELETE, no
            // pasa nada crítico: la idempotencia del upsert por
            // (proveedor_codigo, proveedor_publication_id) absorbe el reintento.
            try {
                await deleteMessage(cred, meta.id);
                ackOk++;
            } catch (ackError) {
                ackErr++;
                log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} ${meta.id} ACK ERROR ${ackError.message}`);
            }
        } catch (err) {
            errores++;
            try { await tenantPool.query('ROLLBACK'); } catch (_) { /* ignorar */ }
            log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} ${meta.id} tipo=${meta.messageType} ERROR ${err.message}`);
            // Anti-ruido (igual que satelles): un mensaje que falla al
            // descargar/mapear/guardar solo se reporta si PERSISTE varios
            // ciclos. Antes este catch era mudo.
            const m = fallosMensaje.fallo(msgKey, (ciclos) => ({
                source: 'process',
                severity: 'error',
                message: `PCS Valencia: el mensaje ${meta.id} (tipo ${meta.messageType}, empresa ${cred.empresaCodigo}) falla al procesarse de forma persistente (${ciclos} ciclos consecutivos): ${err.message}`,
                stack: err.stack,
                empresa_codigo: cred.empresaCodigo,
                extra: {
                    proveedor: 'pcs-valencia',
                    entorno: cred.entorno,
                    publication_id: meta.id,
                    message_type: meta.messageType,
                    funcion: 'syncCredencial -> procesar mensaje',
                    ciclos_consecutivos: ciclos,
                },
            }));
            if (m.reportar) {
                errorReporter.reportError(m.payload);
            }
        }
    }
    // Olvidar rachas de mensajes de ESTA credencial que ya no están en la cola
    // (procesados o retirados por el portal), para no acumular.
    fallosMensaje.purgar(`${cred.credencialId}:`, msgsVivos);
    // Ack al portal: reportar solo si los acks fallan de forma persistente (la
    // cola no se drena → se re-procesa lo mismo cada ciclo). Si no hubo intentos
    // (dry-run o todos los mensajes fallaron antes), no se toca la racha.
    if (ackErr > 0) {
        const a = fallosAck.fallo(cred.credencialId, (ciclos) => ({
            source: 'process',
            severity: 'error',
            message: `PCS Valencia: el ack (borrado) al portal (empresa ${cred.empresaCodigo}) falla de forma persistente: ${ackErr} de ${ackOk + ackErr} en el último ciclo, ${ciclos} ciclos seguidos con fallos.`,
            empresa_codigo: cred.empresaCodigo,
            extra: {
                proveedor: 'pcs-valencia',
                entorno: cred.entorno,
                host_base: cred.hostBase,
                funcion: 'syncCredencial -> deleteMessage (ack)',
                ack_err: ackErr,
                ack_ok: ackOk,
                ciclos_consecutivos: ciclos,
            },
        }));
        if (a.reportar) {
            errorReporter.reportError(a.payload);
        }
    } else if (ackOk > 0) {
        cerrarRachaAck(cred, log);
    }

    await marcarSync({ credencialId: cred.credencialId, ok: errores === 0, error: errores ? `${errores} errores` : null });
    log(`[${PROVEEDOR}] empresa=${cred.empresaCodigo} procesadas=${procesadas} saltadas=${saltadas} errores=${errores} ack_ok=${ackOk} ack_err=${ackErr}`);
    return { ok: errores === 0, processed: procesadas, skipped: saltadas, errors: errores, ackOk, ackErr };
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
