/**
 * Cliente HTTP de Satelles ERPSYNC.
 * - OAuth 2.0 client credentials (POST /identity/connect/token).
 * - Token cacheado en memoria por (hostBase, clientId, scope).
 *
 * Ver: documentos/Satelles - ERPSYNC Api.pdf
 *      documentos/Satelles API ERP SYNC (Ecotrans).postman_collection.json
 */

const SCOPE_FINISHED = 'satelles-publications:finished-routes';
// Recursos maestros editables del módulo ERPSYNC (drivers, vehicles,
// places, materials, …). Verificado en vivo el 2026-06-27 contra
// ecotrans.satelles.es: la credencial de GFE tiene este scope concedido y
// el servidor OAuth lo emite (también el GET de maestros lo exige; el de
// finished-routes es solo para la cola de publicaciones).
const SCOPE_ERPSYNC = 'satelles-erpsync:write';

// Caché de tokens en memoria. Clave: hostBase + clientId + scope.
const tokenCache = new Map();

function cacheKey(hostBase, clientId, scope) {
    return `${hostBase}::${clientId}::${scope}`;
}

async function obtenerToken({ hostBase, clientId, clientSecret, scope }) {
    const cached = tokenCache.get(cacheKey(hostBase, clientId, scope));
    const now = Date.now();
    if (cached && cached.expiresAt > now + 30_000) {
        return cached.token;
    }

    const url = `${hostBase.replace(/\/$/, '')}/identity/connect/token`;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'client_credentials', scope }).toString();

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basic}`,
            'Accept': 'application/json',
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Satelles token failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.access_token) {
        throw new Error('Satelles respuesta sin access_token');
    }
    const ttlMs = ((data.expires_in || 3600) - 60) * 1000;
    tokenCache.set(cacheKey(hostBase, clientId, scope), {
        token: data.access_token,
        expiresAt: now + ttlMs,
    });
    return data.access_token;
}

async function getFinishedRoutes(cred) {
    const token = await obtenerToken({
        hostBase: cred.hostBase,
        clientId: cred.client_id,
        clientSecret: cred.client_secret,
        scope: SCOPE_FINISHED,
    });
    const url = `${cred.hostBase.replace(/\/$/, '')}/puba/routes/finished`;
    const res = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Accept-Language': 'es',
            'Authorization': `Bearer ${token}`,
        },
    });
    if (res.status === 401) {
        // Token caducado o inválido — limpiar cache y reintentar 1 vez
        tokenCache.delete(cacheKey(cred.hostBase, cred.client_id, SCOPE_FINISHED));
        const t2 = await obtenerToken({
            hostBase: cred.hostBase,
            clientId: cred.client_id,
            clientSecret: cred.client_secret,
            scope: SCOPE_FINISHED,
        });
        const r2 = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'es',
                'Authorization': `Bearer ${t2}`,
            },
        });
        if (!r2.ok) {
            const text = await r2.text().catch(() => '');
            throw new Error(`Satelles finished failed: HTTP ${r2.status} ${text.slice(0, 200)}`);
        }
        return r2.json();
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Satelles finished failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return res.json();
}

async function commitFinishedRoutes(cred, publicationIds) {
    if (!Array.isArray(publicationIds) || publicationIds.length === 0) return { skipped: true };
    const token = await obtenerToken({
        hostBase: cred.hostBase,
        clientId: cred.client_id,
        clientSecret: cred.client_secret,
        scope: SCOPE_FINISHED,
    });
    const url = `${cred.hostBase.replace(/\/$/, '')}/puba/routes/finished/commit`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Accept-Language': 'es',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicationIds }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Satelles commit failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return { ok: true, count: publicationIds.length };
}

/**
 * Documentos asociados a los destinos de una ruta (albaranes/PDFs/imágenes
 * que el chofer ha cargado). Endpoint del Postman oficial:
 *
 *   GET {hostBase}/routes/{routeId}/destinations/documents
 *
 * El prefijo /puba/ se usa solo para los endpoints "public api" de
 * publicaciones (finished/commit). Para documentos el Postman usa el host
 * raíz. Si Satelles cambia a /puba/, el primer 404 se reintenta con prefijo.
 *
 * Devuelve el JSON que Satelles ofrezca tal cual — la forma exacta (URLs
 * descargables vs base64 vs metadatos) se conoce al probar contra una
 * credencial real, por eso aquí solo se proxea sin transformar.
 */
async function getDocumentosRuta(cred, routeId) {
    const token = await obtenerToken({
        hostBase: cred.hostBase,
        clientId: cred.client_id,
        clientSecret: cred.client_secret,
        scope: SCOPE_FINISHED,
    });
    const host = cred.hostBase.replace(/\/$/, '');
    const headers = {
        'Accept': 'application/json',
        'Accept-Language': 'es',
        'Authorization': `Bearer ${token}`,
    };
    const candidates = [
        `${host}/routes/${encodeURIComponent(routeId)}/destinations/documents`,
        `${host}/puba/routes/${encodeURIComponent(routeId)}/destinations/documents`,
    ];
    let last = null;
    for (const url of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(url, { headers });
        if (res.status === 404) { last = { status: 404, url }; continue; }
        if (!res.ok) {
            // eslint-disable-next-line no-await-in-loop
            const text = await res.text().catch(() => '');
            throw new Error(`Satelles documentos failed: HTTP ${res.status} ${text.slice(0, 200)}`);
        }
        // eslint-disable-next-line no-await-in-loop
        return await res.json();
    }
    throw new Error(`Satelles documentos: 404 en ambos prefijos (último ${last?.url})`);
}

/**
 * Proxy de descarga de un documento concreto. Necesita la URL/identificador
 * tal cual lo devuelve getDocumentosRuta. Si Satelles entrega URLs absolutas
 * descargables, basta con redirigir; si entrega solo IDs, se llama aquí con
 * la URL construida. El llamador (endpoint del backend) decide cuál mandar.
 */
async function downloadDocumento(cred, url) {
    const token = await obtenerToken({
        hostBase: cred.hostBase,
        clientId: cred.client_id,
        clientSecret: cred.client_secret,
        scope: SCOPE_FINISHED,
    });
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': '*/*',
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Satelles download failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return {
        status: res.status,
        contentType: res.headers.get('content-type') || 'application/octet-stream',
        body: res.body, // ReadableStream para pipe directo al cliente
    };
}

/* ───────────────────────────────────────────────────────────────────────────
 * Maestros ERPSYNC (outbound): conductores y vehículos.
 *
 * Endpoints oficiales (manual Satelles ERPSYNC; paths y cuerpos verificados
 * en vivo el 2026-06-27 contra ecotrans.satelles.es con la credencial de GFE):
 *   GET /api/erpsync/drivers           lista de conductores
 *   GET /api/erpsync/drivers/{code}    un conductor
 *   PUT /api/erpsync/drivers/{code}    crear o actualizar (upsert por code)
 *   GET /api/erpsync/vehicles          lista de vehículos
 *   GET /api/erpsync/vehicles/{code}   un vehículo
 *   PUT /api/erpsync/vehicles/{code}   crear o actualizar (upsert por code)
 *
 * Todos con scope satelles-erpsync:write. Token cacheado; un 401 limpia la
 * caché y reintenta una vez. Un error HTTP de Satelles se lanza con
 * `err.statusCode` + `err.upstream` para que el endpoint lo traduzca a 502.
 * ─────────────────────────────────────────────────────────────────────────── */
async function callErpsync(cred, method, path, body) {
    const host = cred.hostBase.replace(/\/$/, '');
    const tokenArgs = {
        hostBase: cred.hostBase,
        clientId: cred.client_id,
        clientSecret: cred.client_secret,
        scope: SCOPE_ERPSYNC,
    };
    const doFetch = (token) => {
        const headers = {
            'Accept': 'application/json',
            'Accept-Language': 'es',
            'Authorization': `Bearer ${token}`,
        };
        const opts = { method, headers };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        return fetch(`${host}${path}`, opts);
    };

    let res = await doFetch(await obtenerToken(tokenArgs));
    if (res.status === 401) {
        // Token caducado o inválido — limpiar caché y reintentar 1 vez.
        tokenCache.delete(cacheKey(cred.hostBase, cred.client_id, SCOPE_ERPSYNC));
        res = await doFetch(await obtenerToken(tokenArgs));
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Satelles erpsync ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
        err.statusCode = res.status;
        err.upstream = text.slice(0, 500);
        throw err;
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
}

const getDrivers = (cred) => callErpsync(cred, 'GET', '/api/erpsync/drivers');
const getDriver = (cred, code) => callErpsync(cred, 'GET', `/api/erpsync/drivers/${encodeURIComponent(code)}`);
const putDriver = (cred, code, body) => callErpsync(cred, 'PUT', `/api/erpsync/drivers/${encodeURIComponent(code)}`, body);
const getVehicles = (cred) => callErpsync(cred, 'GET', '/api/erpsync/vehicles');
const getVehicle = (cred, code) => callErpsync(cred, 'GET', `/api/erpsync/vehicles/${encodeURIComponent(code)}`);
const putVehicle = (cred, code, body) => callErpsync(cred, 'PUT', `/api/erpsync/vehicles/${encodeURIComponent(code)}`, body);

module.exports = {
    getFinishedRoutes, commitFinishedRoutes, getDocumentosRuta, downloadDocumento,
    getDrivers, getDriver, putDriver, getVehicles, getVehicle, putVehicle,
};
