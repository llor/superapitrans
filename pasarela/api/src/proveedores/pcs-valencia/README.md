# pcs-valencia — cliente PCS ValenciaportPCS

**Estado: ESQUELETO — pendiente de implementación.**

Sin acceso al swagger TEST/PROD (requiere usuario logueado) y sin
credenciales reales guardadas en BD, no se ha programado el cliente
operativo.

Lo que ya está hecho:

- Alta del proveedor `pcs-valencia` en `saycu_admin.pasarela_proveedores`
  (migración `0006_admin_pcs_valencia.sql`) con descriptor de campos:
  `user`, `pass`, `oauth_url`, `api_base`.
- Stubs en este directorio (`client.js`, `mapper.js`, `sync.js`) que
  reproducen la estructura del cliente de Satelles, sin lógica HTTP
  real. Lanzan `Error('pcs-valencia: pendiente swagger + credenciales')`
  hasta que se complete.

Pasos pendientes para activarlo:

1. Acceder al swagger autenticado:
   - TEST: `https://testapi.valenciaportpcs.net/messaging/swagger`
   - PROD: `https://api.valenciaportpcs.net/messaging/swagger`
   y descargar la spec OpenAPI (URL exacta de OAuth, endpoints de cada
   mensaje, modelos JSON).
2. Completar `client.js`: OAuth (probable client_credentials) usando
   `oauth_url` + `user`/`pass` del cred descifrado. Cache de token igual
   que satelles.
3. Completar `mapper.js` con los 6 mensajes que aplican al perfil
   "transportista" de Jasaro:
   - **Inbound (recibimos)**: `DUT`, `ReleaseOrder`, `AcceptanceOrder`,
     `Acknowledgment`, `AcceptanceConfirmation`, `ReleaseConfirmation`
     → mapear a `pedidos`/`paradas` en `saycu_pasarela_<empresa>`.
   - **Outbound (enviamos)**: `InlandTransportDetails` cuando un chofer
     comunique matrícula/hora — disparado por evento, no por cron.
4. Completar `sync.js`: polling de mensajes pendientes inbound +
   confirmación tras persistir, igual que el patrón de satelles.
5. Conectar `cron.js` para llamar a `pcs-valencia.syncAll()` además de
   `satelles.syncAll()`.
6. (Sólo si se expone webhook con sub-dominio propio) Añadir bloque al
   `system-caddy`. El bloque actual `/pasarela/*` ya cubre cualquier
   sub-ruta interna del `pasarela_api`, así que para webhooks tipo
   `/pasarela/pcs-vlc/...` no hay que tocar Caddy.

Documentación de referencia local:

- `superapitrans/documentos/puerto-valencia/pcs11-mbase004__manual-de-uso-del-servicio-de-mensajeria.pdf`
  (manual general; cubre la API SOAP antigua y la REST nueva. Solo nos
  interesa la REST).
