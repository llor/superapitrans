/**
 * Middleware: graba en saycu_admin.pasarela_logs_api una fila por cada
 * petición HTTP procesada por pasarela_api.
 *
 * Se monta lo antes posible (después de express.json) para que el
 * cronómetro empiece pronto. El INSERT se hace en el evento res.finish,
 * por lo que no añade latencia perceptible al cliente.
 *
 * Convención: cuando una ruta o middleware responde con error, debe
 * asignar `res.locals.errorCode` con el código corto que vaya en el
 * body (`{ ok: false, error: '<errorCode>' }`). Si no se asigna, el log
 * queda sin error_code aunque el status_code sea >= 400.
 */

const { getAdminPool } = require('../db');

function logRequest(req, res, next) {
    const start = Date.now();
    const reqSizeHeader = req.headers['content-length'];
    const reqSize = reqSizeHeader ? Number.parseInt(reqSizeHeader, 10) : null;

    res.on('finish', () => {
        const duracion_ms = Date.now() - start;
        const status = res.statusCode;

        const respSizeHeader = res.getHeader('Content-Length');
        const respSize = respSizeHeader ? Number.parseInt(respSizeHeader, 10) : null;

        const empresaId = req.client?.empresaId ?? null;
        const keyId = req.client?.keyId ?? null;
        const aplicacion = req.client?.aplicacion ?? null;
        const errorCode = res.locals?.errorCode ?? null;
        const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 300) : null;

        getAdminPool().query(
            `INSERT INTO pasarela_logs_api
                (empresa_id, key_id, aplicacion, method, endpoint, status_code,
                 error_code, ip_origen, user_agent, request_size, response_size, duracion_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                empresaId,
                keyId,
                aplicacion,
                req.method,
                req.originalUrl,
                status,
                errorCode,
                req.ip,
                userAgent,
                Number.isFinite(reqSize) ? reqSize : null,
                Number.isFinite(respSize) ? respSize : null,
                duracion_ms,
            ]
        ).catch((err) => {
            console.error('[pasarela-api] log-request INSERT falló:', err.message);
        });
    });

    next();
}

module.exports = { logRequest };
