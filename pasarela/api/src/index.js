/**
 * pasarela — API backend
 * Punto de entrada del servidor Express. La app vive en `./app.js`.
 */

require('dotenv').config();

const { buildApp } = require('./app');
const { closeAllPools } = require('./db');
const cronScheduler = require('./cron');
const errorReporter = require('./utils/error-reporter-client');
const controlGlobal = require('./utils/control-global-client');

errorReporter.install({
    project: 'pasarela-api',
    url: process.env.ERROR_REPORTER_URL,
    environment: process.env.NODE_ENV || 'production',
    captureUncaught: false,
    captureUnhandled: false,
    patchExpressAsync: true,
});

controlGlobal.install({
    project: 'pasarela-api',
    appCode: 'pasarela-panel',
    platform: 'web',
    clientKind: 'web',
    url: process.env.CONTROL_GLOBAL_URL,
    secret: process.env.CONTROL_GLOBAL_SECRET,
    environment: process.env.NODE_ENV || 'production',
});

const PORT = process.env.PORT;
if (!PORT) {
    throw new Error('PORT no definido en .env');
}

const app = buildApp();

const server = app.listen(PORT, async () => {
    console.log(`[pasarela-api] escuchando en puerto ${PORT}`);
    if (process.env.PASARELA_SYNC_ENABLED === 'true') {
        try {
            await cronScheduler.start();
        } catch (err) {
            console.error(`[pasarela-api] cron NO arrancado: ${err.message}`);
        }
    } else {
        console.log('[pasarela-api] cron de sincronización deshabilitado (PASARELA_SYNC_ENABLED != true)');
    }
});

const shutdown = async (signal) => {
    console.log(`[pasarela-api] recibido ${signal}, cerrando…`);
    server.close(async () => {
        try { await closeAllPools(); }
        catch (e) { console.error('[pasarela-api] error cerrando pools:', e); }
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
