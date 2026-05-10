/**
 * Sincronizador PCS ValenciaportPCS — STUB.
 *
 * Cuando esté implementado, espejo del patrón de satelles/sync.js:
 *
 *   syncAll():
 *     Por cada credencial activa de pcs-valencia (`listCredencialesActivas`
 *     filtrando proveedorCodigo === PROVEEDOR):
 *       1) getMessages() para cada tipo inbound (DUT, ReleaseOrder, ...).
 *       2) Por cada mensaje: mapInboundMessage → upsert en tablas
 *          canónicas del tenant (idempotente por proveedor + message id).
 *       3) acknowledgeMessages(ids) solo de las que han pasado por BD OK
 *          (omitir si PASARELA_DRY_RUN === 'true').
 *
 * Ver README.md de esta carpeta.
 */

const { PROVEEDOR } = require('./mapper');

async function syncAll(log = console.log) {
    log(`[${PROVEEDOR}] sync omitido — pendiente swagger + credenciales. Ver proveedores/pcs-valencia/README.md.`);
    return { ok: true, processed: 0, pending: true };
}

module.exports = { PROVEEDOR, syncAll };
