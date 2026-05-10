/**
 * Middleware de autenticación para chofocles.
 * Calcado del de saycutrans con la misma forma de opciones:
 *   authMiddleware({ roles: ['chofer'], requireEmpresa: true })
 *
 * Inyecta en req: user (payload), userId, userName, userRole, empresaCodigo, isAdmin.
 */

const { verifyAccessToken } = require('./tokens');

function authMiddleware(options = {}) {
    const { roles = [], requireEmpresa = true, adminOnly = false } = options;

    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.startsWith('Bearer ')
                ? authHeader.slice(7)
                : null;

            if (!token) {
                return res.status(401).json({
                    ok: false,
                    error: 'no_autorizado',
                    message: 'Token de acceso requerido',
                });
            }

            const payload = verifyAccessToken(token);

            if (adminOnly && !payload.admin) {
                return res.status(403).json({
                    ok: false,
                    error: 'acceso_denegado',
                    message: 'Requiere privilegios de administrador',
                });
            }

            const shouldRequireEmpresa = requireEmpresa && !(adminOnly && payload.admin);
            if (shouldRequireEmpresa && !payload.empresa) {
                return res.status(401).json({
                    ok: false,
                    error: 'empresa_requerida',
                    message: 'El token no contiene empresa',
                });
            }

            if (roles.length > 0 && !roles.includes(payload.rol)) {
                return res.status(403).json({
                    ok: false,
                    error: 'acceso_denegado',
                    message: 'Rol no autorizado para esta acción',
                });
            }

            req.user = payload;
            req.userId = payload.id;
            req.userName = payload.nombre || payload.login || null;
            req.userRole = payload.rol || null;
            req.empresaCodigo = payload.empresa || null;
            req.isAdmin = !!payload.admin;
            return next();
        } catch (_error) {
            return res.status(401).json({
                ok: false,
                error: 'token_invalido',
                message: 'Token expirado o inválido',
            });
        }
    };
}

module.exports = { authMiddleware };
