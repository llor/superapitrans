/**
 * pasarela — express app aislada.
 *
 * Este archivo solo construye y devuelve la app de Express con todos sus
 * middlewares y rutas. NO arranca el servidor ni el cron — eso lo hace
 * `index.js` para producción y `tests/helpers.js` para los tests.
 *
 * Si añades, modificas o quitas un endpoint debes:
 *   1. Cambiarlo aquí (o en sus rutas).
 *   2. Actualizar `tests/api.test.js` con el caso correspondiente.
 *   3. Actualizar el manual visible en
 *      `admin.saycusoft.es/panel/src/pages/ApiDocsPasarela.jsx`.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { pingAdmin } = require('./db');
const errorReporter = require('./utils/error-reporter-client');
const { logRequest } = require('./middleware/log-request');

function buildApp() {
    const app = express();

    app.disable('x-powered-by');
    app.use(helmet());
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json({ limit: '5mb' }));
    if (process.env.NODE_ENV !== 'test') {
        app.use(morgan(process.env.LOG_FORMAT || 'combined'));
    }
    app.use(logRequest);

    app.use('/api/datos', require('./routes/datos'));

    async function healthHandler(_req, res) {
        try {
            const ok = await pingAdmin();
            res.json({ ok: true, service: 'pasarela-api', version: '0.1.0', db: ok });
        } catch (err) {
            res.status(503).json({ ok: false, error: err.message });
        }
    }
    // /health sin prefijo: usado por el HEALTHCHECK Docker (localhost interno).
    // /api/health con prefijo: el visible públicamente tras el rewrite de Caddy
    // (handle_path /pasarela/* + rewrite * /api{path}).
    app.get('/health', healthHandler);
    app.get('/api/health', healthHandler);

    // 404 explícito (después de las rutas montadas).
    app.use((req, res) => {
        res.locals.errorCode = 'not_found';
        res.status(404).json({ ok: false, error: 'not_found', path: req.path });
    });

    app.use((err, req, res, _next) => {
        res.locals.errorCode = 'internal_error';
        console.error('[pasarela-api] error no controlado:', err);
        errorReporter.reportError({
            source: 'backend',
            severity: 'error',
            message: err.message,
            stack: err.stack,
            http_method: req.method,
            http_url: req.originalUrl,
            http_status: 500,
            user_agent: req.headers && req.headers['user-agent'],
            client_ip: req.ip,
            request_payload: { query: req.query, body: req.body, params: req.params },
        });
        res.status(500).json({ ok: false, error: 'internal_error' });
    });

    return app;
}

module.exports = { buildApp };
