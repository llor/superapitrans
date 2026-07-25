/**
 * Middleware: valida la API key del cliente externo entrante.
 *
 * Cabecera esperada:
 *   Authorization: Bearer pas_live_<prefijo><secreto>
 *
 * El prefijo identificable (primeros caracteres) permite localizar la
 * fila en BD; luego se compara el blob completo con bcrypt contra
 * key_hash. Si coincide, se cargan empresa + scopes en req.
 *
 * Uso:
 *   router.use(requireKey(['datos.read']));
 */

const bcrypt = require('bcryptjs');
const { getAdminPool } = require('../db');

const PREFIX_LENGTH = 16;   // primeros 16 chars de la key se usan como key_prefix

function extractKey(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    return h.slice(7).trim();
}

function requireKey(requiredScopes = []) {
    return async (req, res, next) => {
        const presented = extractKey(req);
        if (!presented) {
            res.locals.errorCode = 'missing_bearer';
            return res.status(401).json({ ok: false, error: 'missing_bearer' });
        }
        const prefix = presented.slice(0, PREFIX_LENGTH);

        try {
            const { rows } = await getAdminPool().query(
                `SELECT k.id, k.empresa_id, k.aplicacion, k.key_hash, k.scopes,
                        k.expira_at, k.activo,
                        e.codigo AS empresa_codigo, e.nombre AS empresa_nombre
                 FROM pasarela_clientes_keys k
                 JOIN empresas e ON e.id = k.empresa_id
                 WHERE k.key_prefix = $1
                   AND e.activo = TRUE AND e.deleted_at IS NULL
                 LIMIT 1`,
                [prefix]
            );
            if (rows.length === 0) {
                res.locals.errorCode = 'invalid_key';
                return res.status(401).json({ ok: false, error: 'invalid_key' });
            }
            const row = rows[0];
            if (!row.activo) {
                res.locals.errorCode = 'key_inactive';
                return res.status(401).json({ ok: false, error: 'key_inactive' });
            }
            if (row.expira_at && new Date(row.expira_at) < new Date()) {
                res.locals.errorCode = 'key_expired';
                return res.status(401).json({ ok: false, error: 'key_expired' });
            }
            const ok = await bcrypt.compare(presented, row.key_hash);
            if (!ok) {
                res.locals.errorCode = 'invalid_key';
                return res.status(401).json({ ok: false, error: 'invalid_key' });
            }

            // Scopes
            const keyScopes = Array.isArray(row.scopes) ? row.scopes : [];
            for (const need of requiredScopes) {
                if (!keyScopes.includes(need)) {
                    res.locals.errorCode = 'scope_required';
                    return res.status(403).json({ ok: false, error: 'scope_required', scope: need });
                }
            }

            req.client = {
                keyId: row.id,
                empresaId: row.empresa_id,
                empresaCodigo: row.empresa_codigo,
                empresaNombre: row.empresa_nombre,
                aplicacion: row.aplicacion,
                scopes: keyScopes,
            };

            // Actualizar ultimo_uso_at (best-effort, sin esperar)
            getAdminPool().query(
                `UPDATE pasarela_clientes_keys SET ultimo_uso_at = NOW() WHERE id = $1`,
                [row.id]
            ).catch(() => { /* ignorar */ });

            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = { requireKey, PREFIX_LENGTH };
