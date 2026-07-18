# superapitrans (futuro: SaycuNode)

Última actualización: 2026-06-03.

## [2026-07-18] Contraste texto/fondo en los 6 temas (EN DEV, prod pendiente de OK)

Repaso transversal del grupo (encargo del usuario). Cambios de este
proyecto en la rama `hotfix/contraste-temas-panel`, desplegados a DEV y
verificados en el bundle servido. Detalle del bloque, método y parejas de
variables: GUION general del grupo y GUION de saycutrans (2026-07-18).



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
- Variable de entorno: `BASE_DOMAIN_SUPERAPI=saycunode.saycutrans.es` en
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

chofocles se separó a su propio repo el 2026-06-03: `llor/chofocles`.
El 2026-07-02 se APARTÓ del grupo Saycu (congelado, sin usuarios):
contenedores retirados de prod y dev, BD demo borrada con backup, rutas
Caddy retiradas e integración del admin eliminada. Repo local movido a
`/Volumes/THUND/proyectos/chofocles`; detalle en su GUION.md.


CONEXIONES Y ACCESOS
--------------------

- **Servidor:** debian.saycusoft.es. Alias SSH: `saycu` (prod),
  `saycudev` (dev).
- **Carpeta local:** `/Volumes/THUND/proyectos/saycu/superapitrans/`.
- **Carpeta remota:** `/var/opt/superapitrans/` (en saycudev y saycu).
- **Subdominio público de API**:
  - PROD: `api.saycunode.saycutrans.es`
  - DEV : `dev-api.saycunode.saycutrans.es`
- **Path por sub-servicio:** `https://api.{BASE_DOMAIN}/<servicio>/...`.
  system-caddy strippea `/<servicio>/` y reescribe `/api{path}` antes de
  hacer reverse-proxy al backend del sub-servicio. El código del
  sub-servicio no sabe que vive detrás de un prefijo.
- **BBDD:** PostgreSQL compartida con el resto del grupo Saycu por la red
  externa `system_postgres_net`.


SUBDOMINIOS (dominio definitivo: saycunode.saycutrans.es)
---------------------------------------------------------

DNS creado por el cliente (Saycusoft) el 2026-06-08, mismos IPs que los
anteriores de superapi.eoden.es:
- `api.saycunode.saycutrans.es`        → 149.86.232.18 (saycu / prod)   ✅ cableado
- `dev-api.saycunode.saycutrans.es`    → 149.86.233.79 (saycudev / dev) ✅ cableado
- `panel.saycunode.saycutrans.es`      → 149.86.232.18                  ✅ cableado (sirve pasarela por path)
- `dev-panel.saycunode.saycutrans.es`  → 149.86.233.79                  ✅ cableado (ídem)
- `www.saycunode.saycutrans.es`        → 149.86.232.18                  ⏳ sin cablear (DNS reservado, sin bloque Caddy)
- `dev-www.saycunode.saycutrans.es`    → 149.86.233.79                  ⏳ sin cablear (ídem)

`www`/`dev-www` quedan reservados; cuando se necesiten, añadir el bloque
correspondiente a `system-caddy/conf/Caddyfile.{dev,prod}`.


CAMBIO DE DOMINIO superapi.eoden.es → saycunode.saycutrans.es (en curso 2026-06-08)
----------------------------------------------------------------------------------

El dominio anterior `superapi.eoden.es` era propiedad del usuario (llor);
se sustituye por el definitivo del grupo `saycunode.saycutrans.es`.

HECHO (repo, 2026-06-08):
- Reemplazado el dominio en todas las referencias de repo (docs, ejemplos
  `.env-*.example`, scripts de deploy, comentarios, `src/api.ts` de la APK
  de chofocles, `config.json`/`config.gfe.json` de NodeImport,
  `shellConfig.js` y `ApiDocsPasarela.jsx` del admin, `monitoring.conf.example`,
  comentarios del `docker-compose.yml` de system-caddy). El nombre de la
  variable `BASE_DOMAIN_SUPERAPI` NO se renombra (eso es la Fase B / rename
  a SaycuNode).

DNS (2026-06-08, resuelto): zona publicada (serial SOA 2026060806). Hubo una
incidencia transitoria — los dos autoritativos quedaron desincronizados
(`dns1` servía `*.saycunode`, `dns2` daba NXDOMAIN) y eso hacía fallar la
validación de Let's Encrypt. El cliente replicó la zona a `dns2`; tras expirar
la caché negativa de los resolvers públicos, los 6 registros resuelven en
ambos autoritativos + 8.8.8.8/1.1.1.1/9.9.9.9.

DEV (HECHO y verificado, 2026-06-08):
- `BASE_DOMAIN_SUPERAPI=saycunode.saycutrans.es` en system-caddy `.env` de
  saycudev (con backup); `VITE_API_BASE` en `.env-dev` de pasarela y chofocles.
- `system_caddy` recreado → certs Let's Encrypt emitidos (dev-api/dev-panel).
- Paneles de pasarela y chofocles recompilados; el bundle apunta al dominio
  nuevo (0 referencias al viejo). API + paneles responden 200 por `*.saycunode`.
- Dos fixes de deploy de chofocles (commit aparte 1d6fb92): ruta saycu-theme
  (`../` no `../../`) y carpeta `panel/public/` faltante.
- system-caddy NO usa `.env-dev`/`.env-prod`: un `.env` por servidor.
- Backups en saycudev: `.bak-20260608-121320`.

PROD (HECHO y verificado, 2026-06-08):
- `BASE_DOMAIN_SUPERAPI` en system-caddy `.env` de saycu (backup .bak-20260608-123233);
  `VITE_API_BASE` en `.env-prod` de pasarela y chofocles.
- `system_caddy` recreado → certs Let's Encrypt emitidos (api/panel.saycunode).
- Paneles pasarela y chofocles recompilados; bundles apuntan al dominio nuevo
  (0 al viejo). API + paneles responden 200 por `*.saycunode`. Grupo prod intacto.
- Creado `chofocles/_scripts/deploy-panel-prod.sh` (no existía).
- `Caddyfile.dev` corregido sincronizado al server prod.

PENDIENTE (fuera del frontal — el dominio viejo `superapi.eoden.es` ya NO
enruta, así que estos clientes quedan apuntando a un dominio muerto):
- NodeImport en a3win: actualizar el `config.json` real (carpeta Publish) a
  `https://api.saycunode.saycutrans.es/pasarela` (estaba aparcado 2026-06-04).
- APK de chofocles: recompilar con el dominio nuevo y redistribuir (las APKs
  instaladas apuntan a `api.superapi.eoden.es/chofocles` → rotas hasta actualizar).
  SIN URGENCIA: chofocles está en reserva/parado (sin usuarios) a 2026-06-08.
- Monitorización: actualizar `/etc/saycu-monitoring/monitoring.conf` en el server.
- (Opcional, cosmético) renombrar la carpeta `superapitrans/` → SaycuNode (Fase B).


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


NODEIMPORT (A3/ — Cliente C# Windows)
--------------------------------------

Última actualización: 2026-06-04.

**Qué es:** Programa C# WinForms (.NET 10, x86) que importa datos de la
API pasarela a a3ERP. Se integra en el menú de a3ERP como aplicación
externa, igual que SaycuImport de DataControl.

**Nombre:** NodeImport (sin prefijo "Saycu", es un programa oculto/interno).

**Arquitectura:** Clonada de `datacontrol/A3/SaycuImportV2/`:
- Lee datos de la Pasarela API por HTTP (Bearer API key).
- Escribe en a3ERP por COM ActiveX (`a3ERPActiveX.dll`).
- No crea tablas propias en SQL Server; usa las nativas de a3ERP.
- Marca lo importado con prefijo en REFERENCIA (`NI-{id}`) para
  rastreo vía `SELECT FROM CABEALBV/CABEPED WHERE REFERENCIA LIKE 'NI-%'`.

**Dos modos de importación según proveedor:**

1. **Satelles** → Albaranes de compra (`a3ERPActiveX.Albaran`, `bEsDeCompra=true`).
   Solo campos necesarios para facturación: cliente, fecha, referencia,
   artículo/servicio, cantidad. Sin paradas.

2. **PCS Valencia** → Pedidos de compra (`a3ERPActiveX.Pedido`, `bEsDeCompra=true`).
   Cada pedido de transporte = 1 cabecera; cada parada = 1 línea del
   pedido (descripción con dirección, tipo carga/descarga, mercancía).
   Estructura compatible con SaycuTrans (viaje → paradas).

**Campos en a3ERP (camino sencillo, como DataControl):**
Solo campos comerciales estándar (REFERENCIA, CODCLI/CODPRO, CODART,
DESCLIN, CANTIDAD, PRECIO, CENTROCOSTE, OBSERVACIONES). El detalle
logístico (GPS, tiempos, contenedor, BL, firmas) queda en la API
pasarela. Si el N1 necesita más campos en a3ERP en el futuro, se
pueden añadir vía el diccionario de a3ERP (tablas/campos personalizados).

**Distinción pedidos vs albaranes:**
- La tabla canónica se llama `pedidos` pero el campo `tipo` distingue:
  `ALBARAN` (nota de entrega) vs `PEDIDO` (orden de compra).
- **Satelles** solo genera albaranes (tipo=ALBARAN). Nunca pedidos.
- **PCS Valencia** genera ambos mezclados.
- En a3ERP cada tipo va por su camino COM: albarán →
  `a3ERPActiveX.Albaran`, pedido → `a3ERPActiveX.Pedido`.
- La UI tiene filtro de Tipo (Todos/ALBARAN/PEDIDO) y la barra de
  estado muestra el desglose (X alb. / Y ped.).

**Auto-reinicio post-importación (patrón SaycuImport):**
Cuando NodeImport se abre desde a3ERP como aplicación externa, a3ERP
lanza el .exe como proceso hijo. Tras la primera importación, la
conexión COM queda en estado sucio (hilo STA no reutilizable). Si el
usuario importa otra vez, peta. Además a3ERP puede matar el proceso
por inactividad.
- **Solución:** tras cada importación exitosa, el .exe se relanza a sí
  mismo con `--restore`, conservando: log RTF, filtros (estado, tipo,
  fechas), posición de ventana (--bounds).
- La nueva instancia arranca invisible (Opacity=0), restaura todo, se
  hace visible y mata la instancia vieja (--kill-pid).
- El usuario no nota nada — parece la misma ventana.
- Misma solución que SaycuImport (documentado en su GUION.md).

**Empresa a3ERP:** De momento se prueba con GFE (GLOBAL FEED
ECOTRANS, S.L.) que es la que tiene datos de Satelles. La empresa
real del N1 es TRANSCOLLADO (BD ya creada en SQL Server de
SRV-SAYC00-009). Pendiente: darle permisos al usuario Windows.

**API key pasarela para GFE:** creada en prod el 2026-06-04.
Prefijo `pas_live_b2cb99b`, scopes `datos.read` + `datos.write`.
Empresa admin id=12 (GFE). La key completa está en el config.json
de la carpeta Publish de a3win.

**Entorno de desarrollo:** SRV-SAYC00-009 vía `ssh a3win`.
Mismo flujo que SaycuImportV2: editar en Mac → SCP → compilar en Windows.
- SSH entra como usuario `llor`, escritorio remoto como `juanemilio.llor000`.
- El enlace simbólico del escritorio está en el perfil de `juanemilio`.
- .NET SDK 10.0.300 x86 instalado en `C:\dotnet\` (no en el PATH;
  invocar como `C:\dotnet\dotnet.exe`).

**Compilación:**
```
scp *.cs *.csproj *.ico *.bat a3win:'C:\Saycusoft\NodeImport\'
ssh a3win 'C:\dotnet\dotnet.exe publish "C:\Saycusoft\NodeImport\NodeImport.csproj" -c Release -r win-x86 --self-contained true -o "C:\Saycusoft\NodeImport\bin\Publish"'
```

**Configuración:** `config.json` local.
- URL Pasarela API, empresa, API key (Bearer).
- Empresa a3ERP, usuario, password.
- Import: codCliA3, codArtSatelles, codArtPcs, cambiarEstadoTras.

**Instalador:** Inno Setup (`.menu` para a3ERP + wizard de config).
Entrada de menú Id=`NI_IMP` (convive con SaycuImport Id=`SS_IMP` en
el mismo `saycuwmodelos.menu`).

**Log:** fichero diario en `bin\Publish\log\nodeimport_YYYYMMDD.log`.

**Carpeta local:** `superapitrans/A3/NodeImport/`.
**Carpeta Windows dev:** `C:\Saycusoft\NodeImport\`.
**Carpeta Windows publicación:** `C:\Saycusoft\NodeImport\bin\Publish\`.

**Carpetas en a3win (C:\Saycusoft\):**
- `NodeImport/` — fuentes + compilación de NodeImport.
- `SaycuImport/` — instalación productiva de SaycuImport (DataControl).
- `SaycuImportV2/` — fuentes + compilación de SaycuImport.
- `Albarania/` — script PowerShell de envío de albaranes.
- (SaycuImportV30 eliminada el 2026-06-04: era clon descartado de V2.)

**Ficheros fuente (2473 líneas totales):**
- `NodeImport.csproj` — Proyecto .NET 10, WinForms, x86.
- `Config.cs` — AppConfig (PasarelaConfig + A3ErpConfig + A3SqlConfig +
  ImportSettings). CliArgs con --cli, --estado, --desde, --hasta, --solo-consulta.
  ImportSettings: codCliA3, codArtSatelles, codArtPcs, cambiarEstadoTras.
- `Registro.cs` — Modelos tipados: PedidoPasarela, AlbaranPasarela,
  ParadaPasarela, PcsExtraPasarela, ListaPedidosResponse.
- `PasarelaApi.cs` — Cliente HTTP con Bearer auth. ListarPedidos,
  ListarTodosPedidos (paginación automática), ObtenerPedido, CambiarEstado,
  TestConexion.
- `A3ErpService.cs` — COM ActiveX: Conectar, ImportarSatelles (Albaran),
  ImportarPcsValencia (Pedido con paradas como líneas),
  ObtenerReferenciasImportadasSql (ADODB), CrearArticuloSiNoExiste,
  ObtenerOCrearCentroCoste, TestConexionRapida.
- `Program.cs` — Entry point: GUI (mutex instancia única), CLI (--cli),
  restore (--restore). Flujo CLI completo: consultar → filtrar → importar.
- `MainForm.cs` — WinForms: cabecera azul corporativa, filtros (estado,
  fechas), grid con columnas (Sel, indicador color, ID, NumeroPedido,
  Proveedor, Tipo, EstadoApi, Fecha, Cliente, Tercero, Tractor, Remolque,
  Albaranes, EstadoImport), botón Importar, toggle pendientes, test A3ERP,
  panel de log oscuro, barra de estado. Importación vía STA thread helper.
- `Logger.cs` — Log a fichero diario.
- `ErrorHelper.cs` — Diálogo de error con detalle técnico.
- `config.json` — Plantilla con campos CAMBIAR.
- `compilar.bat` — Script de compilación (`dotnet build -c Release -r win-x86`).
- `Instalador/NodeImport_Setup.iss` — Instalador Inno Setup: wizard con
  3 páginas (Pasarela, A3 ERP, Import), validación Bearer contra la API,
  genera config.json, crea/actualiza entrada `NI_IMP` en el menú de a3ERP
  (saycuwmodelos.menu). Mismo patrón que SaycuImport (Id=`SS_IMP`), conviven
  en el mismo .menu.

**ESTADO ACTUAL — Aparcado 2026-06-04:**
El programa está compilado, consulta albaranes de GFE desde la pasarela
y los muestra en el grid (199 albaranes PENDIENTE verificados). La empresa
GFE se ha creado en a3ERP (SQL Server) con datos de ejemplo. Falta probar
la importación COM real. El siguiente paso es:
1. Abrir NodeImport en a3win (escritorio remoto, usuario juanemilio).
2. Consultar → seleccionar UN albarán → Importar.
3. Si el login COM falla con SA/SA, probar sin contraseña o crear usuario
   desde la interfaz de a3ERP (Utilidades → Usuarios).
4. Verificar que el albarán aparece en a3ERP (Compras → Albaranes).

**Config actual en a3win (`bin\Publish\config.json`):**
- Pasarela: `https://api.saycunode.saycutrans.es/pasarela` | empresa GFE
- a3ERP: empresa GFE | usuario SA | password SA
- Import: codCliA3=1 (SPORTS ABC, datos ejemplo)

**TODO:**
- [x] API key de GFE creada en prod (2026-06-04).
- [x] Primera compilación en a3win (.NET 10 SDK instalado, exe funcionando).
- [x] Fichero `.menu` para integración en menú de a3ERP (en el .iss).
- [x] Instalador Inno Setup (NodeImport_Setup.iss).
- [x] Consulta de albaranes Satelles verificada en vivo (199 PENDIENTE).
- [x] Empresa GFE creada en a3ERP con datos de ejemplo.
- [x] Permisos SQL Server dados a llor y juanemilio sobre GFE.
- [ ] **SIGUIENTE: probar importación COM real (paso 1-4 arriba).**
- [ ] Compilar instalador con Inno Setup 6 (si no está instalado en a3win).
- [ ] Decidir dominio definitivo (saycunode.es vs saycunode.saycutrans.es).
- [ ] Documentar todo en admin.saycusoft.es ficha GFE.

**Decisiones pendientes:** Si el N1 quiere campos logísticos dentro de
a3ERP, se abordará con el diccionario de a3ERP (tablas/campos personalizados).
