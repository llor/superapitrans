import { createContext, useContext, useState, useEffect } from 'react';
import { api, auth } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => auth.getUser());
  const [loading, setLoading] = useState(false);

  async function login({ empresa_codigo, usuario, password, extra }) {
    setLoading(true);
    try {
      const data = await api.login(usuario, password, empresa_codigo, extra || {});
      auth.setSession(data.token, data.user);
      if (empresa_codigo) auth.setEmpresaCodigo(empresa_codigo);
      setUser(data.user);
      return data;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    auth.clear();
    setUser(null);
  }

  // Nombre de la empresa activa → variable CSS global --empresa-actual, que las
  // cabeceras de los modales muestran (reglas .modal/.ecm-modal/.paradas-modal
  // ::before). Se pide a /me/empresa al haber sesión; se retira al salir.
  useEffect(() => {
    const root = document.documentElement;
    if (!user) { root.style.removeProperty('--empresa-actual'); return; }
    let cancelled = false;
    api.me.getEmpresa()
      .then((emp) => {
        if (!cancelled && emp && emp.nombre) {
          root.style.setProperty('--empresa-actual', JSON.stringify(emp.nombre));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
