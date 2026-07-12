/**
 * Cliente HTTP del panel pasarela. Bearer token del login en localStorage,
 * limpieza automática en 401 (excepto en el propio /login).
 *
 * Las rutas se piden "limpias" (sin /api): /auth/login, /me/…, /vista-prefs/…
 * Detrás de system-caddy, `handle_path /pasarela/* + rewrite * /api{path}` les
 * antepone /api antes de llegar a pasarela_api (que monta sus routers en /api/*);
 * en el dev server local, el proxy de vite.config hace ese mismo /api. Anteponer
 * /api aquí duplicaba el prefijo (…/pasarela/api/api/… → 404).
 *
 * VITE_API_BASE viene del build (Dockerfile) y apunta al API público:
 *   - prod: https://api.saycunode.saycutrans.es/pasarela
 *   - dev:  https://dev-api.saycunode.saycutrans.es/pasarela
 *   - local (dev server): "" + proxy (vite.config) → http://localhost:3412/api/*
 */

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const TOKEN_KEY = 'pasarela_panel_token';
const USER_KEY  = 'pasarela_panel_user';
const EMPRESA_KEY = 'pasarela_panel_empresa';

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => {
    const raw = localStorage.getItem(USER_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  getEmpresaCodigo: () => localStorage.getItem(EMPRESA_KEY) || '',
  setEmpresaCodigo: (codigo) => localStorage.setItem(EMPRESA_KEY, codigo || ''),
  setSession: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = auth.getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const esLogin = path.startsWith('/auth/login');
    if (res.status === 401 && !esLogin) {
      auth.clear();
      if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
        window.location.replace('/pasarela/login');
      }
    }
    const err = new Error(data.error || res.statusText || 'Error');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: (usuario, password, empresa_codigo, extra = {}) =>
    request('/auth/login', { method: 'POST', body: { usuario, password, empresa_codigo, ...extra } }),
  // Forgot/reset password: pendientes (ver TODO en pasarela_api/routes/auth.js).
  // forgotPassword: (email, empresa_codigo) =>
  //   request('/auth/forgot-password', { method: 'POST', body: { email, empresa_codigo } }),
  // resetPassword: (token, password, empresa_codigo) =>
  //   request('/auth/reset-password', { method: 'POST', body: { token, password, empresa_codigo } }),
  me: {
    listPedidos: (params = {}) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      }
      const tail = qs.toString();
      return request(`/me/pedidos${tail ? `?${tail}` : ''}`);
    },
    getPedido: (id) => request(`/me/pedidos/${encodeURIComponent(id)}`),
    getEmpresa: () => request('/me/empresa'),
  },
  // Preferencias de vista (toggle Tabla/Tarjetas, columnas, orden) por
  // usuario+navegador en BD (saycu_admin.panel_vista_prefs). El navegador lo
  // identifica el cliente con un UUID en cookie propia, enviado en `nav`.
  getVistaPrefs: (scope, nav) =>
    request(`/vista-prefs/${encodeURIComponent(scope)}?nav=${encodeURIComponent(nav || '')}`),
  putVistaPrefs: (scope, nav, config) =>
    request(`/vista-prefs/${encodeURIComponent(scope)}`, { method: 'PUT', body: { nav, config } }),
};
