/**
 * Cliente Node compartido para reportar errores al receptor central de saycu/*.
 *
 * Uso típico (en index.js de cada API):
 *   const errorReporter = require('./utils/error-reporter-client');
 *   errorReporter.install({
 *     project: 'saycutrans-api',
 *     url: process.env.ERROR_REPORTER_URL,
 *     environment: process.env.NODE_ENV,
 *   });
 *   errorReporter.attachExpress(app, { extractUser: (req) => req.user });
 *   errorReporter.wrapPg(pool);                  // captura todos los errores SQL
 *
 *   // En cualquier try/catch manual:
 *   try { ... } catch (err) {
 *     errorReporter.reportError({ message: err.message, stack: err.stack, extra: { ctx } });
 *     ...
 *   }
 *
 *   // Y cuando ese mismo error deja de ocurrir (mismo payload):
 *   errorReporter.reportRecovery({ message, stack, extra: { ciclos } });
 *
 * Por defecto activado (enabled=true). Apagar con ERROR_REPORTER_ENABLED=false.
 * Si el endpoint receptor está caído o no configurado, los fallos se loguean
 * localmente pero no rompen la app (fire-and-forget).
 */

const config = {
  project: 'unknown',
  url: null,
  environment: process.env.NODE_ENV || 'production',
  enabled: process.env.ERROR_REPORTER_ENABLED !== 'false',
  timeoutMs: 5000,
};

function install(opts) {
  const {
    captureUncaught = true,
    captureUnhandled = true,
    exitOnFatal = true,
    patchExpressAsync = true,
    ...rest
  } = opts || {};
  Object.assign(config, rest);
  if (!config.enabled) {
    console.log('[ErrorReporter] desactivado (enabled=false)');
    return;
  }
  if (!config.url) {
    console.warn('[ErrorReporter] activado pero ERROR_REPORTER_URL vacío — no se enviarán reportes');
    return;
  }

  if (patchExpressAsync) {
    patchExpressLayer();
  }

  if (captureUncaught) {
    process.on('uncaughtException', (err) => {
      console.error('[FATAL uncaughtException]', err);
      const promise = Promise.race([
        sendError({
          source: 'process',
          severity: 'fatal',
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack,
        }),
        new Promise((r) => setTimeout(r, config.timeoutMs)),
      ]);
      if (exitOnFatal) {
        promise.finally(() => process.exit(1));
      }
    });
  }

  if (captureUnhandled) {
    process.on('unhandledRejection', (reason) => {
      console.error('[FATAL unhandledRejection]', reason);
      const err = reason instanceof Error ? reason : new Error(String(reason));
      const promise = Promise.race([
        sendError({
          source: 'process',
          severity: 'fatal',
          message: err.message,
          stack: err.stack,
        }),
        new Promise((r) => setTimeout(r, config.timeoutMs)),
      ]);
      if (exitOnFatal) {
        promise.finally(() => process.exit(1));
      }
    });
  }

  console.log(`[ErrorReporter] Instalado proyecto=${config.project} url=${config.url} env=${config.environment} exitOnFatal=${exitOnFatal}`);
}

function patchExpressLayer() {
  // Parche para que async-rejections de handlers vayan al middleware de error
  // en lugar de matar el proceso (Express 4 no lo hace nativo).
  try {
    const Layer = require('express/lib/router/layer');
    if (!Layer.__saycuPatched) {
      const _hr = Layer.prototype.handle_request;
      Layer.prototype.handle_request = function (req, res, next) {
        const fn = this.handle;
        if (typeof fn === 'function' && fn.constructor && fn.constructor.name === 'AsyncFunction') {
          Promise.resolve(fn.call(this, req, res, next)).catch(next);
          return;
        }
        return _hr.call(this, req, res, next);
      };
      const _he = Layer.prototype.handle_error;
      Layer.prototype.handle_error = function (err, req, res, next) {
        const fn = this.handle;
        // Solo los manejadores de ERROR (cuatro parámetros) reciben el error,
        // como hace Express: un middleware normal async (tres parámetros, por
        // ejemplo el limitador de peticiones) se llamaba aquí con los
        // argumentos corridos (request = el error, next = res) y reventaba con
        // «next is not a function» en cuanto algo fallaba antes de él (un JSON
        // mal formado en el body). Detectado el 2026-08-28.
        if (typeof fn === 'function' && fn.length !== 4) {
          return next(err);
        }
        if (typeof fn === 'function' && fn.constructor && fn.constructor.name === 'AsyncFunction') {
          Promise.resolve(fn.call(this, err, req, res, next)).catch(next);
          return;
        }
        return _he.call(this, err, req, res, next);
      };
      Layer.__saycuPatched = true;
    }
  } catch (_) {
    // si no se encuentra Layer, no hacemos nada
  }
}

function attachExpress(app, opts = {}) {
  if (!app || typeof app.use !== 'function') {
    throw new Error('attachExpress: instancia Express inválida');
  }
  const extractUser = typeof opts.extractUser === 'function' ? opts.extractUser : () => null;
  patchExpressLayer();

  app.use((err, req, res, _next) => {
    // Un 4xx NO es un bug del backend: lo provoca el cliente (cuerpo JSON mal
    // formado, validación, permiso). Se responde con SU status y NO se manda
    // email; solo los 5xx son fallos del servidor. Sin esto, un JSON mal
    // formado acababa en 500 y en un aviso por correo que nadie tenía que
    // reparar (encargo del usuario del 2026-08-30, ya aplicado en
    // saycutrans/api-desktop-pg/src/index.js el 28/08).
    const status = Number(err && (err.httpStatus || err.status || err.statusCode)) || 0;
    const esClientError = status >= 400 && status < 500;
    const user = extractUser(req) || {};
    if (!esClientError) {
      sendError({
        source: 'backend',
        severity: 'error',
        message: err && err.message ? err.message : String(err),
        stack: err && err.stack,
        http_method: req.method,
        http_url: req.originalUrl,
        http_status: 500,
        user_id: user.id,
        user_login: user.usuario || user.login || user.email,
        empresa_codigo: user.empresa || user.empresa_codigo,
        user_agent: req.headers && req.headers['user-agent'],
        client_ip: req.ip,
        request_payload: { query: req.query, body: req.body, params: req.params },
      });
    }
    if (res.headersSent) return;
    if (esClientError) {
      res.status(status).json({
        error: err && err.type === 'entity.parse.failed'
          ? 'Cuerpo de la petición mal formado (JSON no válido)'
          : ((err && err.message) || 'Petición no válida'),
      });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  });
}

async function reportError(input) {
  return sendError(input || {});
}

/**
 * Avisa de que un error del que YA se informó ha dejado de ocurrir. El receptor
 * lo manda como «CORREJIDO: <asunto del email de error>».
 *
 * Hay que pasarle el MISMO payload con el que se reportó el error (message y
 * stack incluidos): el receptor calcula la firma con esos datos para localizar
 * el aviso original. En `extra` se puede añadir el desenlace (cuántos ciclos
 * estuvo fallando, etc.) sin que afecte a la firma.
 *
 * Si de ese error nunca salió email, o su racha ya estaba cerrada, el receptor
 * no manda nada.
 */
async function reportRecovery(input) {
  return sendError({ ...(input || {}), recuperado: true });
}

/**
 * Envuelve un Pool de pg para que cualquier query que falle reporte el error
 * antes de propagarlo al caller. No cambia el comportamiento (re-lanza el error).
 *
 *   const errorReporter = require('./utils/error-reporter-client');
 *   const pool = new Pool({...});
 *   errorReporter.wrapPg(pool, { label: 'main' });
 *
 * Idempotente: si se llama dos veces sobre el mismo pool, no envuelve dos veces.
 */
function wrapPg(pool, opts = {}) {
  if (!pool || typeof pool.query !== 'function') return pool;
  if (pool.__saycuWrapped) return pool;
  const label = opts.label || 'main';
  const _query = pool.query.bind(pool);
  pool.query = function patchedPgQuery(...args) {
    const result = _query(...args);
    // pg.Pool.query devuelve Promise (sin callback) o usa callback. Si es Promise,
    // lo encadenamos con catch que reporta y re-lanza.
    if (result && typeof result.then === 'function') {
      return result.catch((err) => {
        try {
          const sql = typeof args[0] === 'string'
            ? args[0]
            : (args[0] && args[0].text) || '(query objeto)';
          const params = Array.isArray(args[1])
            ? args[1]
            : (args[0] && args[0].values) || undefined;
          sendError({
            source: 'db',
            severity: 'error',
            message: `[pg:${label}] ${err.message || String(err)}`,
            stack: err.stack,
            extra: {
              code: err.code,
              detail: err.detail,
              hint: err.hint,
              schema: err.schema,
              table: err.table,
              column: err.column,
              constraint: err.constraint,
              sql: typeof sql === 'string' ? sql.slice(0, 4000) : null,
              params: params ? params.map((p) => (typeof p === 'string' ? p.slice(0, 200) : p)) : undefined,
            },
          });
        } catch (_) { /* nunca romper por reporting */ }
        throw err;
      });
    }
    return result;
  };
  pool.__saycuWrapped = true;
  return pool;
}

async function sendError(input) {
  if (!config.enabled || !config.url) return;
  try {
    const payload = {
      project: config.project,
      environment: config.environment,
      source: input.source || 'backend',
      severity: input.severity || 'error',
      message: input.message || '(sin mensaje)',
      stack: input.stack,
      http_method: input.http_method,
      http_url: input.http_url,
      http_status: input.http_status,
      user_id: input.user_id,
      user_login: input.user_login,
      empresa_codigo: input.empresa_codigo,
      user_agent: input.user_agent,
      request_payload: input.request_payload,
      extra: input.extra,
      // true solo en los avisos de reportRecovery (el error ya no ocurre).
      recuperado: input.recuperado === true ? true : undefined,
    };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.timeoutMs);
    await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    }).catch((e) => console.error('[ErrorReporter] POST fallido:', e.message));
    clearTimeout(t);
  } catch (e) {
    console.error('[ErrorReporter] excepción enviando reporte:', e.message);
  }
}

module.exports = { install, attachExpress, reportError, reportRecovery, wrapPg, patchExpressLayer };
