/**
 * Cliente JS web compartido para reportar errores del frontend.
 *
 * Uso:
 *   import { installErrorReporter } from './error-reporter';
 *   installErrorReporter({
 *     project: 'admin-panel',
 *     url: 'https://admin.saycusoft.es/api/error-report',
 *     environment: import.meta.env.PROD ? 'production' : 'development',
 *     enabled: import.meta.env.PROD,
 *     getUser: () => ({ id: ..., login: ... }),    // opcional
 *     getEmpresa: () => '...',                     // opcional
 *   });
 *
 * Captura:
 *  - errores síncronos del runtime (window.onerror)
 *  - rechazos de promesas no atrapadas (unhandledrejection)
 *  - respuestas HTTP 5xx en fetch (envuelve fetch global)
 *
 * No rompe la app: si el endpoint no responde, los reportes se descartan en silencio.
 */

const state = {
  project: 'unknown',
  url: null,
  environment: 'production',
  enabled: false,
  getUser: () => null,
  getEmpresa: () => null,
  recentSignatures: new Map(),
};

const COOLDOWN_MS = 60_000;

function shouldSend(signature) {
  const now = Date.now();
  const last = state.recentSignatures.get(signature);
  if (last && now - last < COOLDOWN_MS) return false;
  state.recentSignatures.set(signature, now);
  if (state.recentSignatures.size > 200) {
    const firstKey = state.recentSignatures.keys().next().value;
    state.recentSignatures.delete(firstKey);
  }
  return true;
}

function localSignature(message, stack) {
  const head = (stack || '').split('\n').slice(0, 3).join('\n').replace(/:\d+:\d+/g, ':X:X');
  return (state.project + '::' + (message || '') + '::' + head).slice(0, 400);
}

function sendReport(payload) {
  if (!state.enabled || !state.url) return;
  try {
    const body = JSON.stringify({
      project: state.project,
      environment: state.environment,
      ...payload,
      user_agent: navigator.userAgent,
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(state.url, blob);
      if (ok) return;
    }
    fetch(state.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    }).catch(() => {});
  } catch (_) {
    // silencioso
  }
}

function buildUserFields() {
  const user = (typeof state.getUser === 'function' && state.getUser()) || {};
  const empresa = (typeof state.getEmpresa === 'function' && state.getEmpresa()) || null;
  return {
    user_id: user.id != null ? String(user.id) : undefined,
    user_login: user.login || user.usuario || user.email || undefined,
    empresa_codigo: empresa || user.empresa || undefined,
  };
}

function captureError(message, stack, source, extra) {
  const sig = localSignature(message, stack);
  if (!shouldSend(sig)) return;
  sendReport({
    source: source || 'frontend',
    severity: 'error',
    message: String(message || '(sin mensaje)').slice(0, 4000),
    stack: stack ? String(stack).slice(0, 32000) : undefined,
    http_url: typeof location !== 'undefined' ? location.href : undefined,
    extra,
    ...buildUserFields(),
  });
}

function installErrorReporter(opts) {
  Object.assign(state, opts || {});
  if (!state.enabled || !state.url) {
    return;
  }

  window.addEventListener('error', (event) => {
    if (event.error) {
      captureError(event.error.message, event.error.stack, 'frontend');
    } else {
      captureError(event.message, `${event.filename}:${event.lineno}:${event.colno}`, 'frontend');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      captureError(reason.message, reason.stack, 'frontend');
    } else {
      captureError(typeof reason === 'string' ? reason : JSON.stringify(reason), null, 'frontend');
    }
  });

  // Wrap fetch para capturar 5xx (no 4xx). No rompe el flujo: la respuesta
  // se devuelve igual al llamador.
  const origFetch = window.fetch;
  if (origFetch && !window.__saycuFetchPatched) {
    window.fetch = async function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || (input && input.method) || 'GET';
      let response;
      try {
        response = await origFetch.call(this, input, init);
      } catch (err) {
        captureError(`fetch network error: ${err && err.message}`, err && err.stack, 'frontend', { url, method });
        throw err;
      }
      if (response && response.status >= 500) {
        const sig = localSignature(`HTTP ${response.status} ${method} ${url}`, '');
        if (shouldSend(sig)) {
          sendReport({
            source: 'frontend',
            severity: 'error',
            message: `HTTP ${response.status} en ${method} ${url}`,
            http_method: method,
            http_url: url,
            http_status: response.status,
            ...buildUserFields(),
          });
        }
      }
      return response;
    };
    window.__saycuFetchPatched = true;
  }
}

function reportError(message, extra) {
  const err = message instanceof Error ? message : new Error(String(message));
  captureError(err.message, err.stack, 'frontend', extra);
}

export { installErrorReporter, reportError };
