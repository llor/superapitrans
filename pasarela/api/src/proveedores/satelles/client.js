/**
 * Cliente HTTP de Satelles ERPSYNC.
 * - OAuth 2.0 client credentials (POST /auth/connect/token).
 * - Token cacheado en memoria por (hostBase, clientId, scope).
 *
 * Ver: documentos/Satelles - ERPSYNC Api.pdf
 *      documentos/Satelles API ERP SYNC (Ecotrans).postman_collection.json
 */

const SCOPE_FINISHED = 'satelles-publications:finished-routes';

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

module.exports = { getFinishedRoutes, commitFinishedRoutes };
