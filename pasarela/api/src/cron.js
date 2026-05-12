/**
 * Scheduler interno. Cron expression configurable por env
 * `PASARELA_SYNC_CRON` (defecto cada 5 minutos).
 */

const cron = require('node-cron');
const satelles = require('./proveedores/satelles/sync');
const pcsValencia = require('./proveedores/pcs-valencia/sync');

const DEFAULT_EXPR = '*/5 * * * *';

function start(log = console.log) {
    const expr = process.env.PASARELA_SYNC_CRON || DEFAULT_EXPR;
    if (!cron.validate(expr)) {
        throw new Error(`PASARELA_SYNC_CRON inválida: ${expr}`);
    }
    log(`[cron] programado satelles.syncAll + pcs-valencia.syncAll con expresión "${expr}"`);
    cron.schedule(expr, async () => {
        try {
            await satelles.syncAll(log);
        } catch (err) {
            log(`[cron] error en satelles.syncAll: ${err.message}`);
        }
        try {
            await pcsValencia.syncAll(log);
        } catch (err) {
            log(`[cron] error en pcs-valencia.syncAll: ${err.message}`);
        }
    }, { timezone: process.env.TZ || 'Europe/Madrid' });
}

module.exports = { start };
