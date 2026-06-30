const { test } = require('node:test');
const assert = require('node:assert');
const { crearRastreadorFallos } = require('../src/utils/fallo-persistente');

test('umbral 2: reporta solo en el 2º fallo consecutivo y no repite', () => {
    const t = crearRastreadorFallos(2);
    assert.deepStrictEqual(t.fallo('k'), { reportar: false, fallos: 1 }); // 1er fallo: solo log
    assert.deepStrictEqual(t.fallo('k'), { reportar: true, fallos: 2 });  // 2º: reportar
    assert.deepStrictEqual(t.fallo('k'), { reportar: false, fallos: 3 }); // 3º: ya reportado, no repetir
});

test('ok() cierra la racha y avisa recuperación solo si se había reportado', () => {
    const t = crearRastreadorFallos(2);
    t.fallo('k');                                   // fallos=1, no reportado
    assert.deepStrictEqual(t.ok('k'), { recuperado: false, fallos: 1 });
    // nueva racha: vuelve a hacer falta llegar a 2
    assert.strictEqual(t.fallo('k').reportar, false);
    assert.strictEqual(t.fallo('k').reportar, true);
    assert.deepStrictEqual(t.ok('k'), { recuperado: true, fallos: 2 });
    // tras recuperación, racha limpia
    assert.strictEqual(t.size(), 0);
});

test('ok() sobre clave nunca fallida no avisa recuperación', () => {
    const t = crearRastreadorFallos(2);
    assert.deepStrictEqual(t.ok('nueva'), { recuperado: false, fallos: 0 });
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
