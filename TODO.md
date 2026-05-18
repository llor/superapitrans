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

## pasarela — PCS valenciaportPCS ✅ OPERATIVO EN PROD (2026-05-18)

Estado real (verificado 2026-05-18 en BD prod, no en el README que estaba
obsoleto):
- Cliente OAuth + descarga implementado en `pasarela/api/src/proveedores/pcs-valencia/{client,mapper,sync}.js` (no es stub).
- `saycu_pasarela_jsr` en prod tiene **1001 pedidos** con `proveedor_codigo='pcs-valencia'` ya sincronizados.
- Cron `*/5` los persiste vía `listMessages → downloadMessage → mapMessage → upsert pedido/albaranes/paradas/pedidos_pcs_extra`.
- Idempotencia por unique `(proveedor_codigo, proveedor_publication_id)`.

PENDIENTE / RIESGOS:

- [ ] **🔴 PUNTO 6 — ACK PCS Valencia (no acumular repetidos)**. Comentario en `pasarela/api/src/proveedores/pcs-valencia/sync.js:8-11`: «el GET no consume el mensaje y la idempotencia evita duplicados». Resultado: cada vuelta del cron probablemente trae los mismos 1001 mensajes y reescribe filas. Implementar `Acknowledgement` outbound: `POST {api_base}/messages/upload/{box}` con el XML de Ack. Requiere XSD/cuerpo confirmado por PCS. `uploadMessage()` ya existe en `client.js`, solo falta el cuerpo correcto. Cuando funcione, llamar tras cada UPSERT OK y NO antes (idempotencia mantenida si el ack falla).
- [ ] **Outbound `InlandTransportDetailsv2`**: `uploadMessage()` listo, falta disparador desde flujo del chofer (matrícula/hora reales).
- [ ] **Tests automatizados** del cliente PCS Valencia con el mismo patrón que los de `tests/api.test.js`.

## infra ✅ HECHO

- [x] **system-caddy bloque pasarela**: ya enrutado en dev (`https://dev-api.superapi.eoden.es/pasarela/*`) y prod (`https://api.superapi.eoden.es/pasarela/*`) con rewrite `handle_path /pasarela/* { rewrite * /api{path} }`. Las sub-rutas internas (Satelles, PCS Valencia futura) las maneja Express dentro del propio pasarela_api.
- [x] **Monitorización Saycu**: `pasarela_api` ya en `REQUIRED_CONTAINERS` y `https://[dev-]api.superapi.eoden.es/pasarela/health` en `HEALTH_URLS` (`admin.saycusoft.es/_scripts/monitoring/monitoring.conf.example`).
