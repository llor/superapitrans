-- =========================================================================
-- pasarela — Migración 0008 — Descriptor OAuth para PCS Valencia
-- =========================================================================
-- BBDD destino: saycu_admin.
--
-- Cambia campos_credenciales del proveedor 'pcs-valencia' de
-- [user, pass, oauth_url, api_base] a [client_id, client_secret,
-- token_url, api_base]. El acceso real al servicio REST se hace por
-- OAuth2 client_credentials (confirmado contra PROD el 2026-05-12):
--   POST {token_url}  body=grant_type=client_credentials,
--                     client_id=<...>, client_secret=<...>
--   GET  {api_base}/messages/download/{box}     listado pendiente
--   GET  {api_base}/messages/download/{box}/{id}  XML del mensaje
--   POST {api_base}/messages/upload/{box}        outbound
-- =========================================================================

BEGIN;

UPDATE pasarela_proveedores SET
    descripcion         = 'Mensajería de la Autoridad Portuaria de Valencia (API REST). Perfil transportista: envía InlandTransportDetails; recibe DUT, ReleaseOrder, AcceptanceOrder, Acknowledgement, AcceptanceConfirmation, ReleaseConfirmation. Acceso OAuth2 client_credentials. Swagger PROD (sin auth): https://api.valenciaportpcs.net/messaging/swagger/v1/swagger.json',
    campos_credenciales = '[
        {"clave":"client_id",     "label":"Client ID",        "secreto":false, "ayuda":"Identificador OAuth del cliente (no es el usuario humano del portal). En PROD suele ser messaging.<ORG>."},
        {"clave":"client_secret", "label":"Client Secret",    "secreto":true,  "ayuda":"Secreto OAuth. No se mostrará tras guardar."},
        {"clave":"token_url",     "label":"URL OAuth token",  "secreto":false, "ayuda":"Endpoint OAuth para obtener Bearer. PROD: https://www.valenciaportpcs.net/oauth/connect/token  ·  TEST: https://test.valenciaportpcs.net/oauth/connect/token"},
        {"clave":"api_base",      "label":"URL base mensajería", "secreto":false, "ayuda":"URL base del API REST de mensajería. PROD: https://api.valenciaportpcs.net/messaging  ·  TEST: https://testapi.valenciaportpcs.net/messaging"}
    ]'::jsonb,
    updated_at          = NOW()
WHERE codigo = 'pcs-valencia';

COMMIT;
