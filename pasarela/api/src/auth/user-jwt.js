/**
 * pasarela — Autenticación de USUARIOS de panel (web), JWT con bcrypt.
 *
 * Distinto de `client-key.js`, que valida API keys de clientes externos.
 * Aquí validamos el JWT de un humano que entró por el formulario de login
 * del panel web (panel.{$BASE_DOMAIN_SUPERAPI}/pasarela/).
 *
 * Patrón clonado de saycutrans/api-desktop-pg/src/routes/auth.js:
 *   - Resuelve contra `saycu_admin.usuarios_panel_<empresa_codigo>` para
 *     usuarios de empresa.
 *   - Fallback a `saycu_admin.usuarios_admin` para admin global (un
 *     superadmin puede entrar a cualquier panel del grupo Saycu).
 */

const jwt = require('jsonwebtoken');

function getSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET no definido');
    return s;
}

function getExpiresIn() {
    return process.env.JWT_EXPIRES_IN || '12h';
}

function signUserToken(payload) {
    return jwt.sign(payload, getSecret(), { expiresIn: getExpiresIn() });
}

function panelUsersTable(empresaCodigo) {
    return `usuarios_panel_${String(empresaCodigo).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
}

/**
 * Middleware: exige Authorization: Bearer <jwt>. Inyecta req.user con el
 * payload decodificado (id, login, empresa_codigo, rol, …).
 */
function requireUser(req, res, next) {
    const header = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) {
        return res.status(401).json({ ok: false, error: 'missing_bearer' });
    }
    try {
        const payload = jwt.verify(m[1], getSecret());
        req.user = payload;
        next();
    } catch (_e) {
        return res.status(401).json({ ok: false, error: 'invalid_token' });
    }
}

module.exports = { signUserToken, requireUser, panelUsersTable };
