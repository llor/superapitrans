/**
 * Máquina de estados de viajes y paradas para chofocles.
 *
 * Mapea los comandos del chofer (que vienen de voz o de pulsar un botón)
 * a transiciones concretas. Esto centraliza la lógica para que se ajuste
 * a las "Órdenes primarias de voz" del GUION.
 */

// Códigos de estados_viaje (catálogo en BBDD del tenant).
const VIAJE_PENDIENTE = 'pendiente';
const VIAJE_ACEPTADO = 'aceptado';
const VIAJE_RECHAZADO = 'rechazado';
const VIAJE_EN_CURSO = 'en_curso';
const VIAJE_TERMINADO = 'terminado';
const VIAJE_CANCELADO_CHOFER = 'cancelado_chofer';

// Códigos de estados_parada (junto al `tipo` recogida/entrega).
const PARADA_PENDIENTE = 'pendiente';
const PARADA_EN_CAMINO = 'en_camino';
const PARADA_LLEGADO = 'llegado';
const PARADA_COMPLETADO = 'completado';
const PARADA_PROBLEMA = 'problema';

/**
 * Comandos del chofer y qué hacen. Cada comando devuelve una "intención" que
 * la capa de persistencia ejecuta. Esto permite testar las transiciones sin
 * tocar BBDD.
 *
 * Comandos (alineados con tabla "Órdenes primarias de voz"):
 *   - aceptar           : viaje pendiente → aceptado
 *   - rechazar          : viaje pendiente → rechazado (motivo en notas)
 *   - en_camino         : viaje aceptado → en_curso, próxima parada → en_camino
 *   - llegado           : parada actual en_camino → llegado
 *   - cargado/descargado: parada actual llegado → completado
 *                         (si quedan paradas, abrir la siguiente como en_camino)
 *   - terminar          : viaje en_curso → terminado (todas las paradas completas)
 *   - cancelar          : viaje en_curso → cancelado_chofer
 */

const COMANDOS = new Set([
    'aceptar',
    'rechazar',
    'en_camino',
    'llegado',
    'cargado',
    'descargado',
    'terminar',
    'cancelar',
]);

class TransicionInvalida extends Error {
    constructor(message) {
        super(message);
        this.name = 'TransicionInvalida';
    }
}

function _proximaParada(paradas) {
    // Devuelve la 1ª parada cuyo estado NO sea 'completado', ordenada por `orden`.
    const sorted = [...paradas].sort((a, b) => a.orden - b.orden);
    return sorted.find(p => p.estado_codigo !== PARADA_COMPLETADO);
}

function _todasParadasCompletadas(paradas) {
    return paradas.length > 0 && paradas.every(p => p.estado_codigo === PARADA_COMPLETADO);
}

/**
 * Aplica un comando y devuelve un plan de cambios:
 *   {
 *     viaje:   { nuevo_estado: 'aceptado' } | null,
 *     parada:  { id, nuevo_estado: 'en_camino', tipo } | null,
 *     parada_siguiente: { id, nuevo_estado: 'en_camino', tipo } | null,
 *   }
 *
 * `viaje` ya viene con su estado actual y `paradas` (cada parada con
 * `estado_codigo` y `tipo` ya unidos por SQL).
 */
function planificarComando(comando, { viaje, paradas, notas = '' }) {
    if (!COMANDOS.has(comando)) {
        throw new TransicionInvalida(`Comando desconocido: ${comando}`);
    }
    const plan = { viaje: null, parada: null, parada_siguiente: null };

    switch (comando) {
        case 'aceptar': {
            if (viaje.estado_codigo !== VIAJE_PENDIENTE) {
                throw new TransicionInvalida(
                    `'aceptar' solo válido si viaje está pendiente (actual: ${viaje.estado_codigo})`
                );
            }
            plan.viaje = { nuevo_estado: VIAJE_ACEPTADO };
            return plan;
        }

        case 'rechazar': {
            if (viaje.estado_codigo !== VIAJE_PENDIENTE) {
                throw new TransicionInvalida(
                    `'rechazar' solo válido si viaje está pendiente (actual: ${viaje.estado_codigo})`
                );
            }
            plan.viaje = { nuevo_estado: VIAJE_RECHAZADO, motivo_rechazo: notas };
            return plan;
        }

        case 'en_camino': {
            // Arranca el viaje. Marca viaje en_curso y la 1ª parada en_camino.
            if (viaje.estado_codigo !== VIAJE_ACEPTADO && viaje.estado_codigo !== VIAJE_EN_CURSO) {
                throw new TransicionInvalida(
                    `'en_camino' solo válido si viaje está aceptado o en curso (actual: ${viaje.estado_codigo})`
                );
            }
            const proxima = _proximaParada(paradas);
            if (!proxima) {
                throw new TransicionInvalida('No hay paradas pendientes');
            }
            if (proxima.estado_codigo !== PARADA_PENDIENTE) {
                throw new TransicionInvalida(
                    `Próxima parada ya no está pendiente (actual: ${proxima.estado_codigo})`
                );
            }
            if (viaje.estado_codigo === VIAJE_ACEPTADO) {
                plan.viaje = { nuevo_estado: VIAJE_EN_CURSO };
            }
            plan.parada = {
                id: proxima.id,
                tipo: proxima.tipo,
                nuevo_estado: PARADA_EN_CAMINO,
            };
            return plan;
        }

        case 'llegado': {
            const proxima = _proximaParada(paradas);
            if (!proxima || proxima.estado_codigo !== PARADA_EN_CAMINO) {
                throw new TransicionInvalida(
                    `No hay parada en estado 'en_camino' a la que poder llegar`
                );
            }
            plan.parada = {
                id: proxima.id,
                tipo: proxima.tipo,
                nuevo_estado: PARADA_LLEGADO,
            };
            return plan;
        }

        case 'cargado':
        case 'descargado': {
            const tipoEsperado = comando === 'cargado' ? 'recogida' : 'entrega';
            const proxima = _proximaParada(paradas);
            if (!proxima || proxima.estado_codigo !== PARADA_LLEGADO) {
                throw new TransicionInvalida(
                    `No hay parada en estado 'llegado' a la que aplicar '${comando}'`
                );
            }
            if (proxima.tipo !== tipoEsperado) {
                throw new TransicionInvalida(
                    `Comando '${comando}' aplicado a parada de tipo '${proxima.tipo}'`
                );
            }
            plan.parada = {
                id: proxima.id,
                tipo: proxima.tipo,
                nuevo_estado: PARADA_COMPLETADO,
            };
            // Si queda otra parada pendiente, la dejamos lista para el siguiente
            // 'en_camino'. NO la pasamos a en_camino automáticamente: el chofer
            // dirá "en camino" cuando arranque hacia ella.
            return plan;
        }

        case 'terminar': {
            if (viaje.estado_codigo !== VIAJE_EN_CURSO) {
                throw new TransicionInvalida(
                    `'terminar' solo válido si viaje está en curso (actual: ${viaje.estado_codigo})`
                );
            }
            // Todas las paradas tras la transición pendiente deberían estar
            // completadas. Si no lo están, error explícito.
            if (!_todasParadasCompletadas(paradas)) {
                throw new TransicionInvalida(
                    'No se puede terminar el viaje con paradas pendientes'
                );
            }
            plan.viaje = { nuevo_estado: VIAJE_TERMINADO };
            return plan;
        }

        case 'cancelar': {
            if (![VIAJE_ACEPTADO, VIAJE_EN_CURSO].includes(viaje.estado_codigo)) {
                throw new TransicionInvalida(
                    `'cancelar' solo válido si viaje está aceptado o en curso (actual: ${viaje.estado_codigo})`
                );
            }
            plan.viaje = { nuevo_estado: VIAJE_CANCELADO_CHOFER, motivo_rechazo: notas };
            return plan;
        }
    }
    throw new TransicionInvalida(`Comando ${comando} sin handler`);
}

module.exports = {
    COMANDOS,
    TransicionInvalida,
    planificarComando,
    // Constantes exportadas por si las quieren las rutas / tests
    VIAJE_PENDIENTE, VIAJE_ACEPTADO, VIAJE_RECHAZADO, VIAJE_EN_CURSO,
    VIAJE_TERMINADO, VIAJE_CANCELADO_CHOFER,
    PARADA_PENDIENTE, PARADA_EN_CAMINO, PARADA_LLEGADO, PARADA_COMPLETADO,
    PARADA_PROBLEMA,
};
