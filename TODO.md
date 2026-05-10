# superapitrans — pendientes

## chofocles

- [ ] **Persistir los 3 viajes IA validados** en `saycu_chofocles_demo` dev (HERCOTRANS, GLOBAL FEED ECOTRANS, LOGICER) con `--persistir` desde `ingestor/scripts/probar_pdf.py`. Crea documento + plantilla en `chofocles_plantillas_json` + viaje, y los verás en la app móvil del chofer llor.
- [ ] **Arreglar las 3 plantillas YAML del piloto** (jasaro, navarromonton, saycusoft): los regex actuales extraen "Fecha: 30/04/2026 Hora:" como `origen_municipio`. Opciones: regenerarlas con la IA, o sustituirlas por nuevas plantillas IA cuando un email vuelva a llegar.
- [ ] **Probar la app móvil** con TEST-0001 y TEST-0002 (ya sembrados): comandos de voz, GPS, cambio de estados, `/auth/device-token`, `/auth/mis-pasos`.
- [ ] **App móvil**: implementar push notifications cuando se contrate Firebase. La función `PushNotifications.register()` está comentada en `chofoclesapp/src/lib/push.ts`.
- [ ] **Imágenes a IA**: cuando el ingestor soporte JPG/PNG/HEIC, redimensionar en cliente a máx 1080 px lado largo (JPEG ~85) antes de la llamada Claude. Memoria: `feedback_resize_imgs_ia.md`.

## pasarela — Satelles (Ecotrans)

- [ ] **Cliente OAuth2** con caché de token: POST a `https://ecotrans.satelles.es/identity/connect/token` con `client_id`, `client_secret`, `scope=satelles-erpsync:write satelles-publications:finished-routes`.
- [ ] **Polling de rutas finalizadas**: GET `https://ecotrans.satelles.es/puba/routes/finished` cada `SATELLES_POLL_INTERVAL_SECONDS` (config).
- [ ] **Mapeo `route → tablas canónicas`**: viajes, paradas (destinations), eventos GPS (events), jornadas (legs), trips. Estructura en `documentos/satelles/Rutas.json`.
- [ ] **Commit** a `https://ecotrans.satelles.es/puba/routes/finished/commit` solo si el insert/upsert canónico ha sido exitoso.
- [ ] **Credenciales en `pasarela/.env-dev` y `.env-prod`** (servidores), nunca al repo: `SATELLES_OAUTH_URL`, `SATELLES_CLIENT_ID`, `SATELLES_CLIENT_SECRET`, `SATELLES_SCOPE`, `SATELLES_API_BASE`, `SATELLES_POLL_INTERVAL_SECONDS`.

## pasarela — PCS valenciaportPCS (Jasaro)

Lista oficial de mensajes confirmada por Arantxa Nebot (PCS, 4 may 13:34) para
Jasaro, perfil "transportista":
- **ENVÍA**: `InlandTransportDetails` (asignación datos de transporte).
- **RECIBE**: `DUT` (instrucciones + órdenes — actualizaciones), `ReleaseOrder`,
  `AcceptanceOrder`, `Acknowledgment`, `AcceptanceConfirmation`,
  `ReleaseConfirmation`.

- [ ] **Cliente PCS REST** en pasarela: OAuth + módulos de mensajería. Swagger TEST: `https://testapi.valenciaportpcs.net/messaging/swagger`. PROD: `https://api.valenciaportpcs.net/messaging/swagger`.
- [ ] **Mapeo TRANS → tablas canónicas pasarela**: `ReleaseOrder` / `AcceptanceOrder` / `DUT` llegan al sistema → generan documento + viaje + parada en terminal del puerto, asignados al chofer correspondiente. `InlandTransportDetails` lo emitimos cuando un chofer comunique matrícula/hora.
- [ ] **Credenciales en `pasarela/.env-dev` y `.env-prod`**: `PCS_VLC_USER_TEST`, `PCS_VLC_PASS_TEST`, `PCS_VLC_USER_PROD`, `PCS_VLC_PASS_PROD`, `PCS_VLC_OAUTH_TEST`, `PCS_VLC_OAUTH_PROD`, `PCS_VLC_API_TEST`, `PCS_VLC_API_PROD`.

## infra

- [ ] **system-caddy bloque pasarela** dev y prod: rutas `/satelles` y `/pcs-vlc` (o estructura que decidamos) en `api.${BASE_DOMAIN_SUPERAPI}` y `dev-api.${BASE_DOMAIN_SUPERAPI}` cuando el contenedor de pasarela esté en marcha.
- [ ] **Monitorización Saycu**: añadir entradas a `monitoring.conf.example` (REQUIRED_CONTAINERS, ACCESS_URLS, HEALTH_URLS) cuando despleguemos pasarela.
