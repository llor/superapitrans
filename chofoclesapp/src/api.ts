// Cliente HTTP del API chofocles. URL base detectada por hostname:
// - dev-* o localhost → DEV
// - resto             → PROD
// Override manual desde Config (botón oculto 7 toques en logo).

import { storage } from './lib/storage';

const API_DEV  = 'https://dev-api.superapi.eoden.es/chofocles';
const API_PROD = 'https://api.superapi.eoden.es/chofocles';

const TOKEN_KEY      = 'chofoclesapp_access_token';
const REFRESH_KEY    = 'chofoclesapp_refresh_token';
const EMPRESA_KEY    = 'chofoclesapp_empresa';
const USER_KEY       = 'chofoclesapp_user';
const ENV_OVERRIDE   = 'chofoclesapp_env_override';   // 'dev' | 'prod'

let _user: any = null;
let _accessToken: string | null = null;

export type Usuario = {
    id: number;
    login: string;
    nombre: string;
    rol: string;
    empresa: string;
};

export type LoginResponse = {
    accessToken: string;
    refreshToken: string;
    user: Usuario;
};

export type Viaje = {
    id: number;
    referencia_externa: string;
    fecha: string;
    estado_codigo?: string;
    estado_nombre?: string;
    cliente_nombre?: string;
    mercancia_descripcion?: string;
    origen_municipio?: string;
    destino_municipio?: string;
    paradas?: Array<{
        id: number;
        orden: number;
        tipo: 'recogida' | 'entrega';
        nombre_cliente?: string;
        municipio?: string;
        poblacion?: string;
        provincia?: string;
        direccion1?: string;
        codigo_postal?: string;
        estado_codigo?: string;
    }>;
};

async function defaultBase(): Promise<string> {
    const override = await storage.get(ENV_OVERRIDE);
    if (override === 'dev')  return API_DEV;
    if (override === 'prod') return API_PROD;
    const h = (typeof window !== 'undefined' ? window.location.hostname : '') || '';
    if (h.startsWith('dev-') || h === 'localhost' || h === '127.0.0.1') return API_DEV;
    return API_PROD;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = await defaultBase();
    if (_accessToken === null) _accessToken = await storage.get(TOKEN_KEY);
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(_accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}),
        ...(init.headers as Record<string, string>),
    };
    const res = await fetch(`${base}${path}`, { ...init, headers });
    let data: any = null;
    try { data = await res.json(); } catch { /* sin body */ }
    if (!res.ok) {
        if (res.status === 401) await api.logout();
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    }
    return data as T;
}

export const api = {
    async getApiBase()           { return defaultBase(); },
    async setEnvOverride(env: 'dev' | 'prod' | null) {
        if (env === null) await storage.remove(ENV_OVERRIDE);
        else              await storage.set(ENV_OVERRIDE, env);
    },
    async getEnvOverride() { return storage.get(ENV_OVERRIDE); },

    async login(empresa: string, login: string, password: string): Promise<LoginResponse> {
        const raw = await request<any>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ empresa, login, password }),
        });
        const r: LoginResponse = raw.data || raw;
        _accessToken = r.accessToken;
        await storage.set(TOKEN_KEY,   r.accessToken);
        await storage.set(REFRESH_KEY, r.refreshToken);
        await storage.set(EMPRESA_KEY, empresa);
        await storage.set(USER_KEY,    JSON.stringify(r.user));
        _user = r.user;
        return r;
    },

    async logout() {
        _accessToken = null; _user = null;
        await storage.remove(TOKEN_KEY);
        await storage.remove(REFRESH_KEY);
        await storage.remove(USER_KEY);
    },

    async forgotPassword(email: string, empresa: string): Promise<{ ok: boolean; message: string }> {
        const raw = await request<any>('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email, empresa }),
        });
        return raw.data || raw;
    },

    async resetPassword(token: string, password: string, empresa: string): Promise<{ ok: boolean; message?: string }> {
        const raw = await request<any>('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password, empresa }),
        });
        return raw.data || raw;
    },

    async getUser(): Promise<Usuario | null> {
        if (_user) return _user;
        const raw = await storage.get(USER_KEY);
        if (!raw) return null;
        try { _user = JSON.parse(raw); return _user; } catch { return null; }
    },

    async listarViajes(): Promise<{ data: { viajes: Viaje[] } }> {
        return request('/viajes');
    },

    async getViaje(id: number): Promise<Viaje> {
        const r = await request<{ data: { viaje: Viaje } }>(`/viajes/${id}`);
        return r.data?.viaje || (r as any);
    },

    async enviarComando(viajeId: number, comando: string, opts: { gps?: { lat: number; lng: number } | null; notas?: string } = {}) {
        return request(`/viajes/${viajeId}/comando`, {
            method: 'POST',
            body: JSON.stringify({
                comando,
                notas: opts.notas || '',
                gps_lat: opts.gps?.lat ?? null,
                gps_lng: opts.gps?.lng ?? null,
            }),
        });
    },

    // Push: registrar token FCM en el backend (asociado al usuario actual).
    async registrarDeviceToken(token: string, plataforma: 'android' | 'ios' | 'web') {
        return request('/auth/device-token', {
            method: 'POST',
            body: JSON.stringify({ token, plataforma }),
        });
    },

    // Pasos activos para este chofer (interruptores de config).
    async getMisPasos(): Promise<{ pasos: Record<string, boolean> }> {
        const r = await request<any>('/auth/mis-pasos');
        return r.data || r;
    },
    async setMisPasos(pasos: Record<string, boolean>) {
        return request('/auth/mis-pasos', {
            method: 'PUT',
            body: JSON.stringify({ pasos }),
        });
    },
};
