const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test_secret_access_xyz';
process.env.JWT_REFRESH_SECRET = 'test_secret_refresh_xyz';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';

const {
    buildUserPayload,
    generateTokens,
    verifyAccessToken,
    verifyRefreshToken,
} = require('./tokens');

const userRow = {
    id: 7,
    email: 'jose@example.com',
    login: 'jose',
    nombre: 'José',
    apellidos: 'Pérez',
    rol_codigo: 'chofer',
    permisos: { puede_aceptar: true },
};

test('buildUserPayload incluye empresa y rol', () => {
    const p = buildUserPayload(userRow, { empresa: 'DEMO' });
    assert.equal(p.id, 7);
    assert.equal(p.empresa, 'DEMO');
    assert.equal(p.rol, 'chofer');
    assert.deepEqual(p.permisos, { puede_aceptar: true });
    assert.equal(p.admin, false);
});

test('generateTokens devuelve access + refresh válidos', () => {
    const payload = buildUserPayload(userRow, { empresa: 'DEMO' });
    const t = generateTokens(payload);
    assert.ok(t.accessToken);
    assert.ok(t.refreshToken);
    assert.equal(t.expiresIn, '15m');
    const decoded = verifyAccessToken(t.accessToken);
    assert.equal(decoded.id, 7);
    assert.equal(decoded.empresa, 'DEMO');
    assert.equal(decoded.rol, 'chofer');
});

test('refreshToken es independiente del accessToken (no se acepta cruzado)', () => {
    const payload = buildUserPayload(userRow, { empresa: 'DEMO' });
    const t = generateTokens(payload);
    assert.throws(() => verifyAccessToken(t.refreshToken));
    assert.throws(() => verifyRefreshToken(t.accessToken));
});

test('refreshToken solo lleva id + empresa', () => {
    const payload = buildUserPayload(userRow, { empresa: 'DEMO' });
    const t = generateTokens(payload);
    const decoded = verifyRefreshToken(t.refreshToken);
    assert.equal(decoded.id, 7);
    assert.equal(decoded.empresa, 'DEMO');
    assert.equal(decoded.rol, undefined);
});
