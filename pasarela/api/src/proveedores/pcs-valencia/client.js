/**
 * Cliente HTTP de PCS ValenciaportPCS — REST.
 *
 * Auth: OAuth2 client_credentials. POST {token_url}
 *   body=grant_type=client_credentials&client_id=...&client_secret=...
 *   → { access_token, token_type:'Bearer' }
 *
 * Endpoints REST de mensajería (sobre {api_base}):
 *   GET  /messages/download/{box}        listado de mensajes pendientes
 *   GET  /messages/download/{box}/{id}   XML del mensaje (text/xml o text/plain)
 *   POST /messages/upload/{box}          outbound (Acknowledgement, InlandTransportDetails)
 *
 * Las credenciales descifradas que recibe esta capa traen los campos
 *   { client_id, client_secret, token_url, api_base }
 * más, vía `cred.hostBase`, el host_base del catálogo del proveedor
 * (no se usa, sigue por compatibilidad con el patrón Satelles).
 */

const tokenCache = new Map(); // key: token_url + client_id → { token, expiresAt }
const DEFAULT_BOX = 'default';

function cacheKey(tokenUrl, clientId) {
    return `${tokenUrl}::${clientId}`;
}

async function obtenerToken({ tokenUrl, clientId, clientSecret }) {
    const now = Date.now();
    const cached = tokenCache.get(cacheKey(tokenUrl, clientId));
    if (cached && cached.expiresAt > now + 30_000) {
        return cached.token;
    }
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
    }).toString();
    const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`pcs-valencia token failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.access_token) {
        throw new Error('pcs-valencia respuesta sin access_token');
    }
    // PCS no devuelve expires_in en la prueba del 2026-05-12; asumimos 3600s
    // y restamos 60s de colchón. Si en algún momento empieza a devolverlo,
    // honramos su valor.
    const ttlMs = ((data.expires_in || 3600) - 60) * 1000;
    tokenCache.set(cacheKey(tokenUrl, clientId), {
        token: data.access_token,
        expiresAt: now + ttlMs,
    });
    return data.access_token;
}

async function _fetchConBearer(cred, urlPath, opts = {}) {
    const apiBase = String(cred.api_base || '').replace(/\/$/, '');
    if (!apiBase) throw new Error('pcs-valencia: api_base vacío en la credencial');
    const url = `${apiBase}${urlPath}`;
    const headers = {
        Accept: opts.accept || 'application/json',
        ...(opts.headers || {}),
    };

    const doRequest = async (token) => fetch(url, {
        method: opts.method || 'GET',
        headers: { ...headers, Authorization: `Bearer ${token}` },
        body: opts.body,
    });

    let token = await obtenerToken({
        tokenUrl: cred.token_url,
        clientId: cred.client_id,
        clientSecret: cred.client_secret,
    });
    let res = await doRequest(token);
    if (res.status === 401) {
        // Token caducado / inválido. Reintentar una vez tras refrescar.
        tokenCache.delete(cacheKey(cred.token_url, cred.client_id));
        token = await obtenerToken({
            tokenUrl: cred.token_url,
            clientId: cred.client_id,
            clientSecret: cred.client_secret,
        });
        res = await doRequest(token);
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`pcs-valencia ${opts.method || 'GET'} ${urlPath}: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return res;
}

// Lista de mensajes pendientes en la bandeja. Box por defecto = 'default'.
async function listMessages(cred, box = DEFAULT_BOX) {
    const res = await _fetchConBearer(cred, `/messages/download/${encodeURIComponent(box)}`, {
        accept: 'application/json',
    });
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
}

// Descarga el XML de un mensaje concreto.
async function downloadMessage(cred, id, box = DEFAULT_BOX) {
    const res = await _fetchConBearer(cred,
        `/messages/download/${encodeURIComponent(box)}/${encodeURIComponent(id)}`,
        { accept: 'application/xml, text/xml, */*' }
    );
    return res.text();
}

// Marca un mensaje como descargado para que NO vuelva a salir en la próxima
// llamada a listMessages (= "ACK" de PCS Valencia). Según el Swagger oficial:
//   DELETE /messages/download/{box}/{id}  →  202 Accepted (idempotente: 202
//   también si ya estaba marcado). El mensaje se puede seguir descargando
//   individualmente durante un tiempo; pasado ese plazo el portal lo borra
//   definitivamente. `box` debe ser el MISMO usado al descargar.
//
// 404 = "Message not found" según Swagger: el portal ya lo eliminó por el
// plazo de gracia y no hay nada que ack-ear. Funcionalmente equivale a OK
// para nuestro flujo (ya no volverá a salir en la lista), así que se trata
// como éxito en vez de propagar excepción.
async function deleteMessage(cred, id, box = DEFAULT_BOX) {
    try {
        await _fetchConBearer(cred,
            `/messages/download/${encodeURIComponent(box)}/${encodeURIComponent(id)}`,
            { method: 'DELETE', accept: 'application/json, */*' }
        );
    } catch (err) {
        if (/HTTP 404/.test(err.message || '')) return; // ya borrado en el portal
        throw err;
    }
}

// Outbound (placeholder): cuando arranquemos a emitir
// InlandTransportDetailsv2 / Acknowledgement habrá que confirmar formato
// exacto. Lo dejo cableado pero NO se invoca todavía desde el sync.
async function uploadMessage(cred, xmlBody, box = DEFAULT_BOX) {
    if (!xmlBody || typeof xmlBody !== 'string') {
        throw new Error('pcs-valencia upload: xmlBody requerido');
    }
    const res = await _fetchConBearer(cred,
        `/messages/upload/${encodeURIComponent(box)}`,
        {
            method: 'POST',
            accept: 'application/json',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlBody,
        }
    );
    return res.json().catch(() => ({ ok: true }));
}

module.exports = {
    DEFAULT_BOX,
    obtenerToken,
    listMessages,
    downloadMessage,
    deleteMessage,
    uploadMessage,
    _internal: { tokenCache, cacheKey },
};
