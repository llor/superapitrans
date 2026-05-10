/**
 * pasarela — cifrado AES-256-GCM byte-a-byte compatible con
 * chofocles/api/src/secrets.js (verificado por roundtrip cruzado).
 *
 * Formato del blob: base64( 12 bytes IV | 16 bytes tag | ciphertext ).
 *
 * La clave maestra se lee de PASARELA_SECRETS_KEY (.env) — 32 bytes en
 * base64. Generar con:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const crypto = require('node:crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
    const raw = process.env.PASARELA_SECRETS_KEY;
    if (!raw) throw new Error('PASARELA_SECRETS_KEY no definida en .env');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
        throw new Error(`PASARELA_SECRETS_KEY debe tener 32 bytes (tiene ${buf.length})`);
    }
    return buf;
}

function cifrar(plaintext) {
    if (typeof plaintext !== 'string') throw new Error('plaintext debe ser string');
    const key = getKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALG, key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
}

function descifrar(blobBase64) {
    if (typeof blobBase64 !== 'string') throw new Error('blob debe ser string');
    const buf = Buffer.from(blobBase64, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) {
        throw new Error('blob demasiado corto');
    }
    const key = getKey();
    const iv  = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct  = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
}

function cifrarJson(obj) {
    return cifrar(JSON.stringify(obj));
}

function descifrarJson(blobBase64) {
    return JSON.parse(descifrar(blobBase64));
}

module.exports = { cifrar, descifrar, cifrarJson, descifrarJson };
