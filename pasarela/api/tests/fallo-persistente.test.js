const { test } = require('node:test');
const assert = require('node:assert');
const { crearRastreadorFallos } = require('../src/utils/fallo-persistente');

test('umbral 2: reporta solo en el 2º fallo consecutivo y no repite', () => {
    const t = crearRastreadorFallos(2);
    assert.deepStrictEqual(t.fallo('k'), { reportar: false, fallos: 1, payload: null }); // 1er fallo: solo log
    assert.deepStrictEqual(t.fallo('k'), { reportar: true, fallos: 2, payload: null });  // 2º: reportar
    assert.deepStrictEqual(t.fallo('k'), { reportar: false, fallos: 3, payload: null }); // 3º: ya reportado, no repetir
});

test('ok() cierra la racha y avisa recuperación solo si se había reportado', () => {
    const t = crearRastreadorFallos(2);
    t.fallo('k');                                   // fallos=1, no reportado
    assert.deepStrictEqual(t.ok('k'), { recuperado: false, fallos: 1, payload: null });
    // nueva racha: vuelve a hacer falta llegar a 2
    assert.strictEqual(t.fallo('k').reportar, false);
    assert.strictEqual(t.fallo('k').reportar, true);
    assert.deepStrictEqual(t.ok('k'), { recuperado: true, fallos: 2, payload: null });
    // tras recuperación, racha limpia
    assert.strictEqual(t.size(), 0);
});

test('ok() sobre clave nunca fallida no avisa recuperación', () => {
    const t = crearRastreadorFallos(2);
    assert.deepStrictEqual(t.ok('nueva'), { recuperado: false, fallos: 0, payload: null });
});

test('el payload se construye solo al reportar y se devuelve al recuperar', () => {
    const t = crearRastreadorFallos(2);
    let veces = 0;
    const construir = (ciclos) => { veces++; return { message: `falla desde hace ${ciclos} ciclos` }; };

    t.fallo('k', construir);
    assert.strictEqual(veces, 0, 'el 1er fallo no reporta: no debe construir payload');

    const segundo = t.fallo('k', construir);
    assert.strictEqual(veces, 1);
    assert.deepStrictEqual(segundo.payload, { message: 'falla desde hace 2 ciclos' });

    t.fallo('k', construir);
    assert.strictEqual(veces, 1, 'ya reportado: no vuelve a construir');

    // Al recuperarse devuelve EL MISMO payload con el que se avisó (el receptor
    // identifica el error por su firma, que sale de esos datos).
    const rec = t.ok('k');
    assert.strictEqual(rec.recuperado, true);
    assert.strictEqual(rec.fallos, 3);
    assert.deepStrictEqual(rec.payload, { message: 'falla desde hace 2 ciclos' });
});

test('racha no reportada: al recuperarse no hay payload que reenviar', () => {
    const t = crearRastreadorFallos(2);
    t.fallo('k', () => ({ message: 'x' }));
    const rec = t.ok('k');
    assert.strictEqual(rec.recuperado, false);
    assert.strictEqual(rec.payload, null);
});

test('claves independientes cuentan por separado', () => {
    const t = crearRastreadorFallos(2);
    t.fallo('a');
    assert.strictEqual(t.fallo('b').reportar, false); // b va por su cuenta
    assert.strictEqual(t.fallo('a').reportar, true);  // a llega a 2
});

test('umbral 1: reporta al primer fallo', () => {
    const t = crearRastreadorFallos(1);
    assert.strictEqual(t.fallo('k').reportar, true);
});

test('purgar borra solo claves del prefijo que no estén vivas', () => {
    const t = crearRastreadorFallos(2);
    t.fallo('cred1:100');
    t.fallo('cred1:200');
    t.fallo('cred2:100');
    // Tras un ciclo, en cred1 solo sigue viva 100; 200 desapareció de la cola.
    t.purgar('cred1:', new Set(['cred1:100']));
    assert.strictEqual(t.size(), 2);          // cred1:100 y cred2:100
    // cred1:200 olvidada (nueva racha empezaría de 0)
    assert.strictEqual(t.fallo('cred1:200').fallos, 1);
    // cred2:100 intacta (otro prefijo, no se tocó)
    assert.strictEqual(t.fallo('cred2:100').fallos, 2);
});

test('umbral inválido lanza', () => {
    assert.throws(() => crearRastreadorFallos(0));
    assert.throws(() => crearRastreadorFallos(1.5));
});
