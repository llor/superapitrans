#!/usr/bin/env node
/**
 * Genera una clave aleatoria válida para CHOFOCLES_SECRETS_KEY.
 *
 * Uso:
 *   node api/scripts/generate-key.js
 *
 * Pega el resultado en .env (variable CHOFOCLES_SECRETS_KEY).
 * IMPORTANTE: una vez en producción, NO regenerar la clave sin un proceso
 * de re-cifrado de los buzones existentes — perderías el acceso a las
 * credenciales SMTP/IMAP de los choferes.
 */
const crypto = require('crypto');
process.stdout.write(crypto.randomBytes(32).toString('base64') + '\n');
