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

**TODO:**
- [ ] Resolver permisos de TRANSCOLLADO (usuario Windows en SQL Server).
- [x] API key de GFE creada en prod (2026-06-04).
- [x] Primera compilación en a3win (.NET 10 SDK instalado, exe funcionando).
- [x] Fichero `.menu` para integración en menú de a3ERP (en el .iss).
- [x] Instalador Inno Setup (NodeImport_Setup.iss).
- [x] Consulta de albaranes Satelles verificada en vivo (199 PENDIENTE de GFE).
- [ ] Rellenar codCliA3 / codArt reales en config.json.
- [ ] Probar importación real a a3ERP (necesita credenciales a3ERP).
- [ ] Compilar instalador con Inno Setup 6 (si no está instalado en a3win).
- [ ] Decidir dominio definitivo (saycunode.es vs saycunode.saycutrans.es).

**Decisiones pendientes:** Si el N1 quiere campos logísticos dentro de
a3ERP, se abordará con el diccionario de a3ERP (tablas/campos personalizados).
