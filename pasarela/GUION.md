# GUION — nodo de datos de superapitrans (carpeta `pasarela/`)

Última actualización: 2026-08-20 (reescrito como guion según la norma
«GUION.md — UN GUION DE VERDAD» del CLAUDE.md global; la crónica vive en el
historial de git y los errores en ERRORES_SOLVENTADOS.md).

## OBJETIVO

Nodo de datos del grupo Saycu, sub-servicio de superapitrans («pasarela» es
solo el nombre propio de la carpeta `pasarela/` y de sus artefactos):
intermediario entre clientes externos y proveedores externos. OUTBOUND:
sincroniza por cron los datos de cada proveedor (Satelles, PCS Valencia) y
los persiste en tablas canónicas multi-tenant (`saycu_pasarela_<CODIGO>`).
INBOUND: los expone por API con bearer key; el consumidor final (NodeImport,
ver GUION de superapitrans) los vuelca a las columnas TT* de a3ERP. Este
guion describe el framework: las empresas y sus credenciales viven en BD y
en la UI de admin.saycusoft.es, no aquí.

## MÉTODO VIGENTE

Routing (system-caddy, `BASE_DOMAIN_SUPERAPI`, red Docker): CLAUDE.md de
superapitrans. El frontal enruta `[dev-]api.<dominio>/pasarela/*` al
contenedor `pasarela_api:3412` con `rewrite * /api{path}`: cualquier
sub-ruta cae sola (no se toca Caddy para añadir un proveedor); por eso el
código registra `/health` (healthcheck Docker) y `/api/health` (externo).

- Piezas (estructura real): `api/` (Express `pasarela_api`: `auth/`,
  `routes/` — auth, datos, me, satelles, vista-prefs —, `proveedores/
  {satelles,pcs-valencia}/` con client+mapper+sync, `cron.js`, `secrets.js`,
  `utils/fallo-persistente.js` + clientes ErrorReporter/ControlGlobal);
  `panel/` (panel web del nodo, React + `saycu-theme`, servido en
  `[dev-]panel.<dominio>`); `db/migrations/` (0001…0017); `_scripts/`
  (deploy-dev/prod, deploy-panel-dev/prod, restart-with-env-reload.sh,
  bootstrap-env.sh).

- KEYS, dos dimensiones:
  - INBOUND, por empresa+aplicación: `saycu_admin.pasarela_clientes_keys`
    (hash bcrypt, formato `pas_live_<32hex>`). Emitir: `docker exec
    pasarela_api node scripts/generar-key.js <EMPRESA> <aplicacion>
    <scopes,csv> [expira_dias]` — el secreto se imprime UNA vez; si se
    pierde, se rota. El tenant se infiere de la key. Scopes: `datos.read`,
    `datos.write`, `satelles.read`, `satelles.write`.
  - OUTBOUND, por (empresa, proveedor):
    `saycu_admin.pasarela_proveedores_credenciales`, cifradas AES-256-GCM
    con `PASARELA_SECRETS_KEY` (una clave por entorno). Se meten desde la
    UI del admin (ficha de empresa → «Proveedores de datos»: selector de
    proveedor + cuadros Sandbox/Producción con switch Activo, campos
    pintados por el descriptor) o por CLI (`scripts/set-satelles-cred.js`,
    `scripts/set-pcs-valencia-cred.js`). El cron las recoge en su próximo
    tick sin reiniciar.

- CATÁLOGO de proveedores CERRADO (`saycu_admin.pasarela_proveedores`):
  cada proveedor nuevo entra por migración SQL junto con su cliente HTTP y
  su mapper; no se edita desde UI (el backend solo expone lectura). El
  descriptor `campos_credenciales` (JSONB `{clave,label,secreto,ayuda}`)
  pinta el formulario de credenciales del admin.

- MODELO DE DATOS por tenant (`saycu_pasarela_<CODIGO>`): 4 tablas
  canónicas — `pedidos` (cabecera), `albaranes` (0..N), `facturas` (0..N,
  vacía: ningún proveedor las expone aún), `paradas` (0..N, FK a pedido +
  FK opcional a albarán; si el albarán es ambiguo, NULL) — más auxiliares
  por migración (`pedidos_pcs_extra` con el terminal de devolución del
  contenedor, `paradas_documentos`). Nombres limpios SIN prefijo TT (la
  tabla es nuestra y guarda más de lo que pide a3ERP). Tipos y constraints
  exactos: `db/migrations/`; extracción real: `proveedores/*/mapper.js`.
  Correspondencia a3ERP → campo nuestro (cabecera): TTIDVI=`id_viaje`,
  TTCLIE=empresa-tenant Saycu (`cliente_codigo`+`cliente_cif`),
  TTDELE=`delegacion_codigo`, TTCORR=`email_chofer`/`email_remitente`,
  TTIDRU=`id_ruta_externa`, TTFECH=`fecha_plan`+`fecha_reparto`,
  TTCHOP/TTCHOS=`chofer_principal/secundario_codigo`+`_cif`,
  TTTERC=`tercero_codigo`+`_cif`, TTCABE=`matricula_tractor`,
  TTPLAT=`matricula_remolque`, TTNPEDI=`numero_pedido` (VARCHAR(500),
  concatenación con `;`), TTNALB=`albaranes_concatenados` (ídem),
  TTTIPO=`tipo` (ALBARAN|PEDIDO), TTESTA=`estado` (5 valores: PENDIENTE,
  LEIDO, ACEPTADO, INICIADO, TERMINADO). En paradas: TTIDRE=
  `reparto_id_externo`, tipo CARGA|DESCARGA, dirección/CP/municipio/
  provincia/país/teléfono/contacto, producto+cantidad+unidad. Kms reales
  del viaje en cabecera: `km_total`/`km_vacio`/`km_cargado` (suma de
  `trips[].summary` de Satelles). Nº expedición: `pedidos.expedicion`
  (customerShipment concatenado). Toda migración `*_tenant_*` se aplica a
  TODOS los tenants con el servicio en `saycu_admin.empresas.servicios`,
  no solo a los del proveedor que la motivó; el drift lo vigila
  `saycu/_scripts/audit-tenant-schema.sh`.

- PROVEEDOR SATELLES (ERPSYNC): OAuth2 client_credentials (token TTL
  3600 s cacheado; 401 → refresh + reintento; host base en la ficha del
  proveedor — el real verificado es `ecotrans.satelles.es`). Scopes
  outbound: `satelles-publications:finished-routes` (cola) y
  `satelles-erpsync:write` (maestros). Sync: `GET /puba/routes/finished` →
  upsert pedido/albaranes/paradas → `POST …/commit` con los
  `publicationIds` procesados sin error (el commit ES el ack: lo
  commiteado deja de aparecer). Idempotencia: clave única
  (proveedor, publication_id) — reprocesar actualiza, no duplica.
  RELAY de maestros para el ERP (sin persistencia):
  `GET/PUT /pasarela/satelles/drivers[/:code]` y `…/vehicles[/:code]`
  (scopes inbound `satelles.read`/`satelles.write`; errores
  `sin_credencial_satelles` 404, `satelles_upstream_error` 502 con
  status+detail, `name_requerido`/`licensePlate_requerido` 400;
  `?entorno=sandbox` opcional). Contrato real del driver: `name`, `email`
  (1-254) e `idCard` (1-20) OBLIGATORIOS (422 si faltan). Satelles solo
  funciona DESDE PROD: su Cloudflare tiene en allowlist la IP de salida
  del servidor (149.86.232.18); desde dev u otra IP responde challenge.

- PROVEEDOR PCS VALENCIA (REST messaging): OAuth2 client_credentials.
  Sync: `GET /messages/download/{box}` (pendientes) → downloadMessage →
  upsert pedido/paradas/`pedidos_pcs_extra` → `DELETE /messages/download/
  {box}/{id}` (ack; 202 idempotente, 404 = ya borrado por plazo de
  gracia). Si el DUT no trae Orden de Entrega, los campos
  `terminal_devolucion_*` quedan NULL y el panel muestra «no incluida».

- CRON configurable EN CALIENTE: expresión en
  `saycu_admin.pasarela_config` (clave `cron_expr`; cron estándar o
  `every:Nm`), editable desde el admin («Datos Nodo API» → ⚙️, lista
  cerrada de minutos/horas). El watcher la relee cada 60 s y reprograma
  sin redespliegue; si la guardada es inválida, mantiene la anterior y
  avisa por email. Sin mensajes nuevos, el ciclo retorna inmediato.

- AVISOS (ErrorReporter del grupo): el nodo reporta como
  `superapitrans-nodo-api` (`[PROCESS][SUPERAPITRANS-NODO]`); ControlGlobal
  sigue registrando `pasarela-api` (catálogo de versiones, no un aviso).
  Un fallo del cron solo se reporta si PERSISTE 2 ciclos
  (`UMBRAL_CICLOS_FALLO`; rastreador de rachas `utils/
  fallo-persistente.js`, estado en memoria: un reinicio da margen de 1
  ciclo). Seis rastreadores: Satelles descarga/guardado de publicación/
  commit; PCS listado/mensaje/ack. Al recuperarse mandan `reportRecovery`
  con el payload del aviso original y el receptor emite «CORREJIDO:
  <asunto>». Las llamadas en vivo (relay de maestros) devuelven 502 al
  cliente, sin rastreador. Destinatarios: lista única del admin
  (`security_alert_recipients.receive_error_reports`).

- TESTS (node:test, sin deps): `docker exec -w /app pasarela_api npm test`
  — el script pasa el patrón de ficheros (`node --test tests/` a secas ya
  no vale con Node 22); los de integración necesitan BD → dentro del
  contenedor. Datos idempotentes de `tests/setup.js`: empresa TEST, BD
  `saycu_pasarela_test`, keys test-read/test-rw regeneradas, seed
  `TEST-SEED-1`. REGLA OPERATIVA: endpoint nuevo o contrato cambiado =
  tocar A LA VEZ `api/src/routes/…`, `api/tests/api.test.js` y el manual
  `ApiDocsPasarela.jsx` de admin.saycusoft.es (regla repetida como
  cabecera en `tests/api.test.js` y `src/app.js`). El Dockerfile copia
  `api/tests` para poder ejecutarlos dentro.

- BD: `pasarela_api` conecta como `saycutrans` (`DB_USER=saycutrans`): el
  auto-provisioning crea los tenants con ese owner y `saycuadmin` no tiene
  permisos en sus tablas.

- GOTCHAS:
  - `docker compose restart` NO recarga env_file: usar
    `up -d --force-recreate api` o `_scripts/restart-with-env-reload.sh`.
    Crítico con `PASARELA_DRY_RUN`: si crees que está activo y no lo está,
    el sync commitea y las publicaciones desaparecen de la cola de
    Satelles.
  - Migración tenant lanzada con `psql -U postgres` deja las tablas con
    owner postgres y el nodo falla con «permission denied»: toda migración
    que cree tablas termina con `ALTER … OWNER TO saycutrans` idempotente
    (la 0002 ya lo hace).
  - `PASARELA_SECRETS_KEY` debe coincidir EN RUNTIME entre el admin y el
    nodo (printenv dentro del contenedor, no solo el `.env`). Si cambia
    después de cifrar, las credenciales quedan indescifrables: borrar y
    volver a guardarlas desde la UI. Formato AES-GCM `[iv|tag|ciphertext]`
    idéntico entre `utils/pasarela-secrets.js` (admin) y
    `api/src/secrets.js`.

- DOCUMENTOS (`superapitrans/documentos/`): `campos.pdf` (campos TT* que
  espera el módulo de transporte del N1), manuales Satelles ERPSYNC
  (vigente v1.8.0 en `satelles/`; versiones anteriores conservadas) y
  colección Postman con cuerpos reales. Los añadidos de la v1.7+
  (`areaCodes`, delivery-modes…) no afectan al sync actual; solo
  importarían si se sincronizan maestros DESDE Satelles.

## ESTADO (2026-08-20)

- Los dos proveedores operativos EN PROD: Satelles (GFE) y PCS Valencia
  (JSR). Cadencia vigente del cron: cada 5 min (configurable en caliente).
- Avisos con recuperación («CORREJIDO») en dev y prod desde el 15/08;
  tests 43/43 en verde (contenedor de dev, 15/08).
- Migraciones aplicadas hasta la 0017 en dev y prod (tenants sin tabla
  `pedidos` se saltan).
- Documentos de destino de Satelles: su API los soporta y el cliente está
  preparado, pero GFE aún no los carga.

## PLAN / PENDIENTES VIGENTES

- Alta real de conductores/vehículos de GFE en Satelles: la hace el ERP
  del N1 por el relay (no se crean datos de pega en el maestro de un
  tercero). El PUT de vehicle sigue sin probar; su obligatoriedad la
  confirmará el primer alta real.
- Decidir los 2 tests preexistentes de marcar-procesado (PROCESADO vs
  TERMINADO).
- PCS Valencia — flecos abiertos (verificados en vivo el 2026-05-13):
  - Acknowledgementv2: la cuenta PUEDE escribir (verificado), sin
    implementar. Falta pasar `uploadMessage` (pcs-valencia/client.js) a
    multipart/form-data con campo `File` y conseguir el sample real del
    mensaje (pedirlo a Arantxa Nebot; en el mapper está `_unhandled`).
  - Política de retención de pendientes del PCS: desconocida; preguntar a
    Arantxa Nebot. Si los caducan → priorizar el ack; si los conservan →
    basta el sync (el ack queda como mejora).
  - Consulta por fechas: funciona (`toDate` exclusivo; techo 1000 items
    por respuesta, paginación sin confirmar). Antes de refactorizar el
    sync a ventana móvil con dedup, confirmar la paginación.
  - En comunicación al cliente sobre el PCS: el ack pendiente es deuda
    NUESTRA (lo emitimos nosotros al PCS), no un fleco del puerto.

## DECISIONES / CAMBIOS DE RUMBO (vigentes, con fecha)

- 2026-08-15: los avisos del nodo se identifican como
  `superapitrans-nodo-api` — ningún aviso se llama «pasarela» (norma del
  usuario); los seis rastreadores de racha avisan también de la
  recuperación («CORREJIDO»).
- 2026-06-30: anti-ruido — un fallo del cron solo avisa si persiste 2
  ciclos (antes era reporte inmediato o catch mudo).
- 2026-06-27: relay de maestros conductores/vehículos para el ERP
  (petición expresa del N1). La key `a3erp` se amplió de scopes SIN tocar
  su secreto — OJO: no emitir una key nueva con aplicación `a3erp` (el ON
  CONFLICT pisaría el secreto que usa NodeImport).
- 2026-06-24: destinatarios de avisos = lista única del admin; los
  informes diarios «todo OK» se apagaron (avisar solo en transición).
- 2026-06-03: alcance por proveedor (decisión del N1) — Satelles SOLO
  datos para facturación (nada más salvo petición expresa: solo podemos
  hacer lo que Satelles deja); PCS Valencia alcance más amplio,
  extensible cuando toque.
- 2026-05-26: toda migración `*_tenant_*` se aplica a TODOS los tenants
  del servicio, no solo a los del proveedor que la motivó.
- 2026-05-19: frecuencia del cron editable desde el admin, formato
  `every:Nm` además del cron estándar.
