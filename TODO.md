# superapitrans — pendientes

## chofocles

- [ ] **Persistir los 3 viajes IA validados** en `saycu_chofocles_demo` dev (HERCOTRANS, GLOBAL FEED ECOTRANS, LOGICER) con `--persistir` desde `ingestor/scripts/probar_pdf.py`. Crea documento + plantilla en `chofocles_plantillas_json` + viaje, y los verás en la app móvil del chofer llor.
- [ ] **Arreglar las 3 plantillas YAML del piloto** (jasaro, navarromonton, saycusoft): los regex actuales extraen "Fecha: 30/04/2026 Hora:" como `origen_municipio`. Opciones: regenerarlas con la IA, o sustituirlas por nuevas plantillas IA cuando un email vuelva a llegar.
- [ ] **Probar la app móvil** con TEST-0001 y TEST-0002 (ya sembrados): comandos de voz, GPS, cambio de estados, `/auth/device-token`, `/auth/mis-pasos`.
- [ ] **App móvil**: implementar push notifications cuando se contrate Firebase. La función `PushNotifications.register()` está comentada en `chofoclesapp/src/lib/push.ts`.
- [ ] **Imágenes a IA**: cuando el ingestor soporte JPG/PNG/HEIC, redimensionar en cliente a máx 1080 px lado largo (JPEG ~85) antes de la llamada Claude. Memoria: `feedback_resize_imgs_ia.md`.

## pasarela — Satelles ✅ OPERATIVO EN PROD (2026-05-10)

- [x] Cliente OAuth2 con caché de token (`pasarela/api/src/proveedores/satelles/client.js`).
- [x] Polling de rutas finalizadas via cron `*/5 * * * *` (`pasarela/api/src/cron.js`).
- [x] Mapeo `route → tablas canónicas` pedidos/albaranes/paradas (`pasarela/api/src/proveedores/satelles/mapper.js`).
- [x] Commit a `/puba/routes/finished/commit` solo si insert/upsert OK.
- [x] Credenciales cifradas en BD `saycu_admin.pasarela_proveedores_credenciales` (no en .env). Se gestionan por la UI admin → ficha empresa → "Proveedores de datos".

Estado: cron activo `*/5` con `PASARELA_DRY_RUN=false` en prod. Tests automatizados 17/17 OK en dev y prod.

## pasarela — PCS valenciaportPCS — BLOQUEADO POR PROVEEDOR

Lista oficial de mensajes confirmada por el proveedor para perfil
"transportista":
- **ENVÍA**: `InlandTransportDetails` (asignación datos de transporte).
- **RECIBE**: `DUT` (instrucciones + órdenes — actualizaciones), `ReleaseOrder`,
  `AcceptanceOrder`, `Acknowledgment`, `AcceptanceConfirmation`,
  `ReleaseConfirmation`.

Bloqueo externo (informe enviado al proveedor PCS el 2026-05-08 con las 4
pruebas literales SOAP+REST en TEST y PROD): el usuario solo entra al portal
SOAP en PROD (`login.asmx`); el OAuth REST devuelve `invalid_client / you do
not have access`; ni SOAP ni REST permiten invocar el servicio de mensajería
porque al usuario no le han asignado los roles efectivos del servicio MESSG.
Detalle completo en `pasarela/GUION.md` sección "EN ESPERA".

Cuando PCS emita un par OAuth `client_id`/`client_secret` y le asigne los
permisos al usuario:

- [ ] **Migración 0008** cambiando descriptor del proveedor `pcs-valencia` de `[user, pass, oauth_url, api_base]` a `[client_id, client_secret, token_url, api_base]`.
- [ ] **Cliente PCS REST** completo (OAuth + 6 mensajes inbound + 1 outbound). Stub actual en `pasarela/api/src/proveedores/pcs-valencia/{client,mapper,sync}.js` lanza `Error('pcs-valencia: pendiente swagger + credenciales')`.
- [ ] **Mapeo TRANS → tablas canónicas pasarela**: `ReleaseOrder` / `AcceptanceOrder` / `DUT` → documento + viaje + parada en terminal del puerto. `InlandTransportDetails` lo emitimos cuando un chofer comunique matrícula/hora.
- [ ] **Credenciales** se cargan por la UI admin (mismo flujo que Satelles), una vez tengamos el par OAuth real.
- [ ] **Tests automatizados** del cliente PCS Valencia con el mismo patrón que los de `tests/api.test.js` (regla operativa: código + test + manual `ApiDocsPasarela.jsx` se mantienen en sincronía).

## infra ✅ HECHO

- [x] **system-caddy bloque pasarela**: ya enrutado en dev (`https://dev-api.superapi.eoden.es/pasarela/*`) y prod (`https://api.superapi.eoden.es/pasarela/*`) con rewrite `handle_path /pasarela/* { rewrite * /api{path} }`. Las sub-rutas internas (Satelles, PCS Valencia futura) las maneja Express dentro del propio pasarela_api.
- [x] **Monitorización Saycu**: `pasarela_api` ya en `REQUIRED_CONTAINERS` y `https://[dev-]api.superapi.eoden.es/pasarela/health` en `HEALTH_URLS` (`admin.saycusoft.es/_scripts/monitoring/monitoring.conf.example`).
