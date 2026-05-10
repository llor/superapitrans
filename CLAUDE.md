DIRECTRICES — superapitrans
Complementan las directrices globales del CLAUDE.md de /proyectos/
y las directrices de grupo en el CLAUDE.md de /proyectos/saycu/


NATURALEZA DEL PROYECTO
-----------------------

superapitrans es un servicio API en `debian.saycusoft.es` consumido por
varios tipos de clientes (web, app móvil, sub-servicios, terceros). Es el
contenedor común de servicios API del grupo saycutrans.

Sub-proyectos dentro de esta carpeta:
- `chofocles/` (extracción de órdenes de transporte por email).
- (otros, pendiente de especificación).


SERVIDOR Y ENTORNO
------------------

- Servidor: `debian.saycusoft.es` (mismos alias del grupo: `saycu` prod,
  `saycudev` dev).
- TODO en Docker, dev y prod. Si funciona en Docker local → funciona en
  prod.
- Detección automática dev/prod vía `/etc/hosts` y `.env-dev` / `.env-prod`,
  igual que saycutrans.
- Despliegue por scripts en `_scripts/` del proyecto. Nada de `scp` directo
  ni `docker compose` manual.


BBDD
----

- Patrón Saycu: PostgreSQL multi-tenant. `saycu_admin` como catálogo
  maestro compartido; una BD por empresa por producto cuando aplique
  (`saycu_<producto>_<CODIGO>`).
- Migraciones obligatorias en `db/migrations/` con `IF NOT EXISTS` /
  `IF EXISTS` (idempotentes). Aplicar primero en `saycudev` y luego en
  `saycu`.


COHERENCIA CON saycutrans
-------------------------

- Reutilizar el sistema de auth de saycutrans (JWT, claves env, formato de
  payload) salvo decisión explícita en contra.
- Compartir el tema CSS `saycu-theme` para cualquier panel/web hija.
- Compartir patrones de logger, response y middleware con saycutrans
  cuando sea aplicable.


FRONTAL CADDY = system-caddy GLOBAL
-----------------------------------

superapitrans NO tiene Caddy propio. Se registra como bloque dentro del
frontal único del servidor (`system-caddy`, en
`saycu/saycucontrol/system-caddy/`).

Para añadir/modificar el routing de superapitrans hay que tocar
`saycucontrol/system-caddy/`:
- `conf/Caddyfile.dev` y `conf/Caddyfile.prod` (bloques superapitrans).
- `docker-compose.yml` (red externa `superapitrans_network` y variable
  `BASE_DOMAIN_SUPERAPI`).
- `.env` del servidor (`BASE_DOMAIN_SUPERAPI=<dominio>`).

Tras tocar lo anterior: validar Caddyfile (`caddy validate`), rsync a
saycudev/saycu y recrear el contenedor `system_caddy`.


DOMINIOS Y SUBDOMINIOS
----------------------

**Variable única `BASE_DOMAIN_SUPERAPI`** en el `.env` de system-caddy.
Único punto de cambio cuando se asigne el dominio definitivo. Hoy
`superapi.eoden.es`; mañana, lo que sea.

Subdominios cableados:
- PROD: `api.${BASE_DOMAIN_SUPERAPI}`     → todos los sub-servicios por
  path (`/chofocles/...`, futuros).
- DEV : `dev-api.${BASE_DOMAIN_SUPERAPI}` → ídem.

Path-routing por sub-servicio (Caddy `handle_path /<servicio>/*` +
`rewrite * /api{path}`). Para añadir un nuevo sub-servicio basta replicar
el bloque en los Caddyfile apuntando a su contenedor.

DNS reservados pero sin cablear todavía: `panel`, `dev-panel`, `www`,
`dev-www`. Cuando se necesiten, añadir bloques en los Caddyfile de
system-caddy.

PROHIBIDO:
- Hardcodear `superapi.eoden.es` (ni cualquier otro dominio) en el código
  o en docker-compose. Siempre vía `${BASE_DOMAIN_SUPERAPI}` o sus
  derivados.
- Almacenar dominios en BBDD. Caddy/DNS/Frontends/APK los necesitan en
  build/start time, no en runtime de aplicación.

Cuando se cambie el dominio definitivo:
- 1 línea en `system-caddy/.env` (saycu y saycudev).
- DNS del registrar (registros A nuevos).
- Recompilar y redistribuir cualquier APK que lo lleve compilado.
- Recompilar cualquier frontend que lo reciba como build arg.
- Actualizar monitorización Saycu (ACCESS_URLS, HEALTH_URLS).


RED DOCKER `superapitrans_network`
----------------------------------

Red externa compartida entre `system_caddy` y los sub-servicios de
superapitrans. Debe existir antes de arrancar `system_caddy`. Crear una
sola vez por servidor:

    docker network create superapitrans_network

Cada sub-servicio (chofocles, futuros) la declara como `external: true`
en su propio `docker-compose.yml` y conecta su contenedor backend a ella.


REGLA DE ALCANCE
----------------

Aplican íntegramente las reglas inviolables del CLAUDE.md global y del
CLAUDE.md del grupo Saycu:
- Coherencia de diseño (variables CSS y clases existentes).
- Alcance exacto: ni más ni menos de lo pedido.
- Cero fallbacks, cero hardcoding.
- Postgres por defecto para datos persistentes.
- Lo que sea visible al usuario debe desplegarse antes de darlo por hecho.
