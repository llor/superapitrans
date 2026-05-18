/**
 * Scheduler interno. La expresión cron se lee de saycu_admin.pasarela_config
 * (clave `cron_expr`), no de .env: el operador la cambia desde la web admin y
 * el pasarela_api reprograma en caliente sin redespliegue.
 *
 * Detección de cambio: cada CHECK_INTERVAL_MS se consulta la BD; si el valor
 * difiere del que está corriendo, se para el Task vigente y se programa uno
 * nuevo. Si el valor en BD es inválido, se loguea y se mantiene el anterior
 * (no romper el servicio por un error humano de tipeo en la web).
 *
 * Si al arrancar la BD no devuelve fila o el valor es inválido, se lanza
 * excepción explícita (regla "cero hardcoding": no hay default oculto).
 */

const cron = require('node-cron');
const { getAdminPool } = require('./db');
const satelles = require('./proveedores/satelles/sync');
const pcsValencia = require('./proveedores/pcs-valencia/sync');
const errorReporter = require('./utils/error-reporter-client');

const CHECK_INTERVAL_MS = 60_000;

let currentExpr = null;
let currentTask = null;
let watcherInterval = null;

async function leerCronExprBD() {
    const r = await getAdminPool().query(
        "SELECT value FROM pasarela_config WHERE key = 'cron_expr'"
    );
    if (!r.rows.length) {
        throw new Error('pasarela_config.cron_expr no existe en saycu_admin (¿aplicaste la migración 0013_admin_pasarela_config.sql?)');
    }
    const v = r.rows[0].value;
    // JSONB se devuelve ya parseado: si fue '"* * * * *"', llega como string '* * * * *'
    if (typeof v !== 'string' || !v.trim()) {
        throw new Error(`pasarela_config.cron_expr debe ser string no vacío (valor recibido: ${JSON.stringify(v)})`);
    }
    return v.trim();
}

function programar(expr, log) {
    if (!cron.validate(expr)) {
        throw new Error(`expresión cron inválida: "${expr}"`);
    }
    const task = cron.schedule(expr, async () => {
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
    return task;
}

async function recargarSiCambio(log) {
    let expr;
    try {
        expr = await leerCronExprBD();
    } catch (err) {
        errorReporter.reportError({
            message: `[cron-watcher] no se pudo leer pasarela_config.cron_expr: ${err.message}`,
            stack: err.stack,
            source: 'db',
            severity: 'warning',
            extra: { funcion: 'recargarSiCambio' },
        });
        return;
    }
    if (expr === currentExpr) return;
    if (!cron.validate(expr)) {
        const msg = `[cron-watcher] expresión inválida en BD: "${expr}". Mantengo "${currentExpr}".`;
        log(msg);
        errorReporter.reportError({
            message: msg,
            source: 'backend',
            severity: 'warning',
            extra: { expr_invalida: expr, expr_actual: currentExpr },
        });
        return;
    }
    log(`[cron-watcher] reprogramando: "${currentExpr}" → "${expr}"`);
    if (currentTask) currentTask.stop();
    currentTask = programar(expr, log);
    currentExpr = expr;
}

async function start(log = console.log) {
    currentExpr = await leerCronExprBD();
    if (!cron.validate(currentExpr)) {
        throw new Error(`pasarela_config.cron_expr inválida: "${currentExpr}"`);
    }
    log(`[cron] programado satelles.syncAll + pcs-valencia.syncAll con expresión "${currentExpr}" (leída de saycu_admin.pasarela_config)`);
    currentTask = programar(currentExpr, log);

    if (watcherInterval) clearInterval(watcherInterval);
    watcherInterval = setInterval(() => {
        recargarSiCambio(log).catch((err) => {
            log(`[cron-watcher] excepción no controlada: ${err.message}`);
        });
    }, CHECK_INTERVAL_MS);
    log(`[cron-watcher] activo (revisa pasarela_config cada ${CHECK_INTERVAL_MS / 1000}s)`);
}

module.exports = { start };
