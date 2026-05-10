/**
 * Acceso a las credenciales cifradas de un proveedor para una empresa.
 * Devuelve el blob ya descifrado (objeto JSON).
 */

const { getAdminPool } = require('../db');
const { descifrarJson, cifrarJson } = require('../secrets');

async function getCredencial({ empresaId, proveedorCodigo, entorno = 'prod' }) {
    const { rows } = await getAdminPool().query(
        `SELECT c.id, c.entorno, c.credencial_cifrada, c.activo,
                p.codigo AS proveedor_codigo, p.host_base, p.api_version
         FROM pasarela_proveedores_credenciales c
         JOIN pasarela_proveedores p ON p.id = c.proveedor_id
         WHERE c.empresa_id = $1 AND p.codigo = $2 AND c.entorno = $3
         LIMIT 1`,
        [empresaId, proveedorCodigo, entorno]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!row.activo) return null;
    const decoded = descifrarJson(row.credencial_cifrada);
    return {
        credencialId: row.id,
        entorno: row.entorno,
        proveedorCodigo: row.proveedor_codigo,
        hostBase: row.host_base,
        apiVersion: row.api_version,
        ...decoded,
    };
}

async function listCredencialesActivas() {
    const { rows } = await getAdminPool().query(
        `SELECT c.id AS credencial_id, c.empresa_id, c.entorno,
                c.credencial_cifrada,
                p.id AS proveedor_id, p.codigo AS proveedor_codigo,
                p.host_base, p.api_version,
                e.codigo AS empresa_codigo, e.nombre AS empresa_nombre
         FROM pasarela_proveedores_credenciales c
         JOIN pasarela_proveedores p ON p.id = c.proveedor_id
         JOIN empresas e ON e.id = c.empresa_id
         WHERE c.activo = TRUE AND p.activo = TRUE`
    );
    return rows.map((r) => ({
        credencialId: r.credencial_id,
        empresaId: r.empresa_id,
        empresaCodigo: r.empresa_codigo,
        empresaNombre: r.empresa_nombre,
        proveedorId: r.proveedor_id,
        proveedorCodigo: r.proveedor_codigo,
        hostBase: r.host_base,
        apiVersion: r.api_version,
        entorno: r.entorno,
        ...descifrarJson(r.credencial_cifrada),
    }));
}

async function marcarSync({ credencialId, ok, error = null }) {
    await getAdminPool().query(
        `UPDATE pasarela_proveedores_credenciales
         SET ultima_sync_at = NOW(),
             ultima_sync_ok = $2,
             ultimo_error   = $3
         WHERE id = $1`,
        [credencialId, ok, error]
    );
}

module.exports = { getCredencial, listCredencialesActivas, marcarSync, cifrarJson };
