// GPS rápido. Devuelve null si el usuario rechaza permiso o si timeout.
// No bloquea las transiciones — el backend acepta lat/lng opcionales.

export type Coords = { lat: number; lng: number; accuracy?: number };

export function obtenerCoords(timeoutMs = 6000): Promise<Coords | null> {
    return new Promise((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null);
        const t = setTimeout(() => resolve(null), timeoutMs);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                clearTimeout(t);
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                });
            },
            () => { clearTimeout(t); resolve(null); },
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 5000 }
        );
    });
}
