# superapitrans

Última actualización: 2026-05-01 (chofocles + pasarela operativos en
saycudev y saycu, ambos enrutados por system-caddy global)


OBJETIVO
--------

Servicio API alojado en `debian.saycusoft.es` (mismo servidor que el resto
del grupo Saycu) al que accederán diferentes tipos de consumidores. Es el
contenedor común de servicios API del grupo saycutrans: agrupa varios
sub-proyectos (hoy: chofocles) tras un único subdominio API público.


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

superapitrans no tiene Caddy propio. La carpeta solo contiene:
- `chofocles/` (sub-servicio).
- `_scripts/detect_env.sh` (utilidad para deploys).
- GUION.md y CLAUDE.md.


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


VISIÓN COMPLETA DEL SISTEMA — FUENTE DE VERDAD (2026-05-01)
============================================================

Esta sección es la especificación maestra del sistema, dictada por el
usuario el 2026-05-01. Cualquier diseño/implementación posterior se
contrasta contra esta sección. Cubre los tres sub-proyectos
(chofocles + pasarela + app móvil) y el flujo de facturación. Si surge
una duda y esta sección es ambigua → preguntar al usuario, no inventar.

FLUJO DE ENTRADA (RECEPCIÓN DE PEDIDOS POR EMAIL)
--------------------------------------------------

La empresa que necesita encargar pedidos emite un documento por email
al chofer. La dirección de email del chofer es una proporcionada por
nosotros (formato `juanitolopez@chofocles.es`), creada precisamente
para que reciba los encargos.

Tenemos un receptor de emails permanente a la espera. Cuando llega un
email:

1. **El receptor identifica al remitente** y consulta la BBDD.

2. **Procedencia conocida + plantilla conocida** → se aplica la
   plantilla, se desglosan los datos, se insertan en la tabla
   canónica de pedidos.

3. **Procedencia conocida + plantilla desconocida** → se llama a la
   IA por API, se le pasa el documento, la IA genera la plantilla.
   Una vez generada, se procede como en el caso anterior. La
   plantilla queda guardada para reutilizarse.

4. **Procedencia desconocida** → se ejecuta primero el caso anterior
   (IA → plantilla nueva) y además se crea la ficha de la nueva
   procedencia, vinculándola al chofer destinatario.

**Plantillas y procedencias son globales** (compartidas entre todos
los choferes), pero la **relación chofer ↔ procedencia es por chofer**.

5. **Si la transformación falla** (la IA no consigue generar
   plantilla útil, o el desglose con plantilla revienta):
   - Se avisa al chofer.
   - Se nos avisa también: se abre un **ticket urgente** con todos
     los datos del email, del documento y del intento de
     transformación, para que lo solventemos manualmente y
     contactemos con el chofer.

NOTIFICACIÓN AL CHOFER (UNA VEZ HAY DATOS EN LA TABLA)
-------------------------------------------------------

Cuando un pedido entra correctamente a la tabla, se notifica al
chofer **por tres vías simultáneas**:

- Aviso de voz (TTS).
- Aviso luminoso (flash visual en la app).
- Notificación push.

El chofer responde **por voz** (aceptación o rechazo). La orden de voz
se procesa, se llama a la API y se marca el registro.

CICLO DE VIDA DEL PEDIDO (LADO CHOFER, POR VOZ)
------------------------------------------------

Tras aceptar, el chofer va cambiando de estado por voz: "chófocles,
iniciamos el viaje" o similares.

Lógica obligatoria:
- Por defecto un viaje se inicia hacia la carga, no hacia la
  descarga. La app asume eso si no hay ambigüedad.
- **Si hay varias cargas** y la orden es ambigua, la app **pregunta**
  por voz a cuál se dirige el chofer. Cuando queda claro, se marca
  el estado y la primera parada.
- En general: ante ambigüedad → preguntar; sin ambigüedad → ejecutar.

Funcionará como saycutrans pero más sencillo. Más sencillo porque:

- Todo va por voz siempre que se pueda.
- **El chofer puede eliminar pasos**: en el panel de configuración
  (no por voz) hay interruptores para activar/desactivar cada paso
  intermedio.
  - Ejemplos: "solo quiero inicio y fin", "quiero todos los pasos",
    "quiero inicio, llegada a carga, llegada a descarga, fin".
- Lo que el chofer haya marcado en config se respeta en la app: los
  pasos desactivados no se le piden ni le aparecen.

Todos los estados quedan reflejados en la tabla canónica
(`pasarela.pedidos`/`paradas`), para que el a3ERP del cliente Saycu
los recoja vía API.

FLUJO DE SALIDA HACIA a3ERP
----------------------------

El servidor de enlace a3ERP del cliente Saycu llama a nuestra API
(`pasarela`) para recoger los datos. La API filtra por tenant y
devuelve los pedidos/albaranes/paradas en el estado actual. El
intercambio se hace **siempre vía API**, no por BD compartida.

FACTURACIÓN AUTOMÁTICA (LADO SERVIDOR)
---------------------------------------

Generamos las facturas **automáticamente** en el servidor para
quitarle ese trabajo al chofer.

- El chofer las consulta por web (panel).
- Cuando el chofer da el visto bueno, la factura queda **marcada
  como aprobada** y disponible para que a3ERP la recoja por la API.
- Hasta que el chofer no apruebe, a3ERP no la ve como definitiva.

(Detalle de cómo se generan las facturas: pendiente — el usuario lo
dará cuando se aborde este bloque.)

DECISIONES TRANSVERSALES IMPLÍCITAS
------------------------------------

- **Plantillas y procedencias en `saycu_admin`** (catálogos
  compartidos), no por tenant. Las relaciones chofer ↔ procedencia
  sí dependen del chofer (y por tanto del tenant del chofer).
- **Tickets urgentes**: existirá un módulo de tickets/incidencias.
  Pendiente de definir si vive en chofocles, en admin global, o en
  un servicio aparte.
- **La tabla canónica del módulo de transporte ya está**: 4 tablas
  en `saycu_pasarela_<tenant>` (pedidos, albaranes, facturas,
  paradas). Tanto chofocles como Satelles como introducción manual
  vuelcan ahí.

RONDA 2 — DECISIONES ADICIONALES (2026-05-01, mismo turno)
-----------------------------------------------------------

**1. Modelo chofer ↔ empresa.**
La unidad de negocio es siempre **una "empresa-chofer"** (ficha tipo
empresa) que puede contener:
- 1 chofer = autónomo único (caso mayoritario).
- N choferes empleados (1 o más choferes en la misma ficha-empresa).
- Una empresa con muchos choferes (hasta 50, p. ej.).

Diseño claro y amigable para los tres casos. Decisión técnica delegada
al equipo: el modelo natural es que la empresa-chofer sea el tenant
Saycu (`saycu_admin.empresas`) y los choferes sean usuarios dentro
del tenant, pero falta cerrarlo con el usuario antes de codificar.

**2. Buzones del chofer.**
Servidor de correo propio: `mail.saycusoft.es` (89.248.99.64). Cada
chofer tiene su buzón individual `<algo>@chofocles.es`. El email mapea
1:1 a un chofer, y el chofer pertenece a una empresa-chofer.

**3. Procedencia: pista vs. verdad.**
- **Pista:** dirección remitente del email (rápida, primera asignación).
- **Verdad:** nombre de la empresa que figura **en el documento**.
Esa empresa es la que recibirá la factura, así que es la que manda.
La relación email-remitente ↔ procedencia se aprende y se guarda
automáticamente para acelerar futuras llegadas.

**5. IA = Claude.** El documento puede llegar como PDF, DOCX, XLSX,
email plano, HTML, imagen escaneada, etc. La pasarela debe poner
todos los medios para interpretarlo (extracción texto, OCR, parser
HTML, lectura del cuerpo del email, etc.). Si una técnica no da
certeza, se prueba otra hasta máxima certeza.

**6. Doble validación de la IA.**
La IA inserta directamente en la tabla, pero antes **se asegura de la
extracción por dos métodos diferentes** (a definir: dos pasadas
independientes con prompts distintos, o cross-check contra
catálogo+remitente, etc.). Si los dos métodos divergen → ticket. Si
ambos coinciden → insertar.

**7. Pasos del viaje.**
Tomar como referencia la app móvil de SaycuTrans. Replicar ese
catálogo de pasos. Los interruptores del panel del chofer
activan/desactivan cada uno.

**8. Reasignación + timeout — config por proveedor.**
- Si el chofer **es autónomo único**, el pedido **no se reasigna**.
  Se rechaza al cumplirse el timeout.
- Timeout y reglas son **configurables por proveedor** (no globales),
  porque cada proveedor tiene su propio modo de operar (algunos
  emiten en modo albarán, otros en modo factura). La config vive en
  `admin.saycusoft.es` dentro del módulo del servicio chofocles.
- Cuando la IA detecta un proveedor nuevo: lo crea en la tabla, lo
  vincula al chofer destinatario y abre un **ticket informativo a
  los técnicos Saycu** (no urgente) para que se complete su config.

**9. Reasignación dentro de empresa-chofer multi-chofer.**
- Si la empresa tiene varios choferes y uno no responde en el timeout,
  el pedido **sí se traslada al siguiente** según un orden definido.
- El orden y los tiempos los configura el responsable (el "jefe") en
  su propio panel, y puede depender del día de la semana, vacaciones,
  etc. Es editable en cualquier momento por el jefe.

**12. Tickets transversales en `admin.saycusoft.es`.**
Módulo de tickets propio en admin global. No es solo para chofocles;
sirve a todos los servicios Saycu. Tiene API consumible y web propia
en admin con todas las utilidades de tickets (crear, asignar, estado,
prioridad, comentarios, cierre, búsqueda, etc.).

**13. "Nosotros" = técnicos Saycu.**
Los avisos a los técnicos van por email. Buzón provisional:
`llor@llor.net`. Se cambiará por uno definitivo cuando el sistema
esté en marcha.


RONDA 3 — DECISIONES FINALES (2026-05-01, mismo turno)
-------------------------------------------------------

**14. Empresa-chofer = tenant Saycu — CONFIRMADO.**
Cada empresa-chofer (autónomo único o empresa con N choferes) es **un
tenant Saycu**: una fila en `saycu_admin.empresas` + su BD
`saycu_pasarela_<código>` para sus pedidos. Los choferes son
**usuarios** dentro del tenant. El "jefe" es un usuario con rol admin
del tenant.

**15. Plantillas son la fuente de verdad — funcionan sin IA.**
Las plantillas resuelven el desglose de un documento de forma
determinista (sin llamar a Claude). La IA **solo entra en escena
cuando hay que crear una plantilla nueva**:
- Empresa nueva → plantilla nueva.
- Documento de empresa conocida que ha cambiado de formato → plantilla
  nueva (o nueva versión).
- Algo no coincide → plantilla nueva.

Cuando la IA crea plantilla, debe asegurarse de que funciona
correctamente atendiendo a:
- Caracteres extraños / encoding.
- Cambios de localización de datos dentro del documento.
- Diferencias enormes según extensión (un `.doc` puede variar mucho
  respecto a un `.txt`).

**Los métodos concretos para asegurarse los decide la propia IA**, no
nosotros, porque lo hará mejor que un humano. Si tras intentarlo de
varias maneras la IA no tiene **certeza en un campo importante** →
ticket. Un humano interviene y la plantilla se construye con ayuda
del humano.

**16. Tipos de documento del MVP — CONFIRMADO el set propuesto.**
PDF, DOCX, XLSX, TXT plano, HTML del cuerpo del email, imágenes con
OCR (JPG/PNG). Si aparece un tipo nuevo no contemplado → ticket
(mismo flujo que cualquier otra incidencia).

**17. Pasos del viaje uniformes; el chofer ajusta en su panel.**
El catálogo de pasos es el mismo para todos los proveedores. Si un
proveedor concreto no requiere algún paso, el propio chofer lo
desactiva en los interruptores de su panel. Sin lógica especial por
proveedor en este punto.

**10 y 11 — APARCADAS.**
La estructura de líneas de la factura y la periodicidad se cerrarán
**al final**, cuando tengamos documentos reales analizados y hayamos
hablado con los choferes para conocer cómo facturan ellos. No se
diseñan ahora.


SEMÁFORO DE ESPECIFICACIÓN
---------------------------

🟢 **Ya cerrado (se puede empezar a construir):**
- Modelo tenant ⇄ chofer.
- Buzón de correo propio (mail.saycusoft.es).
- Pista por email + verdad por documento.
- IA = Claude para crear plantillas; plantillas determinan el
  desglose.
- Tipos de documento del MVP.
- Catálogo de pasos uniforme + interruptores en el panel del chofer.
- Reasignación: nunca para autónomo único; sí dentro de una empresa
  multi-chofer, con orden y timeout configurables por el jefe.
- Config de timeout y modo (albarán/factura) por proveedor en
  `admin.saycusoft.es`.
- Tickets transversales en `admin.saycusoft.es` (módulo nuevo).
- Avisos a técnicos por email a `llor@llor.net` (provisional).

🟡 **Decisiones técnicas — IMPLEMENTADAS:**
- Plantillas: formato JSON `{empresa, match:{all,any}, fields:{...}}`
  en `saycu_admin.chofocles_plantillas_json` (compatible con extractor
  legacy + lo que produce la IA).
- Auto-validación IA: doble extracción interna A (regex) / B (contexto)
  con un único prompt; consenso obligatorio en campos críticos
  (operador_nombre, origen_municipio, destino_municipio, fecha_carga).
  Discrepancia → ticket urgente.
- Tickets: módulo transversal en `saycu_admin` con UI propia en panel,
  email automático para urgentes.
- Onboarding: endpoint `POST /api/chofocles-admin/onboard` + UI
  `/chofocles/onboarding` que crea empresa-tenant + BD chofocles +
  BD pasarela + usuarios + buzones IMAP cifrados.
- Modo IMAP central: `imap_central.py` + flag `IMAP_MODE=central`
  para conectarse a un solo `mail.saycusoft.es` y enrutar por
  destinatario (per_chofer sigue funcionando como fallback).
- Reasignación multi-chofer: tabla `chofocles_choferes_orden` en el
  tenant + cron en chofocles_api con orden, vacaciones y días
  disponibles. Activable por `CHOFOCLES_REASIGNACION_ENABLED=true`.
- Esqueleto app móvil en `superapitrans/chofoclesapp/`.

🔴 **Aparcado hasta tener datos reales:**
- Líneas de la factura del chofer al proveedor (qué se cobra: viaje,
  km, peso, lo que dice el documento).
- Periodicidad de la facturación (por viaje / semanal / mensual /
  por relación).


SUB-PROYECTOS
-------------

- **chofocles/** — extracción de órdenes de transporte por email.
  - API: `https://api.{BASE_DOMAIN}/chofocles/...` → backend interno
    `chofocles_api:3411` con prefijo `/api`.
  - Panel: `https://panel.{BASE_DOMAIN}/chofocles/` (boceto desplegado
    en saycudev y saycu).
  - Estado: backend completo; panel boceto OK; pendiente arranque del
    api con secretos reales. Ver `chofocles/GUION.md`.

- **chofoclesapp/** — esqueleto de la app móvil chofocles (Capacitor +
  React + Vite). Login + listado de pedidos contra el API. Voz, push e
  interruptores de pasos pendientes. Ver `chofoclesapp/GUION.md`.

- **pasarela/** — sistema de API con keys (inbound clientes + outbound
  proveedores) y tabla de datos canónica.
  - API: `https://api.{BASE_DOMAIN}/pasarela/...` → backend interno
    `pasarela_api:3412` con prefijo `/api`.
  - Estado: operativa en saycudev y saycu. Migraciones aplicadas, DEMO
    activo, primera key cliente DEMO/a3erp emitida en ambos entornos,
    auth bearer verificada con curl real. Sin credenciales Satelles
    todavía; el cron outbound espera a que se inserte la primera fila
    cifrada. Ver `pasarela/GUION.md`.


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


ESTADO ACTUAL (2026-05-01)
--------------------------

- ✅ chofocles trasladado a `saycu/superapitrans/chofocles/`. Panel
  desplegado en `panel.superapi.eoden.es/chofocles/` (prod y dev).
- ✅ DNS creados en `eoden.es` (api/dev-api/panel/dev-panel/www/dev-www).
- ✅ Red Docker `superapitrans_network` creada en ambos servidores.
- ✅ `system-caddy/.env` y `docker-compose.yml` con `BASE_DOMAIN_SUPERAPI`
  + red externa en ambos servidores.
- ✅ `system-caddy/conf/Caddyfile.{dev,prod}` con bloques `api` y `panel`
  para chofocles y pasarela.
- ✅ pasarela_api desplegado y verificado end-to-end en dev y prod
  (auth bearer + tenant DEMO funcionando).


ARRANQUE EN EL SERVIDOR (operativa)
------------------------------------

Pre-condición: la red `superapitrans_network` debe existir antes de
arrancar `system_caddy`. Una sola vez por servidor:

    docker network create superapitrans_network

Después, los sub-servicios (chofocles, futuros) arrancan desde su propia
carpeta con su propio compose. Cada uno se conecta a
`superapitrans_network` como red externa.


TODO INMEDIATO
--------------

- [ ] Insertar credenciales reales de Satelles (DEMO) cuando lleguen
      del cliente: una fila cifrada en `pasarela_proveedores_credenciales`
      activa el cron outbound automáticamente. Ver `pasarela/GUION.md`
      para el procedimiento exacto.
- [ ] Crear `.env` real de chofocles en saycudev/saycu y arrancar
      `chofocles_api + chofocles_ingestor` cuando se aborde el bloque
      operativo de chofocles.
- [ ] Añadir a la monitorización Saycu (`monitoring.conf`):
      `REQUIRED_CONTAINERS += pasarela_api`,
      `ACCESS_URLS += https://api.superapi.eoden.es/pasarela/health` +
      `https://dev-api.superapi.eoden.es/pasarela/health`.


PROBLEMAS RESUELTOS
-------------------

- **2026-05-01:** primer intento incluía un Caddy propio en
  `superapitrans/docker-compose.yml` que chocaba con `system_caddy`
  (puerto 80 ya ocupado). Solución: eliminar el Caddy propio y
  registrar superapitrans como bloque dentro de `system-caddy` global,
  patrón homogéneo con el resto del grupo Saycu.
