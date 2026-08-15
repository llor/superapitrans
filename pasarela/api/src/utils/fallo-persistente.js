/**
 * Rastreador de rachas de fallo con umbral de persistencia.
 *
 * Sirve para no inundar el receptor de errores con fallos TRANSITORIOS que
 * se curan solos en el siguiente ciclo del cron (p.ej. un 503/corte de
 * Cloudflare del proveedor). Cuenta fallos CONSECUTIVOS por clave y solo
 * autoriza a reportar cuando la racha alcanza `umbral` ciclos, una sola vez
 * por racha. Un éxito limpia la racha.
 *
 * El estado vive en memoria del proceso (el cron es de larga duración). Si
 * el proceso se reinicia, las rachas se pierden y un corte en curso vuelve
 * a contar desde 0 — como mucho un ciclo de más de margen; aceptable.
 *
 * Uso:
 *   const t = crearRastreadorFallos(2);
 *   const r = t.fallo(key, (ciclos) => ({ message: `... ${ciclos} ciclos ...` }));
 *   if (r.reportar) reportError(r.payload);   // r.reportar solo al 2º fallo seguido
 *   const rec = t.ok(key);                    // racha limpiada
 *   if (rec.recuperado) reportRecovery(rec.payload);  // mismo payload del aviso
 *
 * El payload se construye DENTRO del rastreador (por eso se pasa una función y
 * no un objeto) para que el aviso de recuperación pueda repetir exactamente el
 * mismo que se reportó: el receptor identifica el error por su firma, que sale
 * de esos datos. Si el payload se guardara por separado, un descuido dejaría el
 * error avisado y su arreglo sin avisar.
 */

function crearRastreadorFallos(umbral = 2) {
    if (!Number.isInteger(umbral) || umbral < 1) {
        throw new Error(`umbral debe ser entero >= 1 (recibido: ${umbral})`);
    }
    const rachas = new Map(); // key -> { fallos, reportado, payload }

    return {
        /**
         * Registra un fallo para `key`. Devuelve { reportar, fallos, payload }.
         * `reportar` es true SOLO en el ciclo en que la racha alcanza el
         * umbral (la primera vez); en los siguientes fallos seguidos es
         * false (ya se reportó) para no spamear.
         *
         * `construirPayload(fallos)` se invoca únicamente en ese ciclo, y lo que
         * devuelve se guarda en la racha para poder repetirlo al recuperarse.
         */
        fallo(key, construirPayload) {
            const r = rachas.get(key) || { fallos: 0, reportado: false, payload: null };
            r.fallos += 1;
            rachas.set(key, r);
            if (!r.reportado && r.fallos >= umbral) {
                r.reportado = true;
                r.payload = typeof construirPayload === 'function'
                    ? construirPayload(r.fallos)
                    : null;
                return { reportar: true, fallos: r.fallos, payload: r.payload };
            }
            return { reportar: false, fallos: r.fallos, payload: null };
        },

        /**
         * Registra un éxito para `key` (cierra la racha). Devuelve
         * { recuperado, fallos, payload }: `recuperado` es true si la racha que
         * se cierra llegó a reportarse, y `payload` es el mismo que se reportó,
         * para avisar de la recuperación con la misma firma.
         */
        ok(key) {
            const r = rachas.get(key);
            rachas.delete(key);
            return {
                recuperado: !!(r && r.reportado),
                fallos: r ? r.fallos : 0,
                payload: r ? r.payload : null,
            };
        },

        /**
         * Olvida las rachas cuya clave empieza por `prefijo` y NO está en
         * `keysVivas`. Evita fugas de memoria por claves efímeras (p.ej. una
         * publicación que desaparece de la cola del proveedor sin pasar por
         * ok()). El prefijo acota la purga a un ámbito (una credencial), para
         * no borrar rachas de otros.
         */
        purgar(prefijo, keysVivas) {
            for (const k of rachas.keys()) {
                if (k.startsWith(prefijo) && !keysVivas.has(k)) rachas.delete(k);
            }
        },

        /** Nº de rachas vivas (para tests/diagnóstico). */
        size() { return rachas.size; },
    };
}

module.exports = { crearRastreadorFallos };
