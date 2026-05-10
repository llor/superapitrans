/**
 * Cifrado simétrico de credenciales sensibles (SMTP/IMAP del chofer).
 *
 * Algoritmo: AES-256-GCM.
 * Clave:     CHOFOCLES_SECRETS_KEY (32 bytes en base64) en .env.
 * Formato persistido: base64( IV[12] || ciphertext || authTag[16] ).
 *
 * Las contraseñas viajan a la BBDD ya cifradas. Las columnas
 * `imap_password_enc` y `smtp_password_enc` (TEXT) guardan el resultado
 * de encrypt(); para leer la contraseña se llama a decrypt().
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;        // recomendado para GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;       // 256 bits

let cachedKey = null;

function getKey() {
    if (cachedKey) return cachedKey;
    const k = process.env.CHOFOCLES_SECRETS_KEY;
    if (!k) {
        throw new Error('CHOFOCLES_SECRETS_KEY no definida en .env');
    }
    const buf = Buffer.from(k, 'base64');
    if (buf.length !== KEY_LENGTH) {
        throw new Error(
            `CHOFOCLES_SECRETS_KEY debe ser ${KEY_LENGTH} bytes en base64 ` +
            `(recibidos ${buf.length} bytes)`
        );
    }
    cachedKey = buf;
    return cachedKey;
}

function encrypt(plaintext) {
    if (typeof plaintext !== 'string') {
        throw new TypeError('encrypt: plaintext debe ser string');
    }
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, authTag]).toString('base64');
}

function decrypt(encoded) {
    if (typeof encoded !== 'string') {
        throw new TypeError('decrypt: encoded debe ser string');
    }
    const key = getKey();
    const buf = Buffer.from(encoded, 'base64');
    if (buf.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('decrypt: payload demasiado corto');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);
    return plaintext.toString('utf8');
}

// Reset de la caché (solo para tests; no usar en código de producción).
function _resetKeyCache() {
    cachedKey = null;
}

module.exports = { encrypt, decrypt, _resetKeyCache };
