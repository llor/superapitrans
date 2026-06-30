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
 *   const r = t.fallo(key);  // r.reportar === true solo al 2º fallo seguido
 *   if (r.reportar) reportError({ ... , ciclos: r.fallos });
 *   t.ok(key);               // racha limpiada; r.recuperado si venía reportada
 */

function crearRastreadorFallos(umbral = 2) {
    if (!Number.isInteger(umbral) || umbral < 1) {
        throw new Error(`umbral debe ser entero >= 1 (recibido: ${umbral})`);
    }
    const rachas = new Map(); // key -> { fallos, reportado }

    return {
        /**
         * Registra un fallo para `key`. Devuelve { reportar, fallos }.
         * `reportar` es true SOLO en el ciclo en que la racha alcanza el
         * umbral (la primera vez); en los siguientes fallos seguidos es
         * false (ya se reportó) para no spamear.
         */
        fallo(key) {
            const r = rachas.get(key) || { fallos: 0, reportado: false };
            r.fallos += 1;
            rachas.set(key, r);
            if (!r.reportado && r.fallos >= umbral) {
                r.reportado = true;
                return { reportar: true, fallos: r.fallos };
            }
            return { reportar: false, fallos: r.fallos };
        },

        /**
         * Registra un éxito para `key` (cierra la racha). Devuelve
         * { recuperado, fallos }: `recuperado` es true si la racha que se
         * cierra llegó a reportarse (sirve para loguear la recuperación).
         */
        ok(key) {
            const r = rachas.get(key);
            rachas.delete(key);
            return { recuperado: !!(r && r.reportado), fallos: r ? r.fallos : 0 };
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
