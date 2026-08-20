# ERRORES SOLVENTADOS — nodo de datos de superapitrans (carpeta `pasarela/`)

Archivo dedicado a la resolución de errores (norma «GUION.md — UN GUION DE
VERDAD» del CLAUDE.md global): qué falló, causa verificada y cómo se
solventó. Creado el 2026-08-20 trasladando las entradas de error del GUION.

## [2026-08-15] La recuperación de un corte no avisaba — EN DEV Y PROD

El corte de Satelles del 14/08 (HTTP 522 de Cloudflare, GFE, 10 min) avisó
por email pero su curación solo fue al log: incumplía la norma de avisar
del arreglo por la misma vía. Los seis rastreadores de racha mandan ahora
`reportRecovery` con el payload guardado (`utils/fallo-persistente.js`) y el
receptor emite «CORREJIDO: <asunto original>». Probado E2E en dev y prod.
De paso: `npm test` no arrancaba con Node 22 (`node --test tests/` ya no
acepta directorio); el script pasa el patrón de ficheros.

## [2026-06-30] numero_pedido desbordaba y los pedidos se atascaban — EN DEV Y PROD

En rutas de 10-12 entregas la concatenación de referencias superaba el
VARCHAR(100) de `pedidos.numero_pedido`: «value too long» → ROLLBACK, el
pedido no se importaba y reaparecía en la cola de Satelles ciclo tras ciclo
(detectado en GFE: 4 publicaciones atascadas toda una mañana). El catch del
bucle era mudo (solo log), por eso pasó inadvertido. Migración 0017 a
VARCHAR(500) en todas las BDs tenant; verificado E2E con GFE.

## [2026-06-27] Satelles bloqueado por Cloudflare desde el 22/05 — EN PROD

Desde el 22/05 el host de Satelles devolvía challenge anti-bot (HTTP 403,
`cf-mitigated: challenge`) a cualquier IP: un mes sin datos. Causa: cambio
en la infra de Satelles, no nuestras credenciales. Arreglo: allowlist de la
IP de salida del servidor (149.86.232.18) en su Cloudflare; verificado el
27/06 (el token endpoint responde 400 JSON normal, sin challenge).
LIMITACIÓN: solo la IP de prod; dev sigue bloqueado.

## [2026-06-24] Los fallos del cron de sync no avisaban — EN PROD

El corte de Satelles llevaba un mes sin avisar: los catch de
`satelles/sync.js` y `pcs-valencia/sync.js` se tragaban el fallo de
descarga (solo log). Arreglo: reporte al receptor central en ambos sync y
en `cron.js` (dedup 1 email/hora); verificado E2E en prod. El 30/06 se
refinó con el umbral de persistencia de 2 ciclos (ver GUION).

## [2026-05-26] 500 al abrir la empresa TEST en el admin — EN PROD

La migración 0014 no se había aplicado a `saycu_pasarela_test`: su
comentario la circunscribía a tenants con PCS Valencia, pero el endpoint de
pedidos del admin consulta `pedidos_pcs_extra.terminal_devolucion_codigo`
en CUALQUIER tenant con el servicio activo. Aplicada a los 4 tenants; regla
derivada: toda `*_tenant_*` se aplica a TODOS los tenants del servicio.

## [2026-05-06] Migración lanzada como postgres dejaba owner postgres — EN DEV Y PROD

La 0002 ejecutada con `psql -U postgres` creaba las tablas tenant con owner
postgres y el nodo fallaba con «permission denied» aunque la BD fuera de
saycutrans. La migración termina desde entonces con
`ALTER … OWNER TO saycutrans` idempotente.

## [2026-05] 404 en /pasarela/health en el primer despliegue — EN DEV Y PROD

Caddy reescribe `/pasarela/<path>` a `/api{path}` y el handler solo existía
en `/health`. Arreglo en el Express: registrar `/health` (healthcheck
Docker interno) y `/api/health` (externo, tras el rewrite).

## [2026-05] permission denied for table pedidos con DB_USER=saycuadmin — EN DEV Y PROD

El `.env` traía `DB_USER=saycuadmin`, pero el auto-provisioning crea las
BDs tenant con owner `saycutrans` y saycuadmin no lee sus tablas. Arreglo:
`DB_USER=saycutrans` por defecto, documentado en los `.env-*.example`.
