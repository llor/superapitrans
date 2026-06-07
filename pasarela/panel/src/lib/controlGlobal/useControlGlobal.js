// useControlGlobal — hook React canónico de ControlGlobal.
//
// Fuente de verdad: saycu/ControlGlobal/clients/react/useControlGlobal.js
// Cada panel/SPA del grupo Saycu que use ControlGlobal copia este fichero
// (y `UpdateBanner.jsx`) BYTE A BYTE en su `panel/src/lib/controlGlobal/`.
//
// IMPORTANTE — el frontend NO habla directamente con el receptor
// (admin.saycusoft.es/api/control-global/*) porque eso obligaría a exponer
// el `CONTROL_GLOBAL_SECRET` en el bundle JS. En su lugar:
//
//   - Este hook genera/lee el `device_uid` web (UUID v4 en
//     `localStorage['saycu.deviceUid']`) y expone también `versionName`.
//   - El componente Login pasa esos dos valores al body del POST que su
//     propio backend recibe (`/api/auth/login`).
//   - El backend (que SÍ conoce el secreto) llama a
//     `controlGlobalClient.reportLogin(...)` y devuelve `latest` y
//     `update_available` en la respuesta del /login.
//   - El frontend recibe esos campos y, si toca, muestra `<UpdateBanner>`.

import { useEffect, useMemo, useState, useCallback } from 'react';

const DEVICE_UID_KEY = 'saycu.deviceUid';

/** UUID v4 (crypto.randomUUID si está, fallback manual). */
function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback básico (suficiente para identificación, no es criptográfico).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Lee el device_uid del localStorage; si no existe, lo genera y lo guarda. */
export function resolveDeviceUid() {
  try {
    let uid = localStorage.getItem(DEVICE_UID_KEY);
    if (!uid) {
      uid = newUuid();
      localStorage.setItem(DEVICE_UID_KEY, uid);
    }
    return uid;
  } catch (_) {
    // localStorage bloqueado (modo privado, etc.) → UID efímero.
    return newUuid();
  }
}

/**
 * Hook ControlGlobal.
 *
 * @param {object} opts
 * @param {string} opts.versionName   — versión del frontend (ej. "1.0.0").
 * @returns {{ deviceUid, versionName, updateInfo, setUpdateInfo, clearUpdateInfo }}
 *
 * Flujo recomendado en Login.jsx:
 *   const { deviceUid, versionName, updateInfo, setUpdateInfo, clearUpdateInfo } = useControlGlobal({ versionName: '1.0.0' });
 *   const data = await api.login(usuario, password, { deviceUid, versionName });
 *   if (data.control_global?.update_available) setUpdateInfo(data.control_global);
 *   ...
 *   {updateInfo && <UpdateBanner info={updateInfo} onClose={clearUpdateInfo} />}
 */
export function useControlGlobal({ versionName } = {}) {
  const deviceUid = useMemo(() => resolveDeviceUid(), []);
  const [updateInfo, setUpdateInfo] = useState(null);

  const clearUpdateInfo = useCallback(() => setUpdateInfo(null), []);

  useEffect(() => {
    // Si el host quiere persistir el aviso "ya mostrado" entre vistas, lo
    // hará por su cuenta. Aquí solo guardamos el estado de UI.
  }, []);

  return {
    deviceUid,
    versionName: versionName || null,
    updateInfo,
    setUpdateInfo,
    clearUpdateInfo,
  };
}

export default useControlGlobal;
