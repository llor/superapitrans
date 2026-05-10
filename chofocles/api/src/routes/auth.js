/**
 * Rutas de autenticación de chofocles.
 *
 * Endpoints:
 *   POST /api/auth/login    — { empresa, login, password } → { accessToken, refreshToken, user }
 *   POST /api/auth/refresh  — { refreshToken }             → { accessToken, refreshToken, expiresIn }
 *   POST /api/auth/logout   — invalida refresh_token del usuario
 *   GET  /api/auth/me       — datos del usuario autenticado
 *
 * Login usa la BBDD del tenant (saycu_chofocles_<EMPRESA>): tabla `usuarios`
 * + JOIN con `roles`. Discrimina admin/chofer por `roles.codigo`.
 */

const express = require('express');
const { adminPool, getTenantPool } = require('../db');
const { buildUserPayload, generateTokens, verifyRefreshToken } = require('../auth/tokens');
const { authMiddleware } = require('../auth/middleware');
const { verifyPassword } = require('../auth/passwords');
const {
    ok, validationError, unauthorized, serverError, notFound,
} = require('../utils/responses');

const router = express.Router();

// Comprueba que la empresa existe en saycu_admin y tiene chofocles activo.
async function empresaTieneChofocles(empresaCodigo) {
    const r = await adminPool.query(
        `SELECT 1 FROM empresas
         WHERE UPPER(codigo) = $1
           AND deleted_at IS NULL
           AND 'chofocles' = ANY(servicios)
         LIMIT 1`,
        [empresaCodigo]
    );
    return r.rowCount > 0;
}

// ──────────────── POST /api/auth/login ────────────────

router.post('/login', async (req, res) => {
    try {
        const { empresa, login, password } = req.body || {};
        const missing = [];
        if (!empresa) missing.push('empresa');
        if (!login) missing.push('login');
        if (!password) missing.push('password');
        if (missing.length > 0) return validationError(res, missing);

        const empresaCodigo = String(empresa).trim().toUpperCase();

        // Empresa válida y con servicio chofocles contratado
        if (!(await empresaTieneChofocles(empresaCodigo))) {
            return unauthorized(res, 'Empresa no autorizada para chofocles');
        }

        // Lookup en BBDD del tenant
        const tenant = getTenantPool(empresaCodigo);
        const result = await tenant.query(
            `SELECT u.*, r.codigo AS rol_codigo
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
             WHERE (LOWER(u.login) = LOWER($1) OR LOWER(COALESCE(u.email, '')) = LOWER($1))
               AND u.activo = TRUE
               AND u.deleted_at IS NULL
             LIMIT 1`,
            [String(login).trim()]
        );

        if (result.rowCount === 0) {
            return unauthorized(res, 'Login o contraseña incorrectos');
        }
        const user = result.rows[0];

        const passOk = await verifyPassword(String(password), user.password_hash);
        if (!passOk) {
            return unauthorized(res, 'Login o contraseña incorrectos');
        }

        const payload = buildUserPayload(user, { empresa: empresaCodigo, admin: false });
        const tokens = generateTokens(payload);

        // Persistir refresh_token y ultimo_acceso
        await tenant.query(
            `UPDATE usuarios
             SET refresh_token = $1,
                 refresh_token_expires = NOW() + INTERVAL '30 days',
                 ultimo_acceso = NOW()
             WHERE id = $2`,
            [tokens.refreshToken, user.id]
        );

        return ok(res, {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            user: {
                id: user.id,
                login: user.login,
                email: user.email,
                nombre: user.nombre,
                apellidos: user.apellidos,
                telefono: user.telefono,
                movil: user.movil,
                rol: user.rol_codigo,
                empresa: empresaCodigo,
                vehiculo_id: user.vehiculo_id || null,
            },
        }, 'Login correcto');
    } catch (err) {
        return serverError(res, err);
    }
});

// ──────────────── POST /api/auth/refresh ────────────────

router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body || {};
        if (!refreshToken) return validationError(res, ['refreshToken']);

        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        } catch (_e) {
            return unauthorized(res, 'Refresh token inválido o expirado');
        }

        const empresaCodigo = decoded.empresa;
        if (!empresaCodigo) {
            return unauthorized(res, 'Refresh token sin empresa');
        }

        const tenant = getTenantPool(empresaCodigo);
        const result = await tenant.query(
            `SELECT u.*, r.codigo AS rol_codigo
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
             WHERE u.id = $1
               AND u.activo = TRUE
               AND u.deleted_at IS NULL
               AND u.refresh_token = $2
               AND u.refresh_token_expires > NOW()
             LIMIT 1`,
            [decoded.id, refreshToken]
        );

        if (result.rowCount === 0) {
            return unauthorized(res, 'Refresh token revocado');
        }

        const user = result.rows[0];
        const payload = buildUserPayload(user, { empresa: empresaCodigo, admin: false });
        const tokens = generateTokens(payload);

        await tenant.query(
            `UPDATE usuarios
             SET refresh_token = $1,
                 refresh_token_expires = NOW() + INTERVAL '30 days'
             WHERE id = $2`,
            [tokens.refreshToken, user.id]
        );

        return ok(res, tokens, 'Token renovado');
    } catch (err) {
        return serverError(res, err);
    }
});

// ──────────────── POST /api/auth/logout ────────────────

router.post('/logout', authMiddleware({ requireEmpresa: false }), async (req, res) => {
    try {
        if (!req.empresaCodigo) {
            // Solo aplica a usuarios de tenant; sin empresa no hay nada que invalidar.
            return ok(res, null, 'Sesión cerrada');
        }
        const tenant = getTenantPool(req.empresaCodigo);
        await tenant.query(
            `UPDATE usuarios
             SET refresh_token = NULL, refresh_token_expires = NULL
             WHERE id = $1`,
            [req.userId]
        );
        return ok(res, null, 'Sesión cerrada');
    } catch (err) {
        return serverError(res, err);
    }
});

// ──────────────── GET /api/auth/me ────────────────

router.get('/me', authMiddleware({ requireEmpresa: false }), async (req, res) => {
    try {
        if (!req.empresaCodigo) {
            return ok(res, { user: req.user });
        }
        const tenant = getTenantPool(req.empresaCodigo);
        const result = await tenant.query(
            `SELECT u.id, u.login, u.email, u.nombre, u.apellidos,
                    u.telefono, u.movil, u.dni, u.vehiculo_id,
                    u.ultimo_acceso, r.codigo AS rol_codigo
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
             WHERE u.id = $1 AND u.deleted_at IS NULL
             LIMIT 1`,
            [req.userId]
        );
        if (result.rowCount === 0) return notFound(res, 'Usuario no encontrado');
        const user = result.rows[0];
        return ok(res, {
            user: {
                ...user,
                rol: user.rol_codigo,
                empresa: req.empresaCodigo,
            },
        });
    } catch (err) {
        return serverError(res, err);
    }
});

// =========================================================================
// Push tokens y pasos activos del chofer
// =========================================================================

// Registrar token FCM/APNS del dispositivo del chofer.
// Hace UPSERT dentro del array jsonb push_tokens (sustituye si ya existe el
// mismo token, añade si no).
router.post('/device-token', authMiddleware({ roles: ['chofer'] }), async (req, res) => {
    try {
        const { token, plataforma } = req.body || {};
        if (!token || typeof token !== 'string') {
            return validationError(res, 'token requerido');
        }
        const plat = ['android', 'ios', 'web'].includes(plataforma) ? plataforma : 'android';

        const tenant = getTenantPool(req.empresaCodigo);
        // Eliminar entradas previas con el mismo token y añadir la nueva.
        await tenant.query(
            `UPDATE usuarios
                SET push_tokens = COALESCE(
                  (SELECT jsonb_agg(t)
                     FROM jsonb_array_elements(push_tokens) t
                    WHERE t->>'token' <> $2), '[]'::jsonb
                ) || jsonb_build_array(jsonb_build_object(
                    'token', $2::text,
                    'plataforma', $3::text,
                    'registrado_at', NOW()::text
                )),
                updated_at = NOW()
              WHERE id = $1`,
            [req.userId, token, plat]
        );
        return ok(res, { registrado: true });
    } catch (err) {
        return serverError(res, err);
    }
});

// Pasos activos del chofer (interruptores).
router.get('/mis-pasos', authMiddleware({ roles: ['chofer'] }), async (req, res) => {
    try {
        const tenant = getTenantPool(req.empresaCodigo);
        const r = await tenant.query(
            `SELECT pasos_activos FROM usuarios WHERE id = $1`,
            [req.userId]
        );
        return ok(res, { pasos: r.rowCount ? r.rows[0].pasos_activos : {} });
    } catch (err) { return serverError(res, err); }
});

router.put('/mis-pasos', authMiddleware({ roles: ['chofer'] }), async (req, res) => {
    try {
        const { pasos } = req.body || {};
        if (!pasos || typeof pasos !== 'object') {
            return validationError(res, 'pasos requerido (objeto)');
        }
        // Forzar obligatorios a true.
        const out = { ...pasos, aceptar: true, rechazar: true, terminar: true };
        const tenant = getTenantPool(req.empresaCodigo);
        await tenant.query(
            `UPDATE usuarios SET pasos_activos = $2::jsonb, updated_at = NOW() WHERE id = $1`,
            [req.userId, JSON.stringify(out)]
        );
        return ok(res, { pasos: out });
    } catch (err) { return serverError(res, err); }
});

module.exports = router;
