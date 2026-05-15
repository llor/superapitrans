/**
 * Servicio de almacenamiento de filtros por usuario
 */

const FILTERS_PREFIX = 'saycu:panel-admin:filters';
const EMPRESA_PREFIX = 'saycu:panel-admin:empresa';

export const getUserFilters = (userId, scope) => {
  if (!userId || !scope) return null;
  const key = `${FILTERS_PREFIX}:${userId}:${scope}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
};

export const setUserFilters = (userId, scope, data) => {
  if (!userId) throw new Error('userId requerido para guardar filtros');
  if (!scope) throw new Error('scope requerido para guardar filtros');
  const key = `${FILTERS_PREFIX}:${userId}:${scope}`;
  localStorage.setItem(key, JSON.stringify(data));
};

export const getUserEmpresaSelection = (userId) => {
  if (!userId) return null;
  const key = `${EMPRESA_PREFIX}:${userId}`;
  const value = localStorage.getItem(key);
  return value || null;
};

export const setUserEmpresaSelection = (userId, empresaCodigo) => {
  if (!userId) throw new Error('userId requerido para guardar empresa');
  const key = `${EMPRESA_PREFIX}:${userId}`;
  if (empresaCodigo) {
    localStorage.setItem(key, empresaCodigo);
  } else {
    localStorage.removeItem(key);
  }
};
