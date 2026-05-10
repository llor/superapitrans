const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.CHOFOCLES_SECRETS_KEY = crypto.randomBytes(32).toString('base64');

const { encrypt, decrypt, _resetKeyCache } = require('./secrets');

test('roundtrip básico devuelve el original', () => {
    const original = 'unaContraseña123!';
    const encoded = encrypt(original);
    assert.notEqual(encoded, original);
    assert.equal(decrypt(encoded), original);
});

test('soporta caracteres no-ASCII (acentos, ñ, símbolos)', () => {
    const original = 'mañana es jueves — clave: ñoño@ácido€¿?';
    assert.equal(decrypt(encrypt(original)), original);
});

test('mismo texto cifrado dos veces da salidas distintas (IV aleatorio)', () => {
    const a = encrypt('hola');
    const b = encrypt('hola');
    assert.notEqual(a, b);
    assert.equal(decrypt(a), 'hola');
    assert.equal(decrypt(b), 'hola');
});

test('decrypt falla si manipulamos el authTag', () => {
    const encoded = encrypt('xyz');
    const buf = Buffer.from(encoded, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    assert.throws(() => decrypt(tampered));
});

test('decrypt falla si manipulamos el ciphertext', () => {
    const encoded = encrypt('xyz');
    const buf = Buffer.from(encoded, 'base64');
    buf[14] ^= 0xff; // byte dentro del ciphertext
    const tampered = buf.toString('base64');
    assert.throws(() => decrypt(tampered));
});

test('decrypt falla con payload demasiado corto', () => {
    const tooShort = Buffer.alloc(10).toString('base64');
    assert.throws(() => decrypt(tooShort), /demasiado corto/);
});

test('encrypt rechaza no-strings', () => {
    assert.throws(() => encrypt(123), /string/);
    assert.throws(() => encrypt(null), /string/);
});

test('error claro si la clave del .env no es de 32 bytes', () => {
    const oldKey = process.env.CHOFOCLES_SECRETS_KEY;
    process.env.CHOFOCLES_SECRETS_KEY = Buffer.alloc(16).toString('base64');
    _resetKeyCache();
    try {
        assert.throws(() => encrypt('hola'), /32 bytes/);
    } finally {
        process.env.CHOFOCLES_SECRETS_KEY = oldKey;
        _resetKeyCache();
    }
});

test('error claro si la clave del .env no está', () => {
    const oldKey = process.env.CHOFOCLES_SECRETS_KEY;
    delete process.env.CHOFOCLES_SECRETS_KEY;
    _resetKeyCache();
    try {
        assert.throws(() => encrypt('hola'), /no definida/);
    } finally {
        process.env.CHOFOCLES_SECRETS_KEY = oldKey;
        _resetKeyCache();
    }
});
