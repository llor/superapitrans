/**
 * Cliente HTTP del panel pasarela. Bearer token del login en localStorage,
 * limpieza automática en 401 (excepto en el propio /login).
 *
 * VITE_API_BASE viene del build (Dockerfile) y apunta al API público:
 *   - prod: https://api.saycunode.saycutrans.es/pasarela
 *   - dev:  https://dev-api.saycunode.saycutrans.es/pasarela
 *   - local (dev server): "" + proxy /api/* → http://localhost:3412
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
    const esLogin = path.startsWith('/api/auth/login');
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
    request('/api/auth/login', { method: 'POST', body: { usuario, password, empresa_codigo, ...extra } }),
  // Forgot/reset password: pendientes (ver TODO en pasarela_api/routes/auth.js).
  // forgotPassword: (email, empresa_codigo) =>
  //   request('/api/auth/forgot-password', { method: 'POST', body: { email, empresa_codigo } }),
  // resetPassword: (token, password, empresa_codigo) =>
  //   request('/api/auth/reset-password', { method: 'POST', body: { token, password, empresa_codigo } }),
  me: {
    listPedidos: (params = {}) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      }
      const tail = qs.toString();
      return request(`/api/me/pedidos${tail ? `?${tail}` : ''}`);
    },
    getPedido: (id) => request(`/api/me/pedidos/${encodeURIComponent(id)}`),
  },
};
