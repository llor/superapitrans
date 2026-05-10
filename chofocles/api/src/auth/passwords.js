/**
 * Hashing y verificación de contraseñas con bcryptjs.
 * Cost factor 12 (mismo que saycutrans).
 */

const bcrypt = require('bcryptjs');

const COST = 12;

async function hashPassword(plaintext) {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new TypeError('hashPassword: plaintext requerido y debe ser string');
    }
    return bcrypt.hash(plaintext, COST);
}

async function verifyPassword(plaintext, hash) {
    if (typeof plaintext !== 'string' || typeof hash !== 'string') return false;
    return bcrypt.compare(plaintext, hash);
}

module.exports = { hashPassword, verifyPassword };
