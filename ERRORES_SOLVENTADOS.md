# ERRORES SOLVENTADOS — superapitrans

Errores reales con causa verificada y arreglo (norma del 2026-08-20): qué
falló, causa verificada, qué se cambió y en qué fichero, y la limitación si
la hay. Lo anterior a este fichero vive en el historial git y en el GUION.

## [2026-08-30] Un JSON mal formado acababa en 500 y en un email de aviso — EN DEV (hotfix/error-reporter-parche-express), VIVO EN PROD

Qué falló: un cuerpo de petición con JSON no válido —un cliente que envía mal
la petición, no un fallo del servidor— salía por el manejador global de
errores como 500 y disparaba el email de aviso del ErrorReporter. Causa
verificada: el manejador global de `pasarela/api/src/app.js` respondía 500 con `internal_error` y llamaba a `reportError` sin mirar el status del error. Arreglo (encargo del usuario del 30/08, ya aplicado en
saycutrans el 28/08): el manejador devuelve el 4xx con su status y sin reporte (`bad_json` cuando es un cuerpo mal formado), y el mismo criterio va en `attachExpress` del cliente compartido. Comprobado en dev con un POST de cuerpo roto:
HTTP 400 con el texto «Cuerpo de la petición mal formado (JSON no válido)» y
CERO filas nuevas en `saycu_admin.error_reports`. Limitación: la rama de los
5xx no se ha tocado ni se ha provocado un 500 real para no disparar avisos.

