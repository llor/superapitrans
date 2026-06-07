/**
 * Cliente Node canónico de ControlGlobal.
 *
 * Fuente de verdad: `saycu/ControlGlobal/clients/node/control-global-client.js`.
 * Cada backend del grupo Saycu que use ControlGlobal copia este fichero
 * BYTE A BYTE en su `backend/src/utils/control-global-client.js` y lo
 * enchufa al endpoint de login (patrón del error-reporter-client).
 *
 * Uso típico (al arrancar el backend):
 *   const controlGlobal = require('./utils/control-global-client');
 *   controlGlobal.install({
 *     project:     'admin-api',
 *     appCode:     'admin-panel',
 *     platform:    'web',
 *     clientKind:  'web',
 *     url:         process.env.CONTROL_GLOBAL_URL,
 *     secret:      process.env.CONTROL_GLOBAL_SECRET,
 *     environment: process.env.NODE_ENV,
 *   });
 *
 *   // En el handler de login, tras validar credenciales:
 *   const cgResp = await controlGlobal.reportLogin({
 *     app_code, platform, client_kind, version_name, version_code,
 *     device_uid, device_model, os_name, os_version,
 *     empresa_codigo, service_code,
 *     usuario_kind, usuario_id, usuario_ref,
 *     ip, user_agent,
 *     success, failure_reason, jwt_jti, raw_extra,
 *   });
 *   // cgResp = { latest, update_available, update_required, session_jti }
 *   // ...y se devuelve al frontend en la respuesta del /login.
 *
 * Fire-and-forget: si el receptor cae, las llamadas devuelven null y la app
 * sigue funcionando. NUNCA bloquean el login real.
 */

const config = {
  project: 'unknown',
  appCode: 'unknown',
  platform: 'unknown',
  clientKind: 'unknown',
  url: null,
  secret: null,
  environment: process.env.NODE_ENV || 'production',
  enabled: process.env.CONTROL_GLOBAL_ENABLED !== 'false',
  timeoutMs: 5000,
};

function install(opts) {
  Object.assign(config, opts || {});
  if (!config.enabled) {
    console.log('[ControlGlobal] desactivado (enabled=false)');
    return;
  }
  if (!config.url) {
    console.warn('[ControlGlobal] activado pero CONTROL_GLOBAL_URL vacío — no se enviarán eventos');
    return;
  }
  if (!config.secret) {
    console.warn('[ControlGlobal] CONTROL_GLOBAL_SECRET vacío — el receptor rechazará con 401');
  }
  console.log(`[ControlGlobal] Instalado proyecto=${config.project} app=${config.appCode}/${config.platform} url=${config.url} env=${config.environment}`);
}

function buildBase() {
  return {
    app_code:    config.appCode,
    platform:    config.platform,
    client_kind: config.clientKind,
  };
}

async function postReceptor(path, body) {
  if (!config.enabled || !config.url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.timeoutMs);
    const res = await fetch(`${config.url.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Control-Global-Secret': config.secret || '',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[ControlGlobal] ${path} → HTTP ${res.status}`);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (e) {
    console.warn('[ControlGlobal] POST fallido:', e.message);
    return null;
  }
}

async function getReceptor(path, params) {
  if (!config.enabled || !config.url) return null;
  try {
    const qs = new URLSearchParams(params || {}).toString();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.timeoutMs);
    const res = await fetch(`${config.url.replace(/\/$/, '')}${path}${qs ? '?' + qs : ''}`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (e) {
    console.warn('[ControlGlobal] GET fallido:', e.message);
    return null;
  }
}

/**
 * Reporta un evento de login (éxito o fallo). Devuelve la respuesta del
 * receptor o null si falló: { latest, update_available, update_required, session_jti }.
 */
async function reportLogin(input) {
  return postReceptor('/login', { ...buildBase(), ...input });
}

/** Heartbeat de sesión activa. Devuelve { updated } o null. */
async function reportPing(input) {
  return postReceptor('/ping', input);
}

/** Cierre explícito de sesión. Devuelve { updated } o null. */
async function reportLogout(input) {
  return postReceptor('/logout', input);
}

/** Arranque de APK sin login. Devuelve { latest, update_available, update_required } o null. */
async function reportAppStart(input) {
  return postReceptor('/app-start', { ...buildBase(), ...input });
}

/** Consulta pública (sin secreto) de la versión actual y mínima requerida. */
async function getLatestVersion(input) {
  const q = {
    app_code: (input && input.app_code) || config.appCode,
    platform: (input && input.platform) || config.platform,
  };
  return getReceptor('/version', q);
}

module.exports = {
  install,
  reportLogin,
  reportPing,
  reportLogout,
  reportAppStart,
  getLatestVersion,
};
