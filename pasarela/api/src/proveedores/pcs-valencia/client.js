/**
 * Cliente HTTP de PCS ValenciaportPCS — STUB.
 *
 * Estado: esqueleto. La implementación real depende de:
 *   - Acceso al swagger autenticado (testapi.valenciaportpcs.net/messaging/swagger).
 *   - Credenciales reales del cliente guardadas en BD vía la UI.
 *
 * Estructura prevista (espejo de proveedores/satelles/client.js):
 *   - obtenerToken({apiBase, oauthUrl, user, pass}) → Bearer token cacheado.
 *   - getMessages(cred, tipoMensaje) → lista de mensajes pendientes inbound.
 *   - sendMessage(cred, mensaje) → POST de InlandTransportDetails outbound.
 *   - acknowledgeMessages(cred, ids) → confirma recepción tras persistir.
 *
 * Ver README.md de esta carpeta.
 */

const PROVEEDOR = 'pcs-valencia';

function notImplemented(operacion) {
    throw new Error(`pcs-valencia.${operacion}: pendiente swagger + credenciales activas. Ver README.md.`);
}

async function obtenerToken(/* { apiBase, oauthUrl, user, pass } */) {
    return notImplemented('obtenerToken');
}

async function getMessages(/* cred, tipoMensaje */) {
    return notImplemented('getMessages');
}

async function sendMessage(/* cred, mensaje */) {
    return notImplemented('sendMessage');
}

async function acknowledgeMessages(/* cred, ids */) {
    return notImplemented('acknowledgeMessages');
}

module.exports = {
    PROVEEDOR,
    obtenerToken,
    getMessages,
    sendMessage,
    acknowledgeMessages,
};
