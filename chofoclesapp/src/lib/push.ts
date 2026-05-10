// Registro de push notifications con @capacitor/push-notifications.
// Se llama una vez tras login. En navegador no hace nada.
//
// Requiere Firebase (google-services.json) configurado en android/app/.
// Sin Firebase, register() falla a nivel nativo y puede tumbar la app, así
// que detectamos el caso y salimos limpiamente.

import { Capacitor } from '@capacitor/core';
import { api } from '../api';

export async function registrarPush() {
    if (!Capacitor.isNativePlatform()) return;

    let mod: any;
    try {
        mod = await import('@capacitor/push-notifications');
    } catch {
        return;       // dependencia opcional
    }
    const { PushNotifications } = mod;

    try {
        const perm = await PushNotifications.checkPermissions();
        let granted = perm.receive === 'granted';
        if (!granted) {
            const r = await PushNotifications.requestPermissions();
            granted = r.receive === 'granted';
        }
        if (!granted) return;

        PushNotifications.addListener('registration', async (token: any) => {
            try { await api.registrarDeviceToken(token.value, 'android'); }
            catch (e) { console.warn('registrar device token falló', e); }
        });
        PushNotifications.addListener('registrationError', (e: any) => {
            console.warn('push registrationError', e);
        });
        PushNotifications.addListener('pushNotificationReceived', (n: any) => {
            window.dispatchEvent(new CustomEvent('chofocles:push', { detail: n }));
        });

        // FCM/google-services.json no configurado todavía.
        // Activar cuando se cree el proyecto Firebase del grupo:
        //   await PushNotifications.register();
    } catch (e) {
        console.warn('registrarPush falló', e);
    }
}
