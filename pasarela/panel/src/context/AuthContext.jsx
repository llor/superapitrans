import { createContext, useContext, useState } from 'react';
import { api, auth } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => auth.getUser());
  const [loading, setLoading] = useState(false);

  async function login({ empresa_codigo, usuario, password }) {
    setLoading(true);
    try {
      const data = await api.login(usuario, password, empresa_codigo);
      auth.setSession(data.token, data.user);
      if (empresa_codigo) auth.setEmpresaCodigo(empresa_codigo);
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    auth.clear();
    setUser(null);
  }

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
