# chofocles

Última actualización: 2026-05-01 (movido a `saycu/superapitrans/chofocles/`;
chofocles deja de ser sub-servicio de saycutrans y pasa a ser sub-servicio
de superapitrans)


OBJETIVO
--------

Servicio de Saycusoft (sub-servicio dentro de superapitrans) para que las
empresas de transporte cuyos choferes reciben órdenes de carga por email
(PDF, DOCX o imagen) tengan los datos extraídos automáticamente,
guardados en BBDD y gestionados desde una web propia y desde una app
móvil del chofer. Es un servicio mucho más simple que saycutrans, pero
calcado en filosofía y arquitectura.

El nombre `chofocles` (chofer + Sófocles) marca distancia con la app
"chofer" de saycutrans para evitar confusión, y guiña al rasgo
distintivo del producto: el diálogo por voz.

Sucesor del piloto `/Volumes/THUND/proyectos/importarDatosPdf/`
(extractor por plantillas), que se reutiliza como motor de extracción
interno.


CONEXIONES Y ACCESOS
--------------------

- **Servidor:** debian.saycusoft.es (mismo donde corre saycutrans).
- **Ubicación:** `saycu/superapitrans/chofocles/`. chofocles es uno de los
  sub-servicios API que aglutina superapitrans. Comparte servidor y stack
  Docker con el resto de superapitrans, y comparte instancia PostgreSQL
  con todo el grupo Saycu vía la red `system_postgres_net`.
- **Reutilización desde saycutrans:** mantenemos las mismas claves JWT,
  mismas formas de payload y mismo patrón multi-tenant que saycutrans (no
  hay dependencia de carpeta, sí de convenciones).
- **Web propia:** página propia accesible directamente por la empresa
  cliente Y a través de admin.saycusoft.es (igual que el resto de
  servicios de saycusoft).
- **admin.saycusoft.es:** ya integra los servicios de saycusoft. Hay
  que añadir chofocles como un servicio más; activar el flag
  "servicio contratado: chofocles" en la empresa DEMO (que ya existe).


ESTADO ACTUAL
-------------

Bloque 1 (backend) completo. 24 tests pasando.

ESQUEMA BBDD aplicado en `saycudev`:
- `saycu_admin` con prefijo `chofocles_*` + valor `chofocles` en
  ENUM `servicio_tipo`. Migración `db/migrations/0001_admin.sql`.
- `saycu_chofocles_demo` (13 tablas). Migraciones
  `db/migrations/0002_tenant.sql` y `db/migrations/0003_tenant_modelo.sql`.

API NODE.JS — `chofocles/api/`:
- `src/index.js` — Express + helmet + cors + morgan + /health.
- `src/db.js` — pool admin + Map<tenant,pool> con caché.
- `src/secrets.js` — AES-256-GCM (compatible byte-a-byte con
  `ingestor/src/secrets.py` — verificado por roundtrip cruzado).
- `src/auth/` — `tokens.js`, `middleware.js`, `passwords.js`
  (mismas claves env que saycutrans, mismas formas de payload).
- `src/services/transiciones.js` — máquina de estados de viajes y
  paradas; mapea los 8 comandos de voz a transiciones validadas.
- `src/routes/auth.js` — `/api/auth/{login,refresh,logout,me}`.
- `src/routes/viajes.js` — `GET /api/viajes`, `GET /api/viajes/:id`,
  `POST /api/viajes/:id/comando` (con historial de estados).
- `src/routes/incidencias.js` — `GET/POST /api/incidencias`.
- `Dockerfile` (Node 20 alpine, port 3411, healthcheck).
- `package.json` — express, pg, jsonwebtoken, bcryptjs, helmet,
  cors, morgan, dotenv.

INGESTOR PYTHON (sidecar) — `chofocles/ingestor/`:
- `src/main.py` — bucle: por cada empresa con servicio chofocles,
  por cada chofer_buzon activo, polling IMAP, descarga adjuntos,
  llama al extractor, persiste viaje + paradas.
- `src/secrets.py` — AES-GCM compatible con `api/src/secrets.js`.
- `src/db.py` — psycopg2 con caché de conexiones por BBDD.
- `src/imap_client.py` — imaplib stdlib, soporta UID > last_uid_seen
  y filtra adjuntos válidos (PDF, DOCX, JPG, PNG, TIFF).
- `src/extractor.py` — refactor de `importarDatosPdf/extraer.py`
  como librería; `extraer_de_archivo() -> Resultado` con valores
  ya mapeados a campos canónicos.
- `src/persister.py` — `_guardar_binario`, `insertar_documento`,
  `insertar_viaje` (con paradas), updates de buzon `last_uid_seen`.
- `plantillas/` — copia de las 3 plantillas YAML del piloto.
  TODO Fase 2: migrar a BBDD y leerlas de `chofocles_plantillas`.
- `Dockerfile` (Python 3.12 alpine, poppler-utils para pdftotext).

DOCKER COMPOSE — `chofocles/docker-compose.yml`:
- 2 servicios: `api` (Node) + `ingestor` (Python). Ambos comparten
  red privada `chofocles_network` y red externa `system_postgres_net`
  (verificada en saycudev).
- Volumen persistente `chofocles_documentos` para los originales.

PENDIENTE BLOQUE 1:
- Despliegue real en saycudev (build + up + healthcheck OK).
- Migración de plantillas de YAML a BBDD `chofocles_plantillas`
  cuando lleguen las primeras órdenes reales.

BLOQUE 2 (panel web) — esqueleto entregado en `chofocles/panel/`:

- `package.json` — Vite 7 + React 19 + react-router 7, dep
  `saycu-theme` por path relativo (`file:../../../saycu-theme`).
- `vite.config.js` — proxy `/api` → backend en port 3411 (dev).
- `index.html` + `src/main.jsx` con BrowserRouter y `saycu-theme/index.css`.
- `src/App.jsx` — rutas: `/login`, `/viajes`, `/viajes/:id`.
- `src/services/api.js` — cliente HTTP con Bearer + refresh automático
  en 401, login/logout/listarViajes/detalleViaje/aplicarComando.
- `src/context/AuthContext.jsx` — `useAuth()` con login + user state.
- `src/components/Layout.jsx` — header + main según patrón Saycu.
- `src/pages/Login.jsx` — login con campos `empresa`, `usuario`,
  `password` (input nativo, sin componentes que encapsulen estilos).
- `src/pages/ListaViajes.jsx` — listado en cards, badge de estado.
- `src/pages/DetalleViaje.jsx` — cabecera + lista de paradas.
- `src/index.css` — solo armazón (display/layout); colores y
  tipografía DEBEN venir de variables de saycu-theme. Nada de hex.
- `Dockerfile` — Vite build → Caddy 2 alpine.
  TODO build: la dep `saycu-theme` por path relativo NO se resuelve
  desde el contexto Docker actual; el deploy script tendrá que
  vendor-copiar `saycu-theme` a `chofocles/panel/saycu-theme/` antes
  de `docker build`.

PENDIENTE BLOQUE 2 (no entregado en este ciclo, requiere iteración):
- Estilos finales reusando clases reales de saycu-theme (login-page,
  card, badge-estado-*, etc.). El esqueleto usa nombres genéricos
  que casan con saycu-theme pero falta verificación visual real.
- Script de deploy `_scripts/deploy-panel.sh` que copia saycu-theme
  vendored y construye la imagen.
- Páginas adicionales que faltan en MVP: lista/edición de choferes,
  configuración de buzones SMTP/IMAP por chofer, descarga del
  documento original (PDF/DOCX).
- Endpoint admin en API para que oficina vea TODOS los viajes
  (actual `/api/viajes` solo filtra por conductor_id del logado).


BLOQUE 3 — APP MÓVIL (no implementado, planificado solamente)
-------------------------------------------------------------

La app del chofer (carpeta hermana `chofoclesapp/` aún sin crear) es
un proyecto Android nativo con voz, estimado en varios días de
trabajo concentrado. Plan resumido para futuras sesiones:

1. Scaffold Kotlin + Jetpack Compose (mismo patrón que `appIA`).
2. Auth con `/api/auth/login` (mismo endpoint que panel) y
   almacenamiento seguro del refresh token.
3. Pantalla principal con botón grande de voz (rojo/verde) y/o
   palabra de activación "Hola Saycu" (configurable en ajustes,
   decisión 14 del GUION).
4. Stack de voz mixto:
   - STT cloud: OpenAI Whisper API (o Azure Speech) cuando hay
     buena cobertura.
   - TTS cloud: ElevenLabs o Azure TTS, voces en español natural.
   - Fallback a `SpeechRecognizer` y `TextToSpeech` nativos cuando
     la conexión es mala.
   - Capa intermedia que decide motor por interacción (decisión 16).
5. Diálogo conversacional dirigido por estados:
   - Escucha activa → STT → matching contra los 8 comandos
     (con sinónimos "cargado", "ya he cargado", "carga hecha").
   - Confirmación obligatoria por voz antes de cualquier
     transición (decisión 15).
   - Si "crear incidencia" + más de un encargo abierto → la app
     ofrece la lista por voz, el chofer elige número o nombre.
6. Botón equivalente para cada comando, y aprendizaje cruzado
   (decisión 13): cuando se pulsa, la app dice por voz la orden
   equivalente.
7. Llamadas a API: `aplicarComando(viajeId, {comando, lat, lng})`
   y `crearIncidencia(...)`.
8. Build APK + subida a `/var/opt/chofocles/downloads/` (regla
   ARTEFACTOS DE COMPILACIÓN del CLAUDE.md de saycu).


DECISIONES DE DISEÑO — CONFIRMADAS
----------------------------------

1. **Sub-servicio de superapitrans**, no proyecto independiente.
   Carpeta: `saycu/superapitrans/chofocles/`. Comparte servidor y stack
   Docker con el resto de superapitrans; comparte convenciones (JWT,
   multi-tenant, saycu-theme) con saycutrans (origen del diseño).
   Decisión 2026-05-01: chofocles se trasladó de `saycu/saycutrans/` a
   `saycu/superapitrans/` para que viva junto al resto de servicios API
   bajo un dominio común.

2. **BBDD independiente por tenant: `saycu_chofocles_<CODIGO>`.**
   chofocles es un producto nuevo, no una extensión de saycutrans.
   Cada empresa-tenant tiene su propia BBDD del producto chofocles
   (p. ej. `saycu_chofocles_demo`), separada de la BBDD que esa misma
   empresa pueda tener en saycutrans. Cero JOIN entre productos:
   "no mezclar tablas" (regla del usuario, abril 2026). Patrón Saycu
   coherente: una BD por empresa **dentro de cada producto**.

   `saycu_admin` sigue siendo el catálogo maestro compartido entre
   todos los productos: allí viven la lista de empresas, el catálogo
   de plantillas de operadores logísticos para chofocles, y el
   flag "servicio contratado: chofocles" por empresa. Las tablas
   nuevas en admin van con prefijo `chofocles_*` para identificar
   a qué producto pertenecen.

3. **Catálogo de plantillas de operadores logísticos**: compartido
   entre tenants. Las plantillas viven en `saycu_admin`. Una plantilla
   reconoce a un operador logístico (Jasaro, Saycusoft, Logicer,
   etc.); si Jasaro envía órdenes a 5 empresas de transporte
   distintas, todas se benefician de la misma plantilla.

4. **Buzón por chofer:** cada chofer tiene su propio buzón (SMTP+IMAP)
   con su usuario y contraseña. Por defecto, los buzones que se
   "regalan" al alta apuntan al servidor de correo de saycutrans
   (`xxx@saycutrans.es` u otro alias). Si el chofer trae su buzón
   propio, se almacena su SMTP/IMAP/credenciales en la ficha. El
   provisionamiento del buzón en sí lo hace Llor manualmente en el
   servidor de correo (no es parte de chofocles).

5. **Multi-tenant**: empresa de transporte = tenant de saycutrans. El
   primer tenant productivo será DEMO (empresa que ya existe en
   admin.saycusoft.es).

6. **App móvil del chofer (MVP):** lectura + dictado por voz para
   cambios de estado del encargo (ver sección "ÓRDENES PRIMARIAS DE
   VOZ"). Histórico de estados completo. La tabla de estados queda
   preparada para que otros procesos (a3erp, envío de albaranes, etc.)
   actúen sobre ella de forma independiente más adelante.

7. **Detección automática dev/prod** vía `/etc/hosts` y `.env`, igual
   que saycutrans.

8. **Diseño visual:** OBLIGATORIO usar el sistema de temas y las
   clases ya existentes de saycutrans/admin.saycusoft.es. Cero
   diseños nuevos. Cero clases con parámetros que no existen ya.
   (Regla "COHERENCIA DE DISEÑO ★ INVIOLABLE" del CLAUDE.md global.)

9. **Catálogo de plantillas: en `saycu_admin`.** Igual que el catálogo
   maestro de empresas, las plantillas que reconocen a un operador
   logístico (Jasaro, Logicer, Saycusoft…) son compartidas entre
   todos los tenants y viven en `saycu_admin`.

10. **Subdominios — gestionados por superapitrans.** Tras la mudanza
    a `saycu/superapitrans/`, los subdominios públicos de chofocles
    pasan a depender del dominio base de superapitrans (variable
    `BASE_DOMAIN`, definida en GUION.md y CLAUDE.md de superapitrans).
    Inicialmente `superapi.eoden.es`; cuando se decida el dominio
    definitivo, se cambiará en un único sitio. La app móvil va en
    carpeta hermana `chofoclesapp/` dentro de `saycu/superapitrans/`.

11. **App móvil del chofer: APK nueva e independiente.** No es una
    pestaña dentro de la app de saycutrans. Es una app simple, con
    voz, descarga aparte. Razón: chofocles es un servicio
    independiente y modificar la app de saycutrans para meterle
    nuestra UI introduce riesgo. Cuando esté terminada la nueva, se
    estudiará si conviene unificar.

12bis. **Modelo de datos del tenant: separación viajes/paradas igual que
    saycutrans.** Tablas `viajes` (cabecera) + `viajes_paradas`
    (paradas tipo carga/descarga con dirección completa, fechas,
    contacto). El motor de extracción rellena ambas. Saycutrans lo
    decidió así por algo (datos por parada son ricos), reutilizamos
    el patrón. `precio` se añade SOLO en chofocles, sin tocar
    saycutrans.

12. **Polling IMAP: cron + poll cada 1-3 min para TODOS los buzones.**
    Webhook descartado porque no aplica a buzones externos
    (Gmail, Outlook, etc.) que el chofer pueda traer; solo cubriría
    los que estén en `saycumail`, con lo que tendríamos que mantener
    dos vías. Una sola vía (IMAP poll) cubre cualquier proveedor con
    latencia 1-3 min, asumible. Si algún día se necesita "al
    instante" para los buzones de `saycumail`, se añade webhook como
    optimización complementaria, sin sustituir el poll.

Servidor de correo (`saycumail`): Postfix + Dovecot sobre Debian
(verificado por SSH 2026-04-30).


APP MÓVIL DEL CHOFER — DECISIONES DE VOZ Y UX
----------------------------------------------

La app es **dual: voz Y táctil al 100%**. Todo lo que se hace por voz se
puede hacer pulsando un botón, y al revés.

13. **Aprendizaje cruzado voz↔táctil.** Cada vez que el chofer pulsa
    un botón, la app dice por voz la orden equivalente que habría
    servido para hacer lo mismo hablando ("estás marcando 'cargado',
    podías haber dicho 'cargado'"). Configurable: el chofer puede
    desactivar este aprendizaje desde ajustes.

14. **Activación de voz — modos seleccionables por el chofer.** En
    ajustes, el chofer elige uno de los dos:
    - **a. Botón grande visible** rojo/verde en la pantalla principal
      (rojo = micro apagado, verde = escuchando). Pulsa para activar
      / pulsa para apagar.
    - **b. Palabra de activación** (`"Hola Saycu"`) — el micro escucha
      en segundo plano la palabra y se activa al detectarla.
    Ambos modos disponibles y configurables; nada de imponer uno.

15. **Confirmación obligatoria antes de cualquier cambio de estado.**
    Tanto si la acción se dispara por voz como por toque, la app
    repite por voz lo que va a hacer ("Voy a marcar 'cargado' en el
    encargo 2, ¿confirmas?") y espera respuesta afirmativa antes de
    persistirlo. Sin excepciones, porque los estados disparan
    procesos posteriores (avisos, facturación, etc.) y son caros de
    deshacer.

16. **Stack de voz: mixto nativo + cloud (opción C).** STT y TTS
    cloud (alta calidad) cuando hay buena cobertura; fallback al
    motor nativo de Android cuando la conexión es mala. Decisión por
    cada interacción: medir latencia / disponibilidad y elegir.
    Implica más coste de ingeniería que cloud-only o nativo-only,
    pero garantiza funcionamiento en cabina con cobertura
    intermitente. Proveedor cloud: a decidir (candidatos: OpenAI
    Whisper para STT, ElevenLabs o Azure para TTS).


ÓRDENES PRIMARIAS DE VOZ — CONJUNTO INICIAL
-------------------------------------------

Cada orden dispara una transición de estado del encargo. Cada estado
queda registrado en `chofocles_orden_estados`.

| # | Orden hablada (canónica)        | Transición de estado                  |
|---|----------------------------------|---------------------------------------|
| 1 | "Aceptar encargo"                | pendiente → aceptado                  |
| 2 | "En camino"                      | aceptado → en_ruta_carga              |
| 3 | "He llegado a carga"             | en_ruta_carga → en_carga              |
| 4 | "Cargado"                        | en_carga → en_ruta_destino_X          |
| 5 | "He llegado a destino"           | en_ruta_destino_X → en_descarga_X     |
| 6 | "Descargado"                     | en_descarga_X → siguiente o terminado |
| 7 | "Terminar encargo"               | en_descarga_último → terminado        |
| 8 | "Crear incidencia"               | abre diálogo de incidencia            |

Multi-zona / multi-destino: las órdenes 3-6 se aplican por zona o por
destino; el sistema lleva un contador interno (zona actual, destino
actual) y la app dice por voz a cuál se refiere ("voy a marcar cargado
en la 1ª zona de carga, ¿confirmas?").

Diálogo de incidencia: cuando el chofer dice "crear incidencia", si
tiene más de un encargo abierto la app le ofrece la lista por voz
("encargo 1: carga LANJARON; encargo 2: forfait Albacete; ¿cuál?"),
él contesta el número o el nombre, y dicta el texto de la incidencia.
Se guarda en `chofocles_incidencias` (a diseñar en el bloque SQL
correspondiente).

Cada orden de voz tendrá **sinónimos** ("cargado" = "ya he cargado" =
"carga hecha") en una tabla de mapeo voz→acción para tolerancia a la
forma de hablar. Pendiente de diseño.


ALCANCE FUNCIONAL — FASE 1 (MVP)
---------------------------------

1. Recepción de email con adjunto (PDF / DOCX / imagen) en el buzón
   del chofer. Polling IMAP por cada chofer dado de alta.
2. Detección de qué operador logístico ha emitido la orden (CIF +
   nombre) usando el catálogo de plantillas de `saycu_admin`.
3. Extracción de los campos clave: cliente (operador logístico),
   CIF, matrícula tractora, matrícula remolque, carga (origen
   completo: fábrica + dirección + CP + provincia), descarga (destino
   completo), mercancía, precio, email de contacto, teléfono.
4. Persistencia en BBDD del tenant (`saycu_chofocles_<CODIGO>`):
   - `chofocles_choferes` (datos del chofer + credenciales SMTP/IMAP).
   - `chofocles_ordenes` (1 fila por orden extraída).
   - `chofocles_orden_estados` (histórico de estados por orden).
   - `chofocles_documentos` (PDF/DOCX/imagen original guardado en
     disco; ruta en BD).
   - `chofocles_incidencias` (1 fila por incidencia dictada).
5. Web propia del servicio (panel del cliente):
   - Listado de órdenes recientes.
   - Detalle de una orden con descarga del original.
   - Listado de choferes y configuración de buzones.
6. App móvil (Android nativa, mismo patrón que appIA):
   - Login.
   - Listado de órdenes asignadas al chofer.
   - Detalle de orden + histórico de estados.
   - Diálogo por voz para cambios de estado e incidencias.
7. Integración en admin.saycusoft.es: aparece chofocles como
   servicio de la empresa DEMO; clic en "entrar" → web del cliente.


FUERA DEL ALCANCE EN MVP (futuras fases)
-----------------------------------------

- Subida de albarán o CMR firmado desde la app.
- Notificaciones push.
- Integración con a3erp.
- Envío automático de albaranes por email.
- OCR para PDFs escaneados.
- Editor visual de plantillas en la web.

Estos procesos se diseñarán como módulos independientes que leen de
las tablas de chofocles, no como features bloqueantes del MVP.


ESTADO ACTUAL (2026-05-01, ronda IA)
-------------------------------------

Backend chofocles operativo en saycudev y saycu (prod):

- ✅ Migración `0004_admin_ia.sql` aplicada en `saycu_admin` (dev y prod).
  Crea `chofocles_plantillas_json` (plantillas en JSON, generables por
  IA), `chofocles_operadores_config` (timeout/modo por proveedor),
  `chofocles_chofer_operador` (relación chofer↔procedencia).
- ✅ `chofocles_api` corriendo en ambos entornos. `/chofocles/health`
  OK por system-caddy en
  `https://api.superapi.eoden.es/chofocles/health` y dev.
- ✅ `chofocles_ingestor` corriendo en bucle de 120s. Carga las 3
  plantillas YAML legacy + 0 plantillas BD (todavía sin documentos
  reales que disparen la generación IA).
- ✅ Servicio `chofocles` activado en empresa DEMO (dev y prod), tanto
  en `empresas.servicios` (array) como en `empresas_servicios.servicios`
  (jsonb).
- ✅ Permisos del usuario `saycutrans` (con el que conecta el ingestor)
  en `saycu_admin` y en las tres BDs tenant `saycu_chofocles_*` —
  GRANT en tablas + sequences + DEFAULT PRIVILEGES.

Pipeline integrado (el flujo completo está listo, falta tráfico real):

1. **Recepción email** → IMAP per-chofer (modelo actual; el modelo
   centralizado `mail.saycusoft.es` con buzón único `*@chofocles.es`
   está pendiente de cableado físico — DNS y servidor existen).
2. **Match plantilla local** (extractor.py + 3 YAML + N de BD).
3. **Si ningún match → IA Claude** (`api/src/ai_client.py`, modelo
   `claude-opus-4-7`):
   - Doble extracción interna (Método A regex / Método B contexto).
   - Si ambos coinciden en campos críticos → la plantilla queda
     persistida en `chofocles_plantillas_json` para reutilizarse, y
     el documento procesa con esos valores.
   - Si difieren o falla parsing → ticket urgente.
4. **Persistencia** en `chofocles.viajes/paradas` (tenant) +
   sincronización a `pasarela.pedidos/paradas` (tabla canónica).
5. **Si proceso revienta o IA no tiene certeza** → POST automático a
   `https://admin.saycusoft.es/api/tickets` (con `X-Service-Key`)
   abriendo ticket urgente. Email automático a `llor@llor.net`.

Variables nuevas en `.env-{dev,prod}.example`:

- `POLL_INTERVAL_SECONDS` (defecto 120).
- `ANTHROPIC_API_KEY` (CAMBIAR al recibir clave real).
- `CHOFOCLES_AI_MODEL`, `CHOFOCLES_AI_MAX_TOKENS`.
- `TICKETS_API_URL` y `TICKETS_SERVICE_KEY` (provisionados con la
  clave real del admin api en cada servidor).

Dependencias nuevas: `anthropic==0.39.0` en `requirements.txt`.


TODO PENDIENTE
--------------

Para que el flujo se dispare con tráfico real:

- [ ] Insertar `ANTHROPIC_API_KEY` real en
      `/var/opt/superapitrans/chofocles/.env` de saycudev y saycu.
      `docker compose up -d --force-recreate ingestor` para recargar.
- [ ] Migrar a buzones centralizados en `mail.saycusoft.es`:
      - Crear los buzones `<chofer>@chofocles.es` en el servidor.
      - Refactorizar `imap_client.py` para conectarse a un único IMAP
        central y enrutar por la cabecera `To:` al chofer destinatario.
      - Eliminar progresivamente la dependencia de credenciales por
        chofer en `chofer_buzones`.
- [ ] Insertar al menos un proveedor en `chofocles_operadores_config`
      cuando lleguen los primeros documentos reales (timeout/modo).
- [ ] Reasignación dentro de empresa multi-chofer: añadir tabla de
      orden + tiempos por jefe + cron que respete vacaciones.

Para más adelante (ya documentado en GUION superapitrans):

- [ ] App móvil chofocles (Capacitor + Ionic React) con voz para
      cambios de estado e interruptores de pasos en config.
      DESHABILITADO el envío de notificaciones a la app por orden
      del usuario (2026-05-01).
- [ ] Facturación automática (aparcada por el usuario hasta tener
      documentos reales y conocer cómo facturan los choferes).
- [ ] Editor visual de plantillas en el panel.
- [ ] Servicio Python de polling IMAP + extractor (reutiliza
      `importarDatosPdf/extraer.py` como módulo).
- [ ] Integración en admin.saycusoft.es: tile + valor `chofocles` en
      el ENUM `servicio_tipo` y asignación a la empresa DEMO.


PROBLEMAS RESUELTOS
-------------------

(vacío de momento)


VISIÓN COMPLETA DEL SISTEMA — FUENTE DE VERDAD (2026-05-01)
============================================================

Esta sección es la especificación maestra del sistema, dictada por el
usuario el 2026-05-01. Cualquier diseño/implementación posterior se
contrasta contra esta sección. Si surge una duda y esta sección es
ambigua → preguntar al usuario, no inventar.

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
