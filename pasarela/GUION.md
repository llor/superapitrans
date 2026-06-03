# pasarela (futuro: SaycuNode)

Última actualización: 2026-06-03. Nodo de datos del grupo Saycu:
lee APIs externas (proveedor por proveedor) y persiste lo intercambiado
en 4 tablas canónicas multi-tenant (`saycu_pasarela_<CODIGO>`),
exponiéndolo después por una API inbound con bearer key.

Cambios 2026-06-03:
- **customerShipment (nº expedición)**: migración 0015, columna
  `pedidos.expedicion VARCHAR(200)`. Mapper Satelles extrae
  `delivery.customerShipment`, concatena con `;`. Aplicada a todas las
  BDs tenant en dev y prod. Visor admin actualizado.
- **chofocles separado**: ya no vive en este repo. Repo propio
  `llor/chofocles` (local: `saycu/chofocles/`).
- **PDF API Satelles v1.8.0**: guardado en `documentos/satelles/`.

ALCANCE POR PROVEEDOR — DECISIÓN DEL N1 (2026-06-03)
-----------------------------------------------------
- **Satelles**: SOLO datos para facturación. No nos interesa nada más
  porque solo podemos hacer lo que Satelles nos deja hacer. Campos de la
  API 1.7.0/1.8.0 no implementados (modos de reparto, CRUD pedidos,
  legs/odómetros, shippingActions) salvo petición expresa del N1.
- **PCS Valencia**: alcance más amplio, nos dejan hacer más cosas.
  Extensible (outbound, más tipos de mensaje) cuando toque.

SIGUIENTE PASO — CLIENTE C# EN SERVIDOR WINDOWS
------------------------------------------------
Montar programa C# en el servidor Windows (acceso vía proyecto Guindon,
ver `proyectos/guindon/`) que consuma la API de SaycuNode. Previsto
para 2026-06-04.

Cambios 2026-05-26:
- Migración 0014 aplicada a `saycu_pasarela_test` en prod (faltaba; el
  comentario inicial del fichero la circunscribía a tenants con PCS
  Valencia, pero el endpoint
  `admin.saycusoft.es/api/admin/pasarela-datos/empresas/:cod/pedidos`
  consulta `pedidos_pcs_extra.terminal_devolucion_codigo` para CUALQUIER
  tenant con `pasarela` activo y reventaba con 500 al abrir TEST). Tras
  el fix, la columna existe en DEMO/GFE/JSR/TEST (los 4 tenants con
  servicio pasarela). Regla efectiva: la 0014 (y todas las `*_tenant_*`)
  se aplican a TODOS los `saycu_pasarela_<CODIGO>` con `pasarela` en
  `saycu_admin.empresas.servicios`, no solo a los con PCS Valencia.
- Auditoría de drift de schema tenant unificada en el script general
  del grupo: `saycu/_scripts/audit-tenant-schema.sh [dev|prod] [pasarela]`.
  Crea BD efímera, aplica las `*_tenant*.sql` del repo en orden, diffea
  el schema de cada BD tenant contra la canónica y manda email al
  receptor del ErrorReporter (project `audit-tenant-schema`) si hay
  drift. Sustituye al script específico que estuvo brevemente en
  `pasarela/_scripts/audit-tenant-schema.sh` (eliminado).

Cambios 2026-05-19:
- **Terminal de devolución del contenedor vacío** (PCS Valencia, DUT):
  migración 0014 añade 7 columnas `terminal_devolucion_*` a
  `pedidos_pcs_extra` (codigo, nombre, cif, direccion, ciudad,
  codigo_postal, unlocode). El mapper extrae
  `<Containers><AcceptanceDetails><AcceptanceCompany>`. Si el DUT no
  trae Orden de Entrega (caso TIBA26051800052093), los campos quedan
  NULL y el panel muestra "no incluida". Nueva sección en el modal de
  detalle (panel pasarela + admin DatosPasarela) y badge "Indicada /
  No indicada" en la card.
- **Frecuencia configurable por número de minutos**:
  `pasarela_config.cron_expr` acepta también el formato `every:Nm`
  (cada N minutos vía setInterval), además de cron estándar. Lo usa el
  selector simplificado del modal "Configuración Nodo API" del admin
  con la lista cerrada 1/2/3/4/5/10/15/20/30/40/50/60/90/120/150/180/
  210 minutos · 4/5/6 horas. Validador del admin backend y del
  pasarela_api watcher reconocen ambos formatos.

Estado proveedores (2026-05-18):
- **Satelles** ✅ operativo en prod. Sync: GET /puba/routes/finished →
  upsert pedido/albaranes/paradas → POST /puba/routes/finished/commit.
  El commit es el equivalente al "ACK": las rutas ya procesadas dejan
  de aparecer en el siguiente GET. Sin documentos de destino: la API
  los soporta (GET /api/erpsync/routes/.../documents, scope
  satelles-erpsync:write) pero GFE no los está cargando todavía;
  cliente preparado para activarse en cuanto aparezcan.
- **PCS Valencia** ✅ operativo en prod. Sync: GET /messages/download/{box}
  (pendingStatus=pending por defecto) → downloadMessage → upsert pedido/
  paradas/pedidos_pcs_extra → **DELETE /messages/download/{box}/{id}**
  (ack, 202 idempotente, 404 = ya borrado por plazo de gracia). La cola
  histórica de JSR (1001 pedidos) se drenó el 2026-05-18; a partir de
  ahí cada ciclo solo entrega los mensajes nuevos.

Cron: `* * * * *` (cada minuto desde 2026-05-18, antes `*/5`). Si no hay
mensajes nuevos, cada proveedor devuelve lista vacía y retorna inmediato:
el ciclo es prácticamente gratuito.

La expresión vive en `saycu_admin.pasarela_config` (clave `cron_expr`),
no en `.env`. El pasarela_api la lee al arrancar y revisa esa tabla cada
60s; si cambia, reprograma en caliente sin redespliegue. El operador
edita el valor desde la web admin → "Datos Nodo API" → icono ⚙️.
Validación regex sencilla en admin; la estricta la hace el watcher con
`node-cron.validate`. Si la expresión guardada es semánticamente
inválida, el watcher mantiene la anterior y reporta el incidente por
email. Estado en dev desde 2026-05-18; pendiente subir a prod.

Tests automatizados (node:test) cubriendo los 5 endpoints inbound,
17/17 OK en dev y prod. Visor de logs + manual API desplegados. El ERP
del cliente se conectará previsiblemente con un programa intermedio en
C entre el ERP y la API inbound.

Este GUION describe **el framework**, no los clientes concretos. Las
empresas y sus credenciales viven en BD y en la UI de admin, no aquí.


TESTS AUTOMATIZADOS DEL pasarela_api
------------------------------------

Suite en `pasarela/api/tests/` con `node:test` (built-in en Node 20+, sin
deps). Cobertura completa de los 5 endpoints actuales y todas las ramas
de error (`missing_bearer`, `invalid_key`, `scope_required`, `id_invalido`,
`no_encontrado`, `no_encontrado_o_ya_procesado`, `not_found`).

Ejecutar:
  docker exec -w /app pasarela_api npm test

Estado en dev y prod a 2026-05-10: 17/17 OK, ~1.3s.

Datos de test (idempotentes, se preparan en `tests/setup.js`):
  - Empresa `TEST` en saycu_admin (servicio `pasarela`).
  - BD `saycu_pasarela_test` clonada de `saycu_pasarela_demo`.
  - 2 API keys: `test-read` (scopes `datos.read`) y `test-rw`
    (`datos.read,datos.write`). Se regeneran cada ejecución.
  - 1 pedido seed (`id_ruta_externa='TEST-SEED-1'`) con 1 albarán y
    2 paradas. Se borra y recrea cada ejecución (CASCADE arrastra hijos).

REGLA OPERATIVA — leer al tocar el API:
  Si añades un endpoint nuevo, hay que tocar TRES sitios a la vez:
    1. `pasarela/api/src/routes/...` (código del endpoint).
    2. `pasarela/api/tests/api.test.js` (caso feliz + ramas de error).
    3. `admin.saycusoft.es/panel/src/pages/ApiDocsPasarela.jsx`
       (manual visible en Dashboard → Manuales → Nodo API).
  Si modificas el contrato (path, body, response, error_code), los tres
  archivos deben actualizarse en la misma sesión. La regla está repetida
  como cabecera en `tests/api.test.js` y `src/app.js`.

Para que los tests sean ejecutables dentro del contenedor, el Dockerfile
incluye `COPY api/tests ./tests`. Son ~7 KB y no participan en runtime.


QUÉ NOS HARÁ FALTA DE VALENCIAPORTPCS (decisión SOAP vs REST)
-------------------------------------------------------------

Para arrancar la integración real con valenciaportpcs.net hay que
elegir uno de los dos protocolos. Los dos cubren los mensajes
necesarios para un perfil transportista: inbound DUTv2, ReleaseOrderv2,
AcceptanceOrderv2, ReleaseConfirmationv2, AcceptanceConfirmationv2,
Acknowledgementv2 + outbound InlandTransportDetailsv2. Lo que cambia
es el coste de implementar y las cosas que hay que pedir al proveedor.

REST (recomendado por el manual oficial para desarrollos nuevos):
- Endpoint: `https://api.valenciaportpcs.net/messaging` (PROD) ·
  `https://testapi.valenciaportpcs.net/messaging` (TEST). 3 paths en el
  swagger: `/messages/download/{box}` (list), `/messages/download/{box}/{id}` (get) y
  `/messages/upload/{box}` (post).
- Auth: OAuth2 client_credentials. Token URL en swagger
  (`/oauth/connect/token` en PROD, mismo path en TEST).
- Necesitamos que el operador titular nos dé: par `client_id` +
  `client_secret` distinto del usuario humano del portal, y que su
  organización + el usuario tengan asignados los roles efectivos del
  servicio MESSG (MESSGAPISR/MESSGOAUTH) en su plano de autorización
  (no solo a nivel organización).
- Pros: schemas de mensajes vienen referenciados desde el swagger
  (`application/json` y `application/xml`); JSON conviene si tiramos
  por programa C intermedio porque su parsing es más manejable; el
  manual lo recomienda explícitamente.
- Contras: Bearer token con TTL corto (renovación cada hora típica) →
  pequeño extra en el cliente para la cache.

SOAP (transportservice.asmx, plan B si la REST sigue bloqueada):
- Endpoint: `https://www.valenciaportpcs.net/services/transportservice.asmx`
  (PROD) y `https://test.valenciaportpcs.net/services/transportservice.asmx`
  (TEST). 10 operaciones (Upload/UploadZippedMessage/UploadZippedFile,
  ListMessages, ListMessagesByService, ListMessagesByDate,
  ListMessagesByMessageType, Download/DownloadZippedMessage/
  DownloadZippedFile).
- Auth: usuario+password en `login.asmx` → TicketGUID por sesión, que
  se pasa como `SessionTicket` en cada llamada.
- Necesitamos: usuario y password del portal **y** permisos efectivos
  del usuario sobre el servicio TRANS en su plano de autorización (no
  basta con que la organización los tenga).
- Necesitamos también: los XSD de cada mensaje (DUTv2, ReleaseOrderv2,
  etc.). El WSDL describe la envolvente SOAP pero NO el schema del
  mensaje que viaja como ByteArray base64. PCS los tiene como ficheros
  aparte; hay que pedírselos junto con las credenciales.
- Pros: cliente SOAP en C viable con cualquier lib de XML.
- Contras: el manual desaconseja para desarrollos nuevos; XML más
  verboso; TicketGUID con TTL no documentado (medir con CheckSession y
  re-login en bucle).

Lista que pedir al proveedor PCS cuando contesten (en este orden):
1. Confirmación de qué protocolo dan permisos (REST u ambos). Si REST:
   par `client_id`/`client_secret` para PROD y para TEST, y asignación
   de roles MESSGAPISR/MESSGOAUTH a nivel usuario (no solo
   organización). Si SOAP: asignación de roles
   TRANS{SNDTI,RCVTI,RVWTI,…} al usuario PROD y un usuario TEST
   funcional.
2. Schemas XSD de los mensajes del servicio TRANS (solo si tiramos
   SOAP). En REST vienen del swagger.
3. Buzón a usar (`box`): el manual dice `default` salvo indicación
   contraria; confirmar.
4. Volumen estimado de mensajes por día y SLA esperado, para calibrar
   polling vs webhook (REST no expone webhook según el swagger; tiraremos
   por polling cada N minutos).

Cuando lleguen los puntos 1 y 2, decidir REST si está limpio (recomendado
por manual + JSON cómodo para C intermedio). Si solo se desbloquea SOAP,
tirar por SOAP.


EN ESPERA (2026-05-10)
----------------------

Solo queda un frente abierto, **bloqueado externamente** (no depende
de nosotros). El bloque Satelles está cerrado y operativo en prod.

1. **PCS Valencia** — bloqueado por par OAuth real.

   Las credenciales facilitadas hasta ahora son las del **usuario
   humano del portal SOAP** (`login.asmx`), NO un par
   `client_id`/`client_secret` OAuth. Resumen del diagnóstico:
   - SOAP PROD `login.asmx` con el usuario humano: HTTP 200, devuelve
     TicketGUID y datos de la organización con roles `MESSGAPISR` y
     `MESSGOAUTH` activos. El usuario PROD del portal **funciona** para
     login pero NO para invocar el servicio de mensajería: con
     TicketGUID válido, `transportservice.asmx ListMessages` devuelve
     SOAP fault «El usuario no tiene permisos suficientes».
   - SOAP TEST `login.asmx` con el usuario UAT: HTTP 500 «Invalid
     Login. … login inactive or organization is inactive». El usuario
     TEST del portal **no entra**.
   - OAuth REST PROD `/oauth/connect/token` con `client_id` igual al
     usuario humano: HTTP 400 `invalid_client / you do not have
     access`.
   - OAuth REST TEST equivalente: HTTP 400 `invalid_client / wrong
     username or password`.

   Diagnóstico: el `client_id` PROD existe pero no tiene acceso
   habilitado; el `client_id` TEST directamente no existe. La
   organización tiene los roles MESSGAPISR/MESSGOAUTH a nivel
   organización, pero al usuario no le han asignado los roles efectivos
   del servicio MESSG ni en SOAP ni en REST. Falta que ValenciaportPCS
   emita un par OAuth válido **y** asigne los roles efectivos al
   usuario.

   Bonus: el swagger en PROD ya carga sin login.
   `https://api.valenciaportpcs.net/messaging/swagger/v1/swagger.json`
   (3 paths: `/messages/download/{box}`, `/messages/download/{box}/{id}`,
   `/messages/upload/{box}`). TEST equivalente en
   `testapi.valenciaportpcs.net` también responde. El `tokenUrl`
   declarado en la spec coincide con el probado arriba. Ya no hace
   falta pedir acceso autenticado al swagger; solo el par OAuth y,
   idealmente, un usuario TEST activo.

   Estado del código: migración `0006_admin_pcs_valencia.sql` aplicada
   en dev y prod (alta del proveedor `pcs-valencia` con descriptor
   `[user, pass, oauth_url, api_base]`). Stubs en
   `api/src/proveedores/pcs-valencia/` (client/mapper/sync) marcados
   como pendientes — no conectan con nada todavía. Cuando lleguen las
   credenciales OAuth, sustituir descriptor del proveedor por
   `[client_id, client_secret, token_url, api_base]` con migración
   nueva. Ver `proveedores/pcs-valencia/README.md`.


VERSIONES DEL MANUAL SATELLES
-----------------------------

- **v1.7.0** (06-may-2026, vigente): añade `areaCodes` (array) en
  `delegations`, endpoints nuevos `PUT/GET /api/erpsync/delivery-modes`,
  `GET /api/erpsync/countries`, `GET /api/erpsync/languages`. PDF en
  `superapitrans/documentos/satelles/Satelles - ERPSYNC Api.pdf`.
- **v1.6.0** (23-jul-2025, anterior): conservada como backup en
  `Satelles - ERPSYNC Api v1.6.0 (2025-07-23).pdf` por si surge alguna
  diferencia de comportamiento.
- El sync actual (`GET /puba/routes/finished` + commit) no se ve
  afectado por la nueva versión. Solo si en el futuro sincronizamos
  maestros desde Satelles (`delegations`, etc.) habrá que adaptar el
  cliente al nuevo modelo `areaCodes`.


GOTCHAS — CUIDADO
-----------------

- **`docker compose restart` NO recarga env_file**. Si tocas `.env` y
  haces `restart`, el contenedor sigue con los valores anteriores en
  silencio. Usar siempre `up -d --force-recreate api`, o el helper
  `_scripts/restart-with-env-reload.sh [--dev|--prod]`. **Importante para
  PASARELA_DRY_RUN**: si crees que está activo y no lo está, el sync
  hará commit a Satelles y las publicaciones desaparecen de su cola.
- **Migración 0002 con `psql -U postgres`**: aunque la BD sea owned por
  saycutrans, las tablas que crea quedan con owner postgres y la
  pasarela falla con "permission denied". Desde 06-may la migración
  termina con `ALTER ... OWNER TO saycutrans` idempotente.
- **PASARELA_SECRETS_KEY entre admin y pasarela**: deben coincidir EN
  RUNTIME (printenv dentro del contenedor, no solo en el `.env`). Si
  cambia la del admin después de cifrar credenciales, se vuelven
  indescifrables → borrar y volver a guardarlas desde la UI.
- **Formato AES-GCM**: el admin (`utils/pasarela-secrets.js`) y la
  pasarela (`api/src/secrets.js`) deben usar `[iv | tag | ciphertext]`
  (formato compatible byte a byte). Si divergen, descifrado falla con
  "Unsupported state or unable to authenticate data".


GESTIÓN DE CATÁLOGO Y CREDENCIALES (UI desde admin.saycusoft.es)
---------------------------------------------------------------

- **Catálogo** (tabla `saycu_admin.pasarela_proveedores`): es **cerrado**.
  Cada proveedor nuevo se da de alta por **migración SQL** (junto con el
  cliente HTTP y el mapeo a tablas canónicas). NO se edita desde UI; el
  backend solo expone `GET /api/proveedores` (lista).
- **Descriptor de campos por proveedor**: columna
  `pasarela_proveedores.campos_credenciales` (JSONB, lista de
  `{clave, label, secreto, ayuda}`). Pinta el formulario de credenciales
  con inputs tipados (label visible, `type=password` si `secreto`), sin
  pedir al usuario las claves técnicas. Migración
  `0004_admin_campos_credenciales.sql` añade la columna y pre-rellena
  Satelles; `0005_admin_satelles_quitar_scopes.sql` quita `scopes`
  porque son fijos (irán hardcoded en el cliente HTTP).
- **Credenciales por empresa** (`saycu_admin.pasarela_proveedores_credenciales`):
  cifradas AES-256-GCM con `PASARELA_SECRETS_KEY` (32 bytes en base64)
  por la capa de aplicación del backend de admin.saycusoft.es. Una clave
  distinta por entorno (dev != prod), ya en los `.env` reales. Cada
  proveedor lleva sus campos:
  - Satelles: `client_id`, `client_secret` (scopes hardcoded en cliente)
  - PCS Valencia: por definir cuando entre en migración 0006
- **Endpoints backend** (en admin.saycusoft.es):
  - `GET /api/proveedores`, `GET /api/proveedores/:id` (solo lectura)
  - `GET /api/empresas/:id/proveedor-credenciales` (lista; sólo metadatos + nombres de claves)
  - `GET /api/empresas/:id/proveedor-credenciales/:credId` (con `credencial` descifrada para edición)
  - `POST/PUT/DELETE /api/empresas/:id/proveedor-credenciales[/:credId]`
- **UX**: tile "Proveedores de datos" en `EmpresaActionsModal` (sección
  "Panel de Empresa") → abre `ProveedoresEmpresaModal` con selector de
  proveedor arriba; al elegir, dos cuadros (Sandbox + Producción) con los
  campos del descriptor, prerrellenados si ya hay credenciales. Cada
  cuadro lleva su switch "Activo" y, si existen, su botón "Borrar"
  individual. Guardar cierra el modal.
- Para que la pasarela API (cuando se ejecute outbound desde
  `superapitrans/pasarela`) pueda descifrar lo que guardó el admin, su
  `.env` debe tener la **misma `PASARELA_SECRETS_KEY` por entorno**.


ROUTING EXTERNO (system-caddy) — SE COMPARTE PARA TODOS LOS PROVEEDORES
----------------------------------------------------------------------

El `system_caddy` enruta `https://[dev-]api.superapi.eoden.es/pasarela/*`
al contenedor `pasarela_api:3412` con `rewrite * /api{path}`. Es decir,
cualquier sub-ruta cae automáticamente:

- `/pasarela/health` → `pasarela_api:3412/api/health`
- `/pasarela/satelles/...` → `pasarela_api:3412/api/satelles/...`
- `/pasarela/pcs-vlc/...` (cuando se programe) → idem

NO hace falta tocar `system-caddy/conf/Caddyfile.{dev,prod}` para añadir
un proveedor nuevo. Las rutas internas (incluidos webhooks de PCS
Valencia) las maneja el Express del propio `pasarela_api`.


OBJETIVO
--------

Sub-servicio de superapitrans que actúa como **pasarela entre clientes
externos y proveedores externos**, persistiendo todo lo intercambiado en
4 tablas canónicas multi-tenant. Esa misma tabla la puede consumir
chofocles (entrada por correo) y, cuando el cliente final tenga un ERP
con campos `TT*` de a3ERP, un programa intermedio que lea por la API
inbound y vuelque a sus columnas TT*.

Dos flujos:

1. **INBOUND** — un cliente externo llama a nuestra API con su key:
   a. Consulta datos almacenados.
   b. Nos envía datos para almacenar.
   c. Dispara una utilidad (chofocles o general).

2. **OUTBOUND** — nosotros llamamos a APIs de terceros (cada una con su
   credencial propia) para:
   a. Obtener datos que volcamos en la tabla canónica.
   b. (Futuro) Enviar datos a terceros.

Ambos flujos comparten las mismas tablas canónicas. El consumidor final
(programa intermedio del cliente) toma los campos que necesita y los
mapea a sus columnas `TT*` (esquema a3ERP).


DOCUMENTOS DE REFERENCIA
------------------------

Todos viven en `superapitrans/documentos/`:

- **`campos.pdf`** — proyecto AUTONOMOS Saycusoft (Mayo-2026, v1.0).
  Define los campos `TT*` que el módulo de transporte del usuario espera
  encontrar (cabecera + repartos). Son campos de a3ERP (prefijo `TT`),
  pero **nuestra tabla canónica usa nombres limpios sin prefijo**: la
  tabla es nuestra y guardamos más información de la que pide a3ERP.

- **`Satelles - ERPSYNC Api.pdf`** — manual técnico del primer proveedor
  externo (`novossistemas.satelles.es`, ERPSYNC v1.6.0). OAuth 2.0
  client credentials, recursos maestros editables (delegations, zones,
  measure-units, transport-types, vehicle-types, vehicles, drivers,
  customers, places, materials) y cola de rutas finalizadas
  (`/puba/routes/finished` + commit por `publicationIds`).

- **`Satelles API ERP SYNC.postman_collection.json`** —
  colección Postman con ejemplos reales de llamadas (cuerpos JSON
  válidos para PUT, query strings de GET, etc.). Útil para validar el
  cliente HTTP que generemos.


ENCAJE EN LA ARQUITECTURA
-------------------------

```
[Cliente externo]                                    [Proveedor externo]
       │                                                       ▲
   key │                                          credencial   │
       ▼                                          cifrada      │
  ┌────────────────── system-caddy (api.{BASE_DOMAIN}) ──────────────┐
  │   handle_path /chofocles/*  → chofocles_api                       │
  │   handle_path /pasarela/*   → pasarela_api ─────────┐             │
  │   handle /health            → 200                   │             │
  └─────────────────────────────────────────────────────┼─────────────┘
                                                        │
                                                        ▼
                              ┌──────────────────────────────────┐
                              │  pasarela_api (Node.js)          │
                              │   - middleware key cliente       │
                              │   - lectura/escritura tablas     │
                              │   - sincronizador outbound       │
                              │     (cron por proveedor)         │
                              │   - utilidades chofocles/general │
                              └─────────────┬────────────────────┘
                                            │
                          ┌─────────────────┼──────────────────────┐
                          ▼                 ▼                      ▼
                    saycu_admin       saycu_pasarela_*        chofocles_api
                    (catálogos +      (4 tablas canónicas     (utilidades
                    keys + creds)      por tenant)             chofocles)
```


KEYS — DOS DIMENSIONES
----------------------

**Por CLIENTE (inbound)**
- Granularidad: por **empresa-tenant + aplicación**. Una empresa puede
  tener N keys (una por integración propia).
- Almacenamiento: `saycu_admin.pasarela_clientes_keys` (hash bcrypt,
  nunca plaintext).
- Formato: prefijo identificable + secreto aleatorio
  (`pas_live_xxxxxxxxxxxx`).

**Por PROVEEDOR EXTERNO (outbound)**
- Granularidad: **por (empresa, proveedor)**. Cada cliente Saycu trae
  sus propias credenciales del proveedor (no globales).
- Almacenamiento: `saycu_admin.pasarela_proveedores_credenciales`,
  cifradas AES-256-GCM (mismo patrón que chofocles `secrets.js`). Clave
  de cifrado en `.env` de la pasarela, no en BBDD.
- Por proveedor: 1 ficha en `pasarela_proveedores` (nombre, host base,
  versión API) + N credenciales (sandbox/prod, scopes documentados).


MODELO DE DATOS — 4 TABLAS CANÓNICAS POR TENANT
------------------------------------------------

Multi-tenant: una BBDD por empresa (`saycu_pasarela_<CODIGO>`), patrón
Saycu. Cada BBDD del tenant contiene 4 tablas relacionadas, ninguna
excluyente:

1. **`pedidos`** — cabecera del pedido / orden de carga.
2. **`albaranes`** — albaranes del pedido. Un pedido tiene 0..N.
3. **`facturas`** — facturas del pedido. Un pedido tiene 0..N.
4. **`paradas`** — orígenes y destinos del pedido (carga / descarga).
   Un pedido tiene 0..N. FK obligatoria a pedido + FK opcional a
   albarán (cuando el documento lo indique claramente).

Ejemplo: 1 pedido con 3 orígenes y 4 destinos = 1 fila en `pedidos` +
7 filas en `paradas`. Si los albaranes vienen claros, se vinculan;
si no, las paradas quedan con `albaran_id IS NULL`.


CAMPOS DECIDIDOS — DETALLE Y RAZÓN
-----------------------------------

Para cada campo del PDF `campos.pdf` (prefijo `TT`), el nombre que usamos
en nuestra tabla, el origen Satelles propuesto, y la decisión.

### `pedidos` (cabecera)

| Campo a3ERP | Campo nuestro                          | Origen Satelles                                    | Decisión |
|-------------|----------------------------------------|----------------------------------------------------|----------|
| TTIDVI      | `id_viaje`                             | `route.id`                                         | bigint, no null |
| TTCLIE      | `cliente_codigo` + `cliente_cif`       | (no es Satelles) — viene del tenant Saycu          | confirmado: TTCLIE = empresa-tenant Saycu (= `saycu_admin.empresas`) |
| TTDELE      | `delegacion_codigo`                    | `route.delegation.code`                            | varchar(20) |
| TTCORR      | `email_chofer` + `email_remitente`     | `drivers.email` / del documento                    | dos campos sin TT — el remitente del email (chofocles) o del PDF |
| TTIDRU      | `id_ruta_externa`                      | (no Satelles) — del documento del operador         | nullable. Lo rellena chofocles si el PDF lo trae |
| TTFECH      | `fecha_plan` + `fecha_reparto`         | `route.planDate` / `delivery.deliveryDate`         | ambas nullable. El consumidor decide cuál usar |
| TTCHOP      | `chofer_principal_codigo` + `..._cif`  | `route.driver.code` + `idCard`                     | dos campos |
| TTCHOS      | `chofer_secundario_codigo` + `..._cif` | (no obvio en Satelles)                             | nullable |
| TTTERC      | `tercero_codigo` + `tercero_cif`       | `delivery.order.customer.code` + `taxCode`         | proveedor / operador logístico que paga el viaje |
| TTCABE      | `matricula_tractor`                    | `route.tractor.licensePlate`                       | varchar(20) |
| TTPLAT      | `matricula_remolque`                   | `route.trailer.licensePlate`                       | varchar(20) |
| TTNPEDI     | `numero_pedido`                        | `delivery.order.reference`                         | varchar(50) |
| TTNALB      | `albaranes_concatenados`               | (resumen de `albaranes.numero`)                    | varchar(500), separador `;`. Referencia rápida; los albaranes detallados van en su propia tabla |
| TTTIPO      | `tipo`                                 | derivado                                           | enum `'PEDIDO'`, `'ALBARAN'` |
| TTESTA      | `estado`                               | interno                                            | enum `'PENDIENTE'`, `'PROCESADO'`. Lo gestiona la pasarela y el módulo de transporte del usuario |

### `albaranes` (1 pedido → 0..N)

Por cada `shippingManifest` distinto que aparezca en una ruta de Satelles:

| Campo nuestro            | Origen Satelles                                          |
|--------------------------|----------------------------------------------------------|
| `id` (interno)           | UUID nuestro                                             |
| `pedido_id`              | FK a `pedidos.id`                                        |
| `numero`                 | `shippingManifest.documentNumber`                        |
| `fecha`                  | `shippingManifest.manifestDate`                          |
| `lugar_carga_codigo`     | `shippingManifest.loadingPlace.code`                     |
| `unidad_medida`          | `shippingManifest.measureUnit.code`                      |
| `satelles_id`            | `shippingManifest.id` (idempotencia)                     |

### `facturas` (1 pedido → 0..N)

Vacía de momento — Satelles no expone facturas. Se llenará cuando llegue
información de facturación por otra vía (chofocles, manual, otro
proveedor). Estructura mínima:
`id`, `pedido_id`, `numero`, `fecha`, `total`, `estado`, `created_at`.

### `paradas` (1 pedido → 0..N)

Una fila por cada `destination` de la ruta Satelles:

| Campo a3ERP | Campo nuestro          | Origen Satelles                                  | Decisión |
|-------------|------------------------|--------------------------------------------------|----------|
| TTIDVI      | `pedido_id`            | FK a `pedidos.id`                                | not null |
| (nuevo)     | `albaran_id`           | FK a `albaranes.id`                              | nullable |
| TTIDRE      | `reparto_id_externo`   | `delivery.id`                                    | bigint |
| TTTIPO      | `tipo`                 | `action.type` (0=carga, 1=descarga)              | enum `'CARGA'`, `'DESCARGA'` |
| TTORDE      | `orden`                | derivado de tipo                                 | enum `'ORIGEN'`, `'DESTINO'` |
| TTFABR      | `tipo_lugar`           | `place.name` o `place.type` si existe            | texto libre, nullable |
| TTDIR1      | `direccion1`           | `place.address1`                                 | varchar(200) |
| TTDIR2      | `direccion2`           | `place.address2`                                 | varchar(200) |
| TTCOPO      | `codigo_postal`        | `place.postalCode`                               | varchar(10) |
| TTMUNI      | `municipio`            | `place.municipality`                             | varchar(100) |
| TTPROV      | `provincia`            | `place.province`                                 | varchar(100) |
| TTPAIS      | `pais`                 | `place.country`                                  | varchar(50) |
| TTTELE      | `telefono`             | `place.phone`                                    | varchar(30) |
| TTPCON      | `persona_contacto`     | `place.contact`                                  | varchar(100) |
| TTMERC      | `producto`             | `cargo.material.name`                            | varchar(200) |
| TTCANT      | `cantidad`             | `cargo.quantity`                                 | numeric(14,3) |
|             | `unidad_medida`        | `cargo.measureUnit.code`                         | varchar(10) |
| TTKMRE      | `kms_tramo`            | calculado por `legs` o `trip.distance`           | numeric(10,2). Por tramo, no total — la suma se calcula cuando haga falta |


PROVEEDOR #1 — SATELLES ERPSYNC
--------------------------------

Manual: `documentos/Satelles - ERPSYNC Api.pdf` (v1.6.0).
Postman: `documentos/Satelles API ERP SYNC.postman_collection.json`.

- **Host base:** `https://novossistemas.satelles.es`
- **Auth:** OAuth 2.0 Client Credentials. POST a `/auth/connect/token`
  con `grant_type=client_credentials`, `client_id`+`client_secret`
  (Basic auth o cuerpo), y `scope` separado por espacios.
- **Scopes:**
  - `satelles-erpsync:write` — recursos maestros (delegations, zones,
    measure-units, transport-types, vehicle-types, vehicles, drivers,
    customers, places, materials).
  - `satelles-publications:finished-routes` — leer cola de rutas
    finalizadas y marcarlas como procesadas.
- **Bearer token** TTL 3600 s.

### Endpoint clave que usaremos: rutas finalizadas

- `GET /puba/routes/finished` — devuelve la cola de rutas terminadas
  (con `id` de publicación + objeto `route` anidado: destinations,
  actions, deliveries, cargo, shippingManifest, events, legs, trips).
- `POST /routes/finished/commit` — body `{ "publicationIds": [...] }`.
  Marca como procesados.

### Mapeo Satelles → tablas canónicas (resumen)

Por cada elemento del array que devuelve `/puba/routes/finished`:

1. Crear/actualizar 1 fila en `pedidos` con:
   - `id_viaje = route.id`
   - `delegacion_codigo = route.delegation.code`
   - `chofer_principal_codigo = route.driver.code`,
     `chofer_principal_cif = route.driver.idCard`
   - `tercero_codigo = delivery.order.customer.code` (si hay un único
     cliente en la ruta) — si hay varios, se usa el de la primera
     entrega
   - `matricula_tractor = route.tractor.licensePlate`
   - `matricula_remolque = route.trailer.licensePlate`
   - `numero_pedido = delivery.order.reference` (si hay varios pedidos
     en la ruta, se concatenan con `;`)
   - `fecha_plan = route.planDate`
   - `fecha_reparto = route.startedOn` (o `delivery.deliveryDate` si
     prefieres)
   - `tipo = 'ALBARAN'` (porque la ruta ya está finalizada — si fuera
     el caso de pedidos sin ejecutar, llegarían por otra vía)
   - `estado = 'PENDIENTE'`
   - `albaranes_concatenados = <todos los documentNumber distintos
     juntos con ';'>`

2. Por cada `shippingManifest` distinto: crear/actualizar fila en
   `albaranes`.

3. Por cada `destination`: crear/actualizar fila en `paradas`. Si todas
   las cargas de ese destino apuntan al mismo `shippingManifest`, se
   pone `albaran_id`. Si apuntan a varios, se deja NULL (caso ambiguo).

4. **Idempotencia:** clave única
   `(proveedor='satelles', satelles_publication_id)` en `pedidos`. Si la
   publicación ya está procesada, no se duplica; se actualiza.

5. **Tras procesar OK:** llamar a `POST /routes/finished/commit` con
   los `publicationIds` que han pasado por nuestra BD sin errores.

### Sincronizador

- **Cadencia:** cron interno cada N minutos (configurable, defecto 5).
- **Por cada credencial activa** en `pasarela_proveedores_credenciales`
  con `proveedor_id = satelles`: pedir token, llamar a
  `/puba/routes/finished`, mapear, persistir, commit. Token cacheado en
  memoria mientras dure el TTL.
- **Reintentos:** backoff exponencial en errores 5xx; ignorar 401
  (token expirado: refrescar y reintentar una vez); fallar en 403
  (scope mal). Logs por cada ciclo.


SEPARACIÓN chofocles vs NO-CHOFOCLES
-------------------------------------

Por **path** dentro de la pasarela, no por key:

- `/utilidades/chofocles/...` — solo para clientes con scope chofocles.
- `/utilidades/general/...`   — para los demás flujos.
- `/datos/...`                — lectura/escritura de las 4 tablas
  canónicas; filtrado automático por tenant según la key.

Una misma key puede tener scope múltiple (`scopes: ["chofocles",
"general"]`). El middleware comprueba scope vs path.

**Pendiente con el usuario:** lista exacta de utilidades de cada
categoría (lo dará con los manuales o cuando lo necesite).


ESTRUCTURA DE CARPETAS
----------------------

```
superapitrans/
├── chofocles/                ← ya existe
└── pasarela/
    ├── GUION.md              ← este documento
    ├── api/
    │   ├── Dockerfile
    │   ├── package.json
    │   └── src/
    │       ├── index.js
    │       ├── db.js
    │       ├── secrets.js              ← AES-GCM (compatible con chofocles)
    │       ├── auth/
    │       │   ├── client-key.js       ← middleware key cliente (inbound)
    │       │   └── provider-cred.js    ← obtención cred. proveedor (outbound)
    │       ├── routes/
    │       │   ├── datos.js
    │       │   ├── utilidades-chofocles.js
    │       │   └── utilidades-general.js
    │       ├── proveedores/
    │       │   └── satelles/
    │       │       ├── client.js       ← OAuth + HTTP
    │       │       ├── mapper.js       ← Satelles route → 4 tablas
    │       │       └── sync.js         ← finished routes + commit
    │       └── cron.js                  ← scheduler interno
    ├── db/
    │   └── migrations/
    │       ├── 0001_admin.sql           ← keys cliente + proveedores + creds
    │       └── 0002_tenant.sql          ← pedidos, albaranes, facturas, paradas
    ├── docker-compose.yml               ← solo servicio api
    ├── .env-dev.example
    ├── .env-prod.example
    └── _scripts/
        └── deploy-dev.sh
```


SUBDOMINIO Y CADDY
------------------

Mismo subdominio `api.{BASE_DOMAIN_SUPERAPI}` que ya existe. Hay que
añadir un bloque a `system-caddy/conf/Caddyfile.dev` y `Caddyfile.prod`:

```caddy
api.{$BASE_DOMAIN_SUPERAPI} {
    handle_path /chofocles/* { ... }    # ya cableado
    handle_path /pasarela/* {            # PENDIENTE
        rewrite * /api{path}
        reverse_proxy pasarela_api:3412
    }
}
```

Puerto interno propuesto: **3412** (chofocles usa 3411).


ESTADO ACTUAL
-------------

Desplegado y verificado en dev y prod:

- ✅ Migración `0001_admin.sql` aplicada en `saycu_admin`: ENUM
  `servicio_tipo` con valor `'pasarela'`, tabla `pasarela_proveedores`
  con seed Satelles, `pasarela_proveedores_credenciales`, y
  `pasarela_clientes_keys`.
- ✅ Auto-provisionadas las BBDD tenant con migración `0002_tenant.sql`
  para cada empresa con servicio `pasarela` (4 tablas: pedidos,
  albaranes, facturas, paradas).
- ✅ `pasarela_api` corriendo en ambos entornos (puerto interno 3412),
  conectado a `system_postgres_net`, `superapitrans_network` y
  `pasarela_network`. Healthcheck OK.
- ✅ `system-caddy` enrutando `https://api.superapi.eoden.es/pasarela/*`
  (prod) y `https://dev-api.superapi.eoden.es/pasarela/*` (dev).
- ✅ Auth bearer (`pas_live_<32hex>`) verificada con curl real en ambos
  entornos: `GET /pasarela/datos/pedidos?empresa=<CODIGO>` con scope
  `datos.read` devuelve 200; sin Authorization devuelve 401.
- ✅ Script `api/scripts/generar-key.js` para emitir keys inbound
  (recibe empresa-código, aplicación, scopes CSV; imprime el secreto una
  sola vez).
- ✅ Cron Satelles activo: cuando hay credenciales en
  `pasarela_proveedores_credenciales` para una empresa con servicio
  `pasarela`, el cron tira `*/5 min` y sincroniza. Sin credenciales
  loguea "sin credenciales activas" y sale en milisegundos.


CREDENCIALES BD (referencia operativa)
---------------------------------------

`pasarela_api` conecta como `saycutrans` (mismo usuario que
`SVC_PGUSER` del admin api) porque el auto-provisioning de BBDD tenant
crea las BBDD con ese owner. El usuario `saycuadmin` tendría permisos
en `saycu_admin` pero no en las tablas tenant. Documentado en los
`.env-{dev,prod}.example` con `DB_USER=saycutrans`.


CÓMO EMITIR UNA KEY DE CLIENTE
------------------------------

```bash
ssh saycudev   # o saycu para prod
docker exec pasarela_api node scripts/generar-key.js \
    <CODIGO_EMPRESA> <aplicacion> <scope1,scope2,...> [expira_dias]
```

Ejemplo:
```bash
docker exec pasarela_api node scripts/generar-key.js \
    <CODIGO_EMPRESA> a3erp datos.read,datos.write,utilidades.chofocles,utilidades.general
```

El secreto se imprime una sola vez. Si se pierde, hay que rotarla
(borrar fila y volver a generar).


CÓMO INSERTAR CREDENCIAL DE SATELLES
------------------------------------

Lo normal es hacerlo desde la UI de admin.saycusoft.es: ficha de
empresa → "Proveedores de datos" → seleccionar Satelles → rellenar
`client_id`/`client_secret` en sandbox o prod → Guardar. La UI cifra
y persiste en `saycu_admin.pasarela_proveedores_credenciales`.

Vía script (alternativa CLI):
```bash
docker exec pasarela_api node /app/scripts/set-satelles-cred.js \
    --empresa <CODIGO> --client-id <X> --client-secret <Y> --entorno prod
```

El cron lo recoge en su próximo tick (≤5 min) sin reiniciar.


PROBLEMAS RESUELTOS
-------------------

- **Caddy local en superapitrans/ → conflicto con system_caddy.**
  Eliminado. Pasarela se registra como bloque dentro del frontal global
  `system-caddy` (saycucontrol/), igual que chofocles.
- **404 en `/pasarela/health` durante el primer despliegue.** Caddy
  reescribe `/pasarela/<path>` a `/api{path}`, así que los handlers
  Express deben existir en `/api/health`. Solución: registrar tanto
  `/health` (interno, healthcheck Docker) como `/api/health` (externo,
  tras el rewrite).
- **`permission denied for table pedidos` con `DB_USER=saycuadmin`.**
  Las BBDD tenant se auto-provisionan con owner `saycutrans`. El
  `.env` de pasarela ahora usa `DB_USER=saycutrans` por defecto.
- **`docker compose restart` no recarga `.env`.** Tras editar
  variables, usar `docker compose up -d --force-recreate api`.


DEUDA TÉCNICA — PENDIENTE DE COMPROBAR / MÁS INFORMACIÓN
---------------------------------------------------------

Notas tomadas el 2026-05-13. No son tareas a ejecutar todavía; son
puntos abiertos que hay que tener en cuenta antes de hacer cambios en
la ingesta del PCS de Valencia.

1. **Consulta por fechas en el PCS REST: funciona.** Verificado en
   vivo contra `https://api.valenciaportpcs.net/messaging` con la
   credencial JSR de producción el 2026-05-13:
   - `GET /messages/download/{box}?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
     filtra correctamente.
   - `toDate` se comporta como exclusivo (o se interpreta como
     `T00:00:00`): `fromDate=X&toDate=X` devuelve `0`. Para cubrir un
     día hay que usar `toDate=X+1` o `toDate=X T23:59:59`.
   - Acepta también `fromDate=2026-05-04T00:00:00&toDate=...T23:59:59`.
   - La respuesta tiene un techo de 1000 items (sin filtro, devuelve
     exactamente 1000). No comprobado si admite `offset`/`limit` ni si
     hay una forma de pedir "siguientes 1000".
   Consecuencia útil: el sync se puede refactorizar para tirar por
   ventana móvil con dedup por `(proveedor_codigo,
   proveedor_publication_id)` y dejar de depender del ack. Antes de
   tocarlo conviene confirmar la paginación.

2. **Acknowledgementv2 al PCS: tenemos permiso, no está implementado.**
   Verificado en vivo el 2026-05-13:
   - `POST /messages/upload/{box}` con `Content-Type: application/xml`
     devuelve `400 "The File field is required."` → la cuenta entra al
     endpoint; lo que rechaza es el formato.
   - Con `multipart/form-data` y campo `File` devuelve `400 "Unknown
     interchange type"` → el servidor parsea el archivo y rechaza por
     contenido, no por permisos.
   En ningún caso devuelve `401`/`403`. La cuenta JSR puede escribir.
   Pendiente para implementarlo:
   - Cambiar `pcs-valencia/client.js:123-137` (`uploadMessage`) para
     que envíe `multipart/form-data` con campo `File`, no
     `application/xml` directo.
   - Conseguir el sample real del `Acknowledgementv2` (no está en
     `documentos/pcs-valencia/samples/`, solo están los otros 5; en
     `mapper.js:557-565` se marca como `_unhandled`). Habría que
     pedirlo a Arantxa Nebot o sacarlo de la doc del puerto.

3. **Política de retención / acumulación en el PCS: desconocida.** El
   manual `pcs11-mbase004` no regula expiración, caducidad ni cuota de
   mensajes pendientes. El bloqueo previo de abril 2026 se resolvió el
   2026-05-12 con un reset de perfiles de `messaging.JSRO`; no quedó
   registrada la causa raíz. Pendiente: preguntar a Arantxa Nebot
   "¿qué hacéis con los pendientes acumulados, los caducáis o los
   conserváis? ¿Hay un máximo a partir del cual la cuenta se ve
   afectada?". Según la respuesta:
   - Si los conservan sin caducar → sync por fechas (punto 1) basta,
     el ack queda como mejora opcional.
   - Si los caducan → hay que priorizar el Acknowledgementv2 (punto
     2) para no perder mensajes antiguos.

4. **Texto del correo del 2026-05-13 a José Miguel.** Inicialmente
   redacté que "queda un fleco del lado del puerto: que reconozcan que
   ya hemos consumido cada mensaje". Es **incorrecto**: el ack lo
   emitimos nosotros al PCS, no al revés. Si en algún momento se
   vuelve a redactar comunicación al cliente sobre el PCS, no atribuir
   ese fleco al puerto — es deuda nuestra.
