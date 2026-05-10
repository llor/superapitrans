// Almacenamiento persistente. En navegador → localStorage; en Capacitor
// nativo → @capacitor/preferences (más fiable).
//
// API uniforme síncrona aparente: getItem devuelve Promise<string|null>,
// setItem y removeItem también son async. La API local cachea en memoria
// para get rápido tras un set.

import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const usaNativo = Capacitor.isNativePlatform();
const cache: Record<string, string | null> = {};

export const storage = {
    async get(key: string): Promise<string | null> {
        if (key in cache) return cache[key];
        let val: string | null = null;
        if (usaNativo) {
            const r = await Preferences.get({ key });
            val = r.value ?? null;
        } else {
            val = localStorage.getItem(key);
        }
        cache[key] = val;
        return val;
    },
    async set(key: string, value: string): Promise<void> {
        cache[key] = value;
        if (usaNativo) await Preferences.set({ key, value });
        else localStorage.setItem(key, value);
    },
    async remove(key: string): Promise<void> {
        delete cache[key];
        if (usaNativo) await Preferences.remove({ key });
        else localStorage.removeItem(key);
    },
};
