# superapitrans (futuro: SaycuNode)

Última actualización: 2026-06-03.


OBJETIVO
--------

Nodo de datos del grupo Saycu: obtiene datos de proveedores externos y los
ofrece vía API. Alojado en `debian.saycusoft.es`.

NOTA: renombrado pendiente a SaycuNode (Fase B). Por ahora el repo, la
carpeta y la infra siguen llamándose `superapitrans`.


ARQUITECTURA Saycu (cómo encaja superapitrans)
-----------------------------------------------

El servidor tiene UN frontal Caddy global, **`system_caddy`**, que vive
fuera de este proyecto: `/var/opt/saycucontrol/system-caddy/`. Es el
único contenedor que ocupa los puertos 80/443 del host. Cada proyecto
del grupo Saycu se "registra" allí como un bloque de Caddyfile, y se
conecta vía una red Docker externa.

superapitrans está registrado en `system-caddy` como un proyecto más:
- Variable de entorno: `BASE_DOMAIN_SUPERAPI=superapi.eoden.es` en
  `/var/opt/saycucontrol/system-caddy/.env`.
- Red Docker externa: `superapitrans_network` (debe existir antes de
  arrancar `system_caddy`).
- Bloques añadidos a:
  - `system-caddy/conf/Caddyfile.prod`: `api.{$BASE_DOMAIN_SUPERAPI}`.
  - `system-caddy/conf/Caddyfile.dev` : `dev-api.{$BASE_DOMAIN_SUPERAPI}`.

superapitrans no tiene Caddy propio. La carpeta contiene:
- `pasarela/` (el nodo de datos propiamente dicho).
- `documentos/` (specs de proveedores: Satelles, PCS Valencia, etc.).
- `_scripts/detect_env.sh` (utilidad para deploys).
- GUION.md y CLAUDE.md.

chofocles se separó a su propio repo el 2026-06-03: `llor/chofocles`
(local: `saycu/chofocles/`). Ya no vive aquí.


CONEXIONES Y ACCESOS
--------------------

- **Servidor:** debian.saycusoft.es. Alias SSH: `saycu` (prod),
  `saycudev` (dev).
- **Carpeta local:** `/Volumes/THUND/proyectos/saycu/superapitrans/`.
- **Carpeta remota:** `/var/opt/superapitrans/` (en saycudev y saycu).
- **Subdominio público de API**:
  - PROD: `api.superapi.eoden.es`
  - DEV : `dev-api.superapi.eoden.es`
- **Path por sub-servicio:** `https://api.{BASE_DOMAIN}/<servicio>/...`.
  system-caddy strippea `/<servicio>/` y reescribe `/api{path}` antes de
  hacer reverse-proxy al backend del sub-servicio. El código del
  sub-servicio no sabe que vive detrás de un prefijo.
- **BBDD:** PostgreSQL compartida con el resto del grupo Saycu por la red
  externa `system_postgres_net`.


SUBDOMINIOS RESERVADOS (DNS apuntando a saycu/saycudev, sin cablear aún)
-------------------------------------------------------------------------

DNS ya creado:
- `api.superapi.eoden.es`        → 149.86.232.18 (saycu / prod)   ✅ cableado
- `dev-api.superapi.eoden.es`    → 149.86.233.79 (saycudev / dev) ✅ cableado
- `panel.superapi.eoden.es`      → 149.86.232.18                  ⏳ sin cablear
- `dev-panel.superapi.eoden.es`  → 149.86.233.79                  ⏳ sin cablear
- `www.superapi.eoden.es`        → 149.86.232.18                  ⏳ sin cablear
- `dev-www.superapi.eoden.es`    → 149.86.233.79                  ⏳ sin cablear

Cuando se necesite alguno (p. ej. el panel cuando se aborde el bloque 2
de chofocles), añadir el bloque correspondiente a
`system-caddy/conf/Caddyfile.{dev,prod}` con el reverse_proxy adecuado.


CAMBIO DE DOMINIO (futuro)
--------------------------

Cuando se asigne el dominio definitivo:
1. Editar 1 línea en `/var/opt/saycucontrol/system-caddy/.env` (en saycu y
   en saycudev): `BASE_DOMAIN_SUPERAPI=<nuevo-dominio>`.
2. Recrear el contenedor `system_caddy` en ambos servidores.
3. DNS del registrar (registros A nuevos).
4. Recompilar APKs/frontends que lleven la URL hardcodeada por build arg.
5. (Opcional, cosmético) renombrar la carpeta `superapitrans/` por
   `<nuevo-nombre>/` con `mv` — no afecta a runtime.


EL NODO (pasarela/)
-------------------

- **pasarela/** — sistema de API con keys (inbound clientes N2 + outbound
  proveedores) y tabla de datos canónica.
  - API: `https://api.{BASE_DOMAIN}/pasarela/...` → backend interno
    `pasarela_api:3412` con prefijo `/api`.
  - Detalle: ver `pasarela/GUION.md`.

NOTA HISTÓRICA: chofocles y chofoclesapp vivieron aquí hasta 2026-06-03.
Separados a repo propio `llor/chofocles` (local: `saycu/chofocles/`).
Siguen compartiendo el subdominio `api.{BASE_DOMAIN}` y la red Docker
`superapitrans_network` en los servidores hasta que la Fase B de
infraestructura los desacople.


DECISIONES DE DISEÑO — CONFIRMADAS
----------------------------------

1. **Sin Caddy propio.** superapitrans se registra en `system-caddy`
   global, igual que el resto de proyectos Saycu. Coherencia plena.
2. **Variable única `BASE_DOMAIN_SUPERAPI`** en el `.env` de
   system-caddy. Único punto de cambio cuando llegue el dominio
   definitivo.
3. **Subdominio API único** (`api.` y `dev-api.`) que cubre todos los
   sub-servicios por path. Decidido por el usuario.
4. **No tocar el código de los sub-servicios** para encajarlos detrás
   del frontal: el `handle_path` + `rewrite /api{path}` lo hace Caddy.
5. **Sin tablas para dominios.** Caddy/DNS/Frontends/APK los necesitan
   en build/start time, no en runtime.
6. **Cada sub-servicio mantiene su `docker-compose.yml`.** superapitrans
   no orquesta nada. El sub-servicio se conecta a la red externa
   `superapitrans_network` para que `system_caddy` pueda alcanzarlo.


ARRANQUE EN EL SERVIDOR (operativa)
------------------------------------

Pre-condición: la red `superapitrans_network` debe existir antes de
arrancar `system_caddy`. Una sola vez por servidor:

    docker network create superapitrans_network

Después, el nodo (pasarela/) arranca desde su propia carpeta con su
propio compose, conectado a `superapitrans_network` como red externa.

chofocles sigue usando `superapitrans_network` en los servidores
(desplegado en `/var/opt/superapitrans/chofocles/`) hasta que la
Fase B de infra lo mueva a su propia red.
