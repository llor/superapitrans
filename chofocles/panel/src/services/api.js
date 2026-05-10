/**
 * Cliente HTTP minimalista contra la API de chofocles.
 * Maneja Bearer token + refresh automático en 401.
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function getAccessToken() {
    return sessionStorage.getItem('chofocles_access_token');
}

function getRefreshToken() {
    return sessionStorage.getItem('chofocles_refresh_token');
}

function setTokens({ accessToken, refreshToken }) {
    if (accessToken) sessionStorage.setItem('chofocles_access_token', accessToken);
    if (refreshToken) sessionStorage.setItem('chofocles_refresh_token', refreshToken);
}

function clearTokens() {
    sessionStorage.removeItem('chofocles_access_token');
    sessionStorage.removeItem('chofocles_refresh_token');
    sessionStorage.removeItem('chofocles_user');
}

async function rawRequest(path, { method = 'GET', body = null, headers = {} } = {}) {
    const token = getAccessToken();
    const fullHeaders = {
        'Content-Type': 'application/json',
        ...headers,
    };
    if (token) fullHeaders.Authorization = `Bearer ${token}`;
    const opts = { method, headers: fullHeaders };
    if (body !== null) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    return res;
}

async function refreshTokens() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
        clearTokens();
        return false;
    }
    const data = await res.json();
    if (!data.ok || !data.data) {
        clearTokens();
        return false;
    }
    setTokens({
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
    });
    return true;
}

async function request(path, opts) {
    let res = await rawRequest(path, opts);
    if (res.status === 401 && getRefreshToken()) {
        const ok = await refreshTokens();
        if (ok) res = await rawRequest(path, opts);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(json.message || json.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.payload = json;
        throw err;
    }
    return json;
}


// ──── Auth ────

export async function login({ empresa, login, password }) {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa, login, password }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
        throw new Error(json.message || json.error || `HTTP ${res.status}`);
    }
    setTokens({
        accessToken: json.data.accessToken,
        refreshToken: json.data.refreshToken,
    });
    sessionStorage.setItem('chofocles_user', JSON.stringify(json.data.user));
    return json.data.user;
}

export async function logout() {
    try {
        await request('/auth/logout', { method: 'POST' });
    } catch (_) { /* ignore */ }
    clearTokens();
}

export function getStoredUser() {
    const raw = sessionStorage.getItem('chofocles_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

export function isAuthenticated() {
    return !!getAccessToken();
}


// ──── Viajes ────

export async function listarViajes() {
    const json = await request('/viajes');
    return json.data.viajes;
}

export async function detalleViaje(id) {
    const json = await request(`/viajes/${id}`);
    return json.data;
}

export async function aplicarComando(viajeId, payload) {
    const json = await request(`/viajes/${viajeId}/comando`, {
        method: 'POST',
        body: payload,
    });
    return json.data;
}


// ──── Incidencias ────

export async function listarIncidencias({ viajeId } = {}) {
    const path = viajeId ? `/incidencias?viaje_id=${viajeId}` : '/incidencias';
    const json = await request(path);
    return json.data.incidencias;
}

export async function crearIncidencia(payload) {
    const json = await request('/incidencias', { method: 'POST', body: payload });
    return json.data.incidencia;
}
