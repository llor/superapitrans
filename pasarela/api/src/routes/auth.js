/**
 * pasarela — autenticación del PANEL WEB (humanos).
 *
 * Distinto de `auth/client-key.js` (que valida API keys de clientes externos).
 * Aquí valida el login de un usuario de empresa (GFE, JSR, …) o de un admin
 * global del grupo Saycu, contra las tablas que ya gestiona admin.saycusoft.es:
 *
 *   - `saycu_admin.usuarios_panel_<empresa_codigo>` (CRUD desde
 *      admin.saycusoft.es → ficha empresa → Panel de Empresa → Usuarios).
 *   - `saycu_admin.usuarios_admin` (admin global, fallback transversal).
 *
 * Devuelve un JWT que `auth/user-jwt.js#requireUser` valida en /api/me/*.
 *
 * Endpoints:
 *   POST /api/auth/login           { empresa_codigo, usuario, password }
 *
 * Forgot/reset password: pendientes (ver TODO al final). La pantalla
 * Login del panel debe enseñar el enlace "¿Olvidaste la contraseña?" según
 * directriz INVIOLABLE; mientras los endpoints no estén operativos, el
 * frontend mostrará un mensaje claro al usuario (sin fallback silencioso).
 */

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { getAdminPool } = require('../db');
const { signUserToken, panelUsersTable } = require('../auth/user-jwt');

const router = Router();

router.post('/login', async (req, res, next) => {
    try {
        const { empresa_codigo, usuario, password } = req.body || {};
        if (!usuario || !password) {
            return res.status(400).json({ ok: false, error: 'usuario_y_password_requeridos' });
        }

        const adminPool = getAdminPool();

        // 1) usuarios_admin (admin global del grupo Saycu) — sin empresa.
        //    Coincide con el patrón de saycutrans/saycupartes: el superadmin
        //    puede entrar a cualquier panel.
        const adminRes = await adminPool.query(
            `SELECT id, usuario, email, password_hash, nombre, apellidos,
                    COALESCE(es_super_admin, FALSE) AS es_super_admin
               FROM usuarios_admin
              WHERE (LOWER(usuario) = LOWER($1) OR LOWER(COALESCE(email,'')) = LOWER($1))
                AND COALESCE(activo, TRUE) = TRUE
                AND deleted_at IS NULL
              LIMIT 1`,
            [String(usuario).trim()]
        );
        if (adminRes.rowCount > 0) {
            const u = adminRes.rows[0];
            const ok = await bcrypt.compare(String(password), u.password_hash);
            if (ok) {
                const payload = {
                    tipo: 'admin',
                    id: u.id,
                    login: u.usuario,
                    nombre: u.nombre,
                    apellidos: u.apellidos,
                    email: u.email,
                    es_super_admin: !!u.es_super_admin,
                    // Empresa que el admin global está consultando ahora.
                    // El frontend admin selecciona la empresa explícitamente;
                    // si vino en la petición, se la guardamos en el token.
                    empresa_codigo: empresa_codigo
                        ? String(empresa_codigo).toUpperCase()
                        : null,
                };
                return res.json({
                    ok: true,
                    token: signUserToken(payload),
                    user: payload,
                });
            }
        }

        // 2) usuarios_panel_<empresa_codigo> — usuarios de empresa.
        if (!empresa_codigo) {
            return res.status(401).json({ ok: false, error: 'credenciales_invalidas' });
        }
        const empresaCodigoUpper = String(empresa_codigo).toUpperCase();

        // La empresa debe existir, estar activa y tener servicio pasarela.
        const empRes = await adminPool.query(
            `SELECT codigo, servicios::text[] AS servicios
               FROM empresas
              WHERE UPPER(codigo) = $1 AND activo = TRUE
              LIMIT 1`,
            [empresaCodigoUpper]
        );
        if (empRes.rowCount === 0
            || !(empRes.rows[0].servicios || []).includes('pasarela')) {
            return res.status(401).json({ ok: false, error: 'credenciales_invalidas' });
        }

        const tabla = panelUsersTable(empresaCodigoUpper);
        const panelRes = await adminPool.query(
            `SELECT id, login, password, nombre, apellidos, email, permisos,
                    COALESCE(activo, TRUE) AS activo
               FROM ${tabla}
              WHERE (LOWER(login) = LOWER($1) OR LOWER(COALESCE(email,'')) = LOWER($1))
                AND COALESCE(activo, TRUE) = TRUE
              LIMIT 1`,
            [String(usuario).trim()]
        );
        if (panelRes.rowCount === 0) {
            return res.status(401).json({ ok: false, error: 'credenciales_invalidas' });
        }
        const u = panelRes.rows[0];
        const ok = await bcrypt.compare(String(password), u.password);
        if (!ok) {
            return res.status(401).json({ ok: false, error: 'credenciales_invalidas' });
        }

        // Marca ultimo_acceso (best-effort, no rompe el login).
        adminPool.query(
            `UPDATE ${tabla} SET ultimo_acceso = NOW(), updated_at = NOW() WHERE id = $1`,
            [u.id]
        ).catch(() => { /* el ErrorReporter del wrapPg ya reporta si falla */ });

        const permisosPasarela = (u.permisos && u.permisos.pasarela) || [];
        const payload = {
            tipo: 'panel',
            id: u.id,
            login: u.login,
            nombre: u.nombre,
            apellidos: u.apellidos,
            email: u.email,
            empresa_codigo: empresaCodigoUpper,
            // Rol base implícito por tener el servicio pasarela. Los extras
            // (admin) vienen en `permisos.pasarela` como array.
            rol_base: 'consulta',
            roles_extra: Array.isArray(permisosPasarela) ? permisosPasarela : [],
        };
        return res.json({
            ok: true,
            token: signUserToken(payload),
            user: payload,
        });
    } catch (err) {
        next(err);
    }
});

// TODO Tarea 1 (paso final): añadir POST /forgot-password y POST /reset-password
// clonando el patrón de saycupartes/backend/src/routes/auth.js (líneas 191-289).
// Necesita: tabla `password_reset_tokens` en saycu_admin (no por tenant — los
// usuarios viven en saycu_admin.usuarios_panel_<cod>), helper de SMTP del grupo
// y plantilla del email. Hasta entonces, la SPA Login.jsx mostrará el enlace
// "¿Olvidaste la contraseña?" con mensaje claro al usuario indicando que
// debe pedir reset al admin de su empresa (sin fallback silencioso).

module.exports = router;
