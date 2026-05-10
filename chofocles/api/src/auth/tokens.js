/**
 * Generación y verificación de JWT (access + refresh).
 * Mismas claves de entorno y misma forma de payload que saycutrans
 * (JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN)
 * para que el código de auth pueda intercambiarse o reutilizarse.
 */

const jwt = require('jsonwebtoken');

function requireEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} no definida en .env`);
    return value;
}

function buildUserPayload(userRow, options = {}) {
    const { empresa = null, admin = false } = options;
    return {
        id: userRow.id,
        email: userRow.email || null,
        login: userRow.login,
        nombre: userRow.nombre || null,
        apellidos: userRow.apellidos || null,
        empresa,
        rol: userRow.rol_codigo || null,
        permisos: userRow.permisos || {},
        admin,
    };
}

function generateTokens(userPayload) {
    const JWT_SECRET = requireEnv('JWT_SECRET');
    const JWT_REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET');
    const JWT_EXPIRES_IN = requireEnv('JWT_EXPIRES_IN');
    const JWT_REFRESH_EXPIRES_IN = requireEnv('JWT_REFRESH_EXPIRES_IN');

    const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign(
        { id: userPayload.id, empresa: userPayload.empresa ?? null },
        JWT_REFRESH_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
    return { accessToken, refreshToken, expiresIn: JWT_EXPIRES_IN };
}

function verifyAccessToken(token) {
    return jwt.verify(token, requireEnv('JWT_SECRET'));
}

function verifyRefreshToken(token) {
    return jwt.verify(token, requireEnv('JWT_REFRESH_SECRET'));
}

module.exports = {
    buildUserPayload,
    generateTokens,
    verifyAccessToken,
    verifyRefreshToken,
};
