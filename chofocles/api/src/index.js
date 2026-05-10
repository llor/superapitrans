/**
 * chofocles — API backend
 * Punto de entrada del servidor Express.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { pingDB, closeAllPools, adminPool } = require('./db');
const errorReporter = require('./utils/error-reporter-client');

errorReporter.install({
  project: 'chofocles-api',
  url: process.env.ERROR_REPORTER_URL,
  environment: process.env.NODE_ENV || 'production',
  captureUncaught: false,
  captureUnhandled: false,
  patchExpressAsync: true,
});
errorReporter.wrapPg(adminPool, { label: 'admin' });

const PORT = process.env.PORT;
if (!PORT) {
    throw new Error('PORT no definido en .env');
}

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(morgan(process.env.LOG_FORMAT || 'combined'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/viajes', require('./routes/viajes'));
app.use('/api/incidencias', require('./routes/incidencias'));
app.use('/api/jefe', require('./routes/jefe'));

async function healthHandler(_req, res) {
    try {
        const pong = await pingDB();
        res.json({
            ok: true,
            service: 'chofocles-api',
            version: '0.1.0',
            db: pong,
        });
    } catch (err) {
        res.status(503).json({
            ok: false,
            error: err.message,
        });
    }
}
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'not_found', path: req.path });
});

app.use((err, req, res, _next) => {
    console.error('[chofocles-api] error no controlado:', err);
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

const server = app.listen(PORT, () => {
    console.log(`[chofocles-api] escuchando en puerto ${PORT}`);
    require('./services/reasignacion').start();
});

const shutdown = async (signal) => {
    console.log(`[chofocles-api] recibido ${signal}, cerrando…`);
    server.close(async () => {
        try {
            await closeAllPools();
        } catch (e) {
            console.error('[chofocles-api] error cerrando pools:', e);
        }
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
