-- =========================================================================
-- pasarela — Migración 0006 — Alta proveedor PCS ValenciaportPCS
-- =========================================================================
-- BBDD destino: saycu_admin.
--
-- Da de alta el proveedor PCS ValenciaportPCS (mensajería del puerto de
-- Valencia, API REST). Cliente HTTP en `api/src/proveedores/pcs-valencia/`.
-- El descriptor `campos_credenciales` se basa en los nombres de variables
-- del TODO oficial (TODO de superapitrans, sección "pasarela — PCS
-- valenciaportPCS (Jasaro)"): user, pass, oauth_url, api_base.
--
-- host_base se deja en el dominio TEST por defecto; el `api_base` real lo
-- pondrá el operador en la credencial al guardar (uno por entorno
-- sandbox/prod).
-- =========================================================================

BEGIN;

INSERT INTO pasarela_proveedores
    (codigo, nombre, host_base, api_version, descripcion, campos_credenciales)
VALUES (
    'pcs-valencia',
    'PCS ValenciaportPCS',
    'https://api.valenciaportpcs.net',
    '1.0',
    'Mensajería de la Autoridad Portuaria de Valencia (API REST). Perfil transportista (Jasaro): envía InlandTransportDetails; recibe DUT, ReleaseOrder, AcceptanceOrder, Acknowledgment, AcceptanceConfirmation, ReleaseConfirmation. Swagger TEST: https://testapi.valenciaportpcs.net/messaging/swagger · PROD: https://api.valenciaportpcs.net/messaging/swagger (acceso autenticado).',
    '[
        {"clave":"user",       "label":"Usuario",          "secreto":false, "ayuda":"Usuario de mensajería en valenciaportpcs.net asignado al perfil del cliente."},
        {"clave":"pass",       "label":"Contraseña",       "secreto":true,  "ayuda":"Contraseña del usuario de mensajería. No se mostrará tras guardar."},
        {"clave":"oauth_url",  "label":"URL OAuth",        "secreto":false, "ayuda":"Endpoint del servicio OAuth para obtener token. Confirmar con el manual antes de pegar."},
        {"clave":"api_base",   "label":"URL base API",     "secreto":false, "ayuda":"URL base del API REST de mensajería. TEST: https://testapi.valenciaportpcs.net/messaging  ·  PROD: https://api.valenciaportpcs.net/messaging."}
    ]'::jsonb
)
ON CONFLICT (codigo) DO UPDATE SET
    nombre              = EXCLUDED.nombre,
    host_base           = EXCLUDED.host_base,
    api_version         = EXCLUDED.api_version,
    descripcion         = EXCLUDED.descripcion,
    campos_credenciales = EXCLUDED.campos_credenciales,
    updated_at          = NOW();

COMMIT;
