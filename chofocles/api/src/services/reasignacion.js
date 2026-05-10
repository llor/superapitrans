/**
 * Reasignación automática de viajes pendientes que rebasan su timeout.
 *
 * Activación: env CHOFOCLES_REASIGNACION_ENABLED=true.
 *
 * Diseño:
 *  - Cada minuto recorre todas las empresas con servicio chofocles activo
 *    en `saycu_admin.empresas`.
 *  - En cada tenant: localiza los viajes en estado 'pendiente' creados hace
 *    más de N minutos (timeout efectivo).
 *  - Determina el siguiente chofer en orden ascendente que NO está de
 *    vacaciones y SI está disponible para ese día de la semana.
 *  - Reasigna `viajes.conductor_id` y registra fila en
 *    `chofocles_reasignaciones`.
 *  - Si no hay siguiente chofer disponible → marca el viaje como `caducado`.
 *
 * Timeout efectivo:
 *  1. chofocles_choferes_orden.timeout_aceptacion_min (override por chofer).
 *  2. chofocles_operadores_config.timeout_aceptacion_min (por proveedor).
 *  3. CHOFOCLES_REASIGNACION_DEFAULT_MIN (fallback global, defecto 30).
 */

const cron = require('node-cron');
const { adminPool, getTenantPool } = require('../db');

const ENABLED = (process.env.CHOFOCLES_REASIGNACION_ENABLED || 'false').toLowerCase() === 'true';
const SCHEDULE = process.env.CHOFOCLES_REASIGNACION_CRON || '* * * * *';   // cada minuto
const TIMEOUT_DEFECTO_MIN = parseInt(process.env.CHOFOCLES_REASIGNACION_DEFAULT_MIN || '30', 10);


async function empresasChofocles() {
    const r = await adminPool.query(`
        SELECT codigo FROM empresas
         WHERE deleted_at IS NULL AND activo = TRUE
           AND 'chofocles' = ANY(servicios)
    `);
    return r.rows;
}

async function timeoutDeOperador(operadorCif) {
    if (!operadorCif) return null;
    const r = await adminPool.query(`
        SELECT c.timeout_aceptacion_min
          FROM chofocles_operadores_logisticos o
          JOIN chofocles_operadores_config c ON c.operador_id = o.id
         WHERE o.cif = $1
    `, [operadorCif]);
    if (!r.rowCount) return null;
    return r.rows[0].timeout_aceptacion_min;
}

async function viajesAReasignar(client) {
    // Pendientes y antiguos según fecha del viaje. La columna `created_at`
    // es nuestra referencia (cuando entró el pedido al sistema).
    const r = await client.query(`
        SELECT v.id, v.conductor_id, v.operador_cif, v.created_at,
               EXTRACT(EPOCH FROM (NOW() - v.created_at))/60 AS minutos
        FROM viajes v
        JOIN estados_viaje e ON e.id = v.estado_id
        WHERE e.codigo = 'pendiente'
          AND v.deleted_at IS NULL
          AND v.created_at < NOW() - INTERVAL '5 minutes'
    `);
    return r.rows;
}

function diaDeLaSemana(date) {
    // 1 = lunes ... 7 = domingo (compatible con jsonb dias_disponibles)
    const js = date.getDay();    // 0..6 (0=domingo)
    return js === 0 ? 7 : js;
}

async function siguienteChoferDisponible(client, viaje) {
    const ordenActual = await client.query(`
        SELECT orden FROM chofocles_choferes_orden WHERE usuario_id = $1
    `, [viaje.conductor_id]);
    const ordenInicio = ordenActual.rowCount ? ordenActual.rows[0].orden : -1;

    const dia = diaDeLaSemana(new Date());
    const r = await client.query(`
        SELECT co.usuario_id, co.orden, co.timeout_aceptacion_min,
               co.vacaciones_inicio, co.vacaciones_fin,
               co.dias_disponibles
          FROM chofocles_choferes_orden co
          JOIN usuarios u ON u.id = co.usuario_id
         WHERE co.activo = TRUE
           AND u.activo = TRUE AND u.deleted_at IS NULL
           AND co.orden > $1
           AND co.usuario_id <> $2
           AND ( co.vacaciones_inicio IS NULL
                 OR co.vacaciones_fin IS NULL
                 OR CURRENT_DATE NOT BETWEEN co.vacaciones_inicio AND co.vacaciones_fin )
           AND COALESCE(co.dias_disponibles->>$3::text, 'true')::boolean = TRUE
         ORDER BY co.orden ASC
         LIMIT 1
    `, [ordenInicio, viaje.conductor_id, dia]);
    return r.rowCount ? r.rows[0] : null;
}

async function reasignarUno(client, viaje, motivo) {
    const operadorTimeout = await timeoutDeOperador(viaje.operador_cif);
    const choferActualOverride = await client.query(`
        SELECT timeout_aceptacion_min FROM chofocles_choferes_orden
         WHERE usuario_id = $1
    `, [viaje.conductor_id]);
    const overrideMin = choferActualOverride.rowCount ? choferActualOverride.rows[0].timeout_aceptacion_min : null;
    const timeoutMin = overrideMin || operadorTimeout || TIMEOUT_DEFECTO_MIN;

    if (Number(viaje.minutos) < timeoutMin) {
        return null;       // todavía dentro del timeout
    }

    const siguiente = await siguienteChoferDisponible(client, viaje);

    if (siguiente) {
        await client.query(
            `UPDATE viajes SET conductor_id = $1, updated_at = NOW() WHERE id = $2`,
            [siguiente.usuario_id, viaje.id]
        );
        await client.query(
            `INSERT INTO chofocles_reasignaciones (viaje_id, chofer_anterior, chofer_nuevo, motivo)
             VALUES ($1, $2, $3, $4)`,
            [viaje.id, viaje.conductor_id, siguiente.usuario_id, motivo]
        );
        return { reasignado: true, nuevoChofer: siguiente.usuario_id };
    }

    // Sin candidatos: caducar
    await client.query(`
        UPDATE viajes SET estado_id = (SELECT id FROM estados_viaje WHERE codigo = 'caducado'),
                          updated_at = NOW()
         WHERE id = $1
    `, [viaje.id]);
    await client.query(
        `INSERT INTO chofocles_reasignaciones (viaje_id, chofer_anterior, chofer_nuevo, motivo)
         VALUES ($1, $2, NULL, 'caducado')`,
        [viaje.id, viaje.conductor_id]
    );
    return { reasignado: false, caducado: true };
}

async function ejecutarTenant(empresaCodigo) {
    const pool = getTenantPool(empresaCodigo);
    const client = await pool.connect();
    let total = 0;
    try {
        await client.query('BEGIN');
        const viajes = await viajesAReasignar(client);
        for (const v of viajes) {
            const r = await reasignarUno(client, v, 'timeout');
            if (r && (r.reasignado || r.caducado)) total += 1;
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[reasignacion] ${empresaCodigo} error:`, e.message);
    } finally {
        client.release();
    }
    if (total > 0) {
        console.log(`[reasignacion] ${empresaCodigo}: ${total} viajes movidos/caducados`);
    }
}

async function ciclo() {
    let empresas;
    try {
        empresas = await empresasChofocles();
    } catch (e) {
        console.error('[reasignacion] error listando empresas:', e.message);
        return;
    }
    for (const e of empresas) {
        await ejecutarTenant(e.codigo);
    }
}

function start(log = console.log) {
    if (!ENABLED) {
        log('[reasignacion] deshabilitado (CHOFOCLES_REASIGNACION_ENABLED != true)');
        return;
    }
    if (!cron.validate(SCHEDULE)) {
        throw new Error(`CHOFOCLES_REASIGNACION_CRON inválido: ${SCHEDULE}`);
    }
    log(`[reasignacion] programado con expresión "${SCHEDULE}"`);
    cron.schedule(SCHEDULE, () => {
        ciclo().catch((e) => console.error('[reasignacion] ciclo error:', e));
    }, { timezone: process.env.TZ || 'Europe/Madrid' });
}

module.exports = { start, ciclo };
