const test = require('node:test');
const assert = require('node:assert/strict');

const {
    planificarComando, TransicionInvalida,
    VIAJE_PENDIENTE, VIAJE_ACEPTADO, VIAJE_EN_CURSO, VIAJE_TERMINADO,
    PARADA_PENDIENTE, PARADA_EN_CAMINO, PARADA_LLEGADO, PARADA_COMPLETADO,
} = require('./transiciones');

function viaje(estado_codigo) { return { estado_codigo }; }
function parada(id, tipo, estado_codigo, orden = id) {
    return { id, tipo, estado_codigo, orden };
}

test('aceptar: pendiente → aceptado', () => {
    const plan = planificarComando('aceptar', {
        viaje: viaje(VIAJE_PENDIENTE),
        paradas: [parada(1, 'recogida', PARADA_PENDIENTE)],
    });
    assert.equal(plan.viaje.nuevo_estado, 'aceptado');
    assert.equal(plan.parada, null);
});

test('aceptar falla si el viaje ya estaba aceptado', () => {
    assert.throws(
        () => planificarComando('aceptar', { viaje: viaje(VIAJE_ACEPTADO), paradas: [] }),
        TransicionInvalida,
    );
});

test('en_camino: viaje aceptado + 1ª parada pendiente → viaje en_curso, parada en_camino', () => {
    const plan = planificarComando('en_camino', {
        viaje: viaje(VIAJE_ACEPTADO),
        paradas: [
            parada(1, 'recogida', PARADA_PENDIENTE, 1),
            parada(2, 'entrega', PARADA_PENDIENTE, 2),
        ],
    });
    assert.equal(plan.viaje.nuevo_estado, 'en_curso');
    assert.equal(plan.parada.id, 1);
    assert.equal(plan.parada.nuevo_estado, 'en_camino');
});

test('llegado: parada en_camino → llegado', () => {
    const plan = planificarComando('llegado', {
        viaje: viaje(VIAJE_EN_CURSO),
        paradas: [parada(1, 'recogida', PARADA_EN_CAMINO, 1)],
    });
    assert.equal(plan.parada.nuevo_estado, 'llegado');
});

test('cargado: parada de recogida llegada → completada', () => {
    const plan = planificarComando('cargado', {
        viaje: viaje(VIAJE_EN_CURSO),
        paradas: [
            parada(1, 'recogida', PARADA_LLEGADO, 1),
            parada(2, 'entrega', PARADA_PENDIENTE, 2),
        ],
    });
    assert.equal(plan.parada.id, 1);
    assert.equal(plan.parada.nuevo_estado, 'completado');
});

test("'cargado' aplicado a parada de entrega lanza error", () => {
    assert.throws(
        () => planificarComando('cargado', {
            viaje: viaje(VIAJE_EN_CURSO),
            paradas: [parada(1, 'entrega', PARADA_LLEGADO, 1)],
        }),
        TransicionInvalida,
    );
});

test('descargado en parada de entrega llegada', () => {
    const plan = planificarComando('descargado', {
        viaje: viaje(VIAJE_EN_CURSO),
        paradas: [
            parada(1, 'recogida', PARADA_COMPLETADO, 1),
            parada(2, 'entrega', PARADA_LLEGADO, 2),
        ],
    });
    assert.equal(plan.parada.id, 2);
    assert.equal(plan.parada.nuevo_estado, 'completado');
});

test('terminar: viaje en_curso con todas las paradas completas → terminado', () => {
    const plan = planificarComando('terminar', {
        viaje: viaje(VIAJE_EN_CURSO),
        paradas: [
            parada(1, 'recogida', PARADA_COMPLETADO, 1),
            parada(2, 'entrega', PARADA_COMPLETADO, 2),
        ],
    });
    assert.equal(plan.viaje.nuevo_estado, 'terminado');
});

test('terminar falla si quedan paradas no completas', () => {
    assert.throws(
        () => planificarComando('terminar', {
            viaje: viaje(VIAJE_EN_CURSO),
            paradas: [
                parada(1, 'recogida', PARADA_COMPLETADO, 1),
                parada(2, 'entrega', PARADA_LLEGADO, 2),
            ],
        }),
        TransicionInvalida,
    );
});

test('flujo completo (multi-destino): aceptar → en_camino → llegado → cargado → en_camino → llegado → descargado → terminar', () => {
    let v = viaje(VIAJE_PENDIENTE);
    let paradas = [
        parada(1, 'recogida', PARADA_PENDIENTE, 1),
        parada(2, 'entrega', PARADA_PENDIENTE, 2),
    ];

    function aplicar(plan) {
        if (plan.viaje) v = viaje(plan.viaje.nuevo_estado);
        if (plan.parada) {
            paradas = paradas.map(p => p.id === plan.parada.id
                ? { ...p, estado_codigo: plan.parada.nuevo_estado } : p);
        }
    }

    aplicar(planificarComando('aceptar', { viaje: v, paradas }));
    aplicar(planificarComando('en_camino', { viaje: v, paradas }));
    aplicar(planificarComando('llegado', { viaje: v, paradas }));
    aplicar(planificarComando('cargado', { viaje: v, paradas }));
    aplicar(planificarComando('en_camino', { viaje: v, paradas }));
    aplicar(planificarComando('llegado', { viaje: v, paradas }));
    aplicar(planificarComando('descargado', { viaje: v, paradas }));
    aplicar(planificarComando('terminar', { viaje: v, paradas }));

    assert.equal(v.estado_codigo, VIAJE_TERMINADO);
    assert.deepEqual(paradas.map(p => p.estado_codigo), [PARADA_COMPLETADO, PARADA_COMPLETADO]);
});

test('comando desconocido lanza TransicionInvalida', () => {
    assert.throws(
        () => planificarComando('volar', { viaje: viaje(VIAJE_PENDIENTE), paradas: [] }),
        TransicionInvalida,
    );
});
