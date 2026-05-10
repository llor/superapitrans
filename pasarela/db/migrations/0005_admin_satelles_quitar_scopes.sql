-- =========================================================================
-- pasarela — Migración 0005 — Quitar 'scopes' del descriptor de Satelles
-- =========================================================================
-- BBDD destino: saycu_admin.
--
-- Los scopes OAuth de Satelles (satelles-erpsync:write,
-- satelles-publications:finished-routes) son fijos según el manual del
-- proveedor — no varían por empresa. El cliente HTTP los pondrá
-- hardcoded cuando se programe el sync. La UI de la empresa solo debe
-- pedir lo que cambia por cliente: client_id y client_secret.
-- =========================================================================

BEGIN;

UPDATE pasarela_proveedores
   SET campos_credenciales = '[
        {"clave":"client_id",     "label":"Client ID",     "secreto":false, "ayuda":"Identificador OAuth 2.0 entregado por el integrador."},
        {"clave":"client_secret", "label":"Client Secret", "secreto":true,  "ayuda":"Secreto OAuth 2.0 entregado por el integrador. No se mostrará tras guardar."}
       ]'::jsonb,
       updated_at = NOW()
 WHERE codigo = 'satelles';

COMMIT;
