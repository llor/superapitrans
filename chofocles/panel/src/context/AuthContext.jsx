import { createContext, useContext, useEffect, useState } from 'react';
import { getStoredUser, isAuthenticated, login as apiLogin, logout as apiLogout } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(getStoredUser);
    const [loading, setLoading] = useState(false);

    async function login(payload) {
        setLoading(true);
        try {
            const u = await apiLogin(payload);
            setUser(u);
            return u;
        } finally {
            setLoading(false);
        }
    }

    async function logout() {
        await apiLogout();
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user || isAuthenticated() }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth fuera de AuthProvider');
    return ctx;
}
