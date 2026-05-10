/**
 * Helpers para respuestas JSON consistentes.
 */

function ok(res, data, message) {
    return res.json({ ok: true, ...(message ? { message } : {}), ...(data ? { data } : {}) });
}

function created(res, data, message) {
    return res.status(201).json({ ok: true, ...(message ? { message } : {}), ...(data ? { data } : {}) });
}

function badRequest(res, error, details) {
    return res.status(400).json({ ok: false, error, ...(details ? { details } : {}) });
}

function validationError(res, missingFields) {
    return res.status(422).json({
        ok: false,
        error: 'validation_error',
        message: 'Faltan campos obligatorios',
        missing: missingFields,
    });
}

function unauthorized(res, message) {
    return res.status(401).json({ ok: false, error: 'no_autorizado', message: message || 'No autorizado' });
}

function forbidden(res, message) {
    return res.status(403).json({ ok: false, error: 'acceso_denegado', message: message || 'Acceso denegado' });
}

function notFound(res, message) {
    return res.status(404).json({ ok: false, error: 'no_encontrado', message: message || 'No encontrado' });
}

function serverError(res, error) {
    const message = error && error.message ? error.message : 'Error interno';
    return res.status(500).json({ ok: false, error: 'internal_error', message });
}

module.exports = {
    ok, created, badRequest, validationError,
    unauthorized, forbidden, notFound, serverError,
};
