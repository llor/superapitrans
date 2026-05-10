/**
 * Mapeo PCS ValenciaportPCS ↔ tablas canónicas de la pasarela — STUB.
 *
 * Mensajes a soportar (perfil "transportista" de Jasaro, confirmado por
 * Arantxa Nebot — ver TODO de superapitrans):
 *
 *   INBOUND (recibimos del PCS):
 *     - DUT                     → instrucciones + actualizaciones
 *     - ReleaseOrder            → orden de release
 *     - AcceptanceOrder         → orden de aceptación
 *     - Acknowledgment          → acuse general
 *     - AcceptanceConfirmation  → confirmación de aceptación
 *     - ReleaseConfirmation     → confirmación de release
 *
 *   OUTBOUND (enviamos al PCS):
 *     - InlandTransportDetails  → asignación de datos del transporte
 *                                 (matrícula tractor / remolque / chofer
 *                                 / hora) cuando se conoce.
 *
 * Salida prevista (igual que satelles/mapper.js):
 *   { pedido, albaranes[], paradas[] } listo para INSERT/UPSERT en la
 *   BBDD del tenant `saycu_pasarela_<CODIGO>`.
 *
 * Ver README.md de esta carpeta.
 */

const PROVEEDOR = 'pcs-valencia';

function mapInboundMessage(/* mensaje, { tenantCodigo } */) {
    throw new Error('pcs-valencia.mapper: pendiente swagger. Ver README.md.');
}

function buildInlandTransportDetails(/* pedido, parada */) {
    throw new Error('pcs-valencia.mapper: pendiente swagger. Ver README.md.');
}

module.exports = {
    PROVEEDOR,
    mapInboundMessage,
    buildInlandTransportDetails,
};
