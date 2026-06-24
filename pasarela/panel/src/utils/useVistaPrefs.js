import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api.js';

const COOKIE_NAV = 'saycu_vp_nav';
const COOKIE_MAXAGE = 2 * 365 * 24 * 60 * 60; // ~2 años, en segundos

// Identificador del navegador. Lo genera y guarda el propio cliente en una
// cookie (NO localStorage) y se envía al backend en cada petición. Estable
// para este navegador-instalación; distingue dos equipos aunque usen el
// mismo navegador. Funciona igual con la API en el mismo origen o en otro
// subdominio, sin depender de cookies cross-site.
function getNavId() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)saycu_vp_nav=([0-9a-f-]{36})/i);
  if (m) return m[1];
  let id;
  try {
    id = crypto.randomUUID();
  } catch {
    // Respaldo si crypto.randomUUID no está disponible (contexto no seguro).
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  document.cookie = `${COOKIE_NAV}=${id}; path=/; max-age=${COOKIE_MAXAGE}; SameSite=Lax`;
  return id;
}

/**
 * Hook de preferencias de visualización de un listado, persistidas en BD
 * por usuario + navegador vía /api/vista-prefs/:scope.
 *
 * Gestiona: modo ('tabla' | 'cards'), columnas visibles en tabla, campos
 * visibles en cards, y ordenación (sortBy/sortOrder). Carga al montar (con
 * el fallback que resuelve el backend) y guarda con debounce al cambiar.
 *
 * La PRIMERA vez (sin config previa): modo según el dispositivo (tabla en
 * escritorio, cards en móvil) y las columnas/campos por defecto que pase la
 * pantalla.
 *
 * @param {string} scope  identificador único de la pantalla.
 * @param {object} opts  columnasDefault, camposDefault, sortByDefault,
 *   sortOrderDefault, modoMovil ('cards'), modoEscritorio ('tabla').
 */
export function useVistaPrefs(scope, opts = {}) {
  const {
    columnasDefault = [],
    camposDefault = [],
    sortByDefault = null,
    sortOrderDefault = 'DESC',
    modoMovil = 'cards',
    modoEscritorio = 'tabla',
  } = opts;

  const esMovil = () =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 768px)').matches;

  const modoPorDefecto = () => (esMovil() ? modoMovil : modoEscritorio);

  const [modo, setModo] = useState(modoPorDefecto);
  const [columnas, setColumnas] = useState(columnasDefault);
  const [campos, setCampos] = useState(camposDefault);
  const [sortBy, setSortBy] = useState(sortByDefault);
  const [sortOrder, setSortOrder] = useState(sortOrderDefault);
  const [cargado, setCargado] = useState(false);

  const cargadoRef = useRef(false);
  const guardarTimer = useRef(null);

  // Carga inicial desde BD (el backend aplica el fallback de navegador).
  useEffect(() => {
    let cancelado = false;
    cargadoRef.current = false;
    setCargado(false);
    api.getVistaPrefs(scope, getNavId())
      .then((resp) => {
        if (cancelado) return;
        const cfg = resp && resp.data;
        if (cfg && typeof cfg === 'object') {
          if (cfg.modo === 'tabla' || cfg.modo === 'cards') setModo(cfg.modo);
          if (Array.isArray(cfg.columnas) && cfg.columnas.length) setColumnas(cfg.columnas);
          if (Array.isArray(cfg.campos) && cfg.campos.length) setCampos(cfg.campos);
          if (typeof cfg.sortBy === 'string' || cfg.sortBy === null) setSortBy(cfg.sortBy);
          if (cfg.sortOrder === 'ASC' || cfg.sortOrder === 'DESC') setSortOrder(cfg.sortOrder);
        } else {
          setModo(modoPorDefecto());
        }
      })
      .catch((err) => {
        console.error('[useVistaPrefs] Error cargando preferencias:', err.message);
      })
      .finally(() => {
        if (cancelado) return;
        cargadoRef.current = true;
        setCargado(true);
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Guardado con debounce al cambiar algo (solo tras la carga inicial).
  useEffect(() => {
    if (!cargadoRef.current) return;
    if (guardarTimer.current) clearTimeout(guardarTimer.current);
    guardarTimer.current = setTimeout(() => {
      api.putVistaPrefs(scope, getNavId(), { modo, columnas, campos, sortBy, sortOrder })
        .catch((err) => console.error('[useVistaPrefs] Error guardando preferencias:', err.message));
    }, 600);
    return () => { if (guardarTimer.current) clearTimeout(guardarTimer.current); };
  }, [scope, modo, columnas, campos, sortBy, sortOrder]);

  const setSort = useCallback((key, dir) => {
    setSortBy(key);
    setSortOrder(dir);
  }, []);

  return {
    modo, setModo,
    columnas, setColumnas,
    campos, setCampos,
    sortBy, sortOrder, setSort,
    cargado,
    esMovil: esMovil(),
  };
}
