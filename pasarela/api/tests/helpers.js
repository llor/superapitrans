/**
 * Helpers para los tests: arrancar/cerrar el server en un puerto random
 * y hacer peticiones HTTP con fetch nativo (Node 20+).
 *
 * El server se construye desde `src/app.js` (sin cron de sync, sin
 * dotenv automático). Las variables de entorno PG/admin las hereda del
 * proceso, por lo que el wrapper `npm test` debe lanzarse con un .env
 * cargado o con vars exportadas.
 */

const { buildApp } = require('../src/app');

let server = null;
let baseUrl = null;

function startServer() {
    return new Promise((resolve, reject) => {
        const app = buildApp();
        const s = app.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            server = s;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve(baseUrl);
        });
        s.on('error', reject);
    });
}

function stopServer() {
    return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => { server = null; baseUrl = null; resolve(); });
    });
}

function getBaseUrl() {
    if (!baseUrl) throw new Error('server no arrancado: llama startServer() antes');
    return baseUrl;
}

async function api(method, path, { token, body } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(getBaseUrl() + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* respuesta vacía o no-JSON */ }
    return { status: res.status, body: json };
}

module.exports = {
    startServer,
    stopServer,
    getBaseUrl,
    api,
};
