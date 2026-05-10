import { useEffect, useState } from 'react';
import { api } from './api';
import { registrarPush } from './lib/push';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ViajeActivo from './pages/ViajeActivo';
import Config from './pages/Config';

type Pagina =
    | { name: 'dashboard' }
    | { name: 'viaje'; id: number }
    | { name: 'config' };

export default function App() {
    const [user, setUser] = useState<any>(null);
    const [page, setPage] = useState<Pagina>({ name: 'dashboard' });
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        (async () => {
            const u = await api.getUser();
            setUser(u);
            setCargando(false);
            if (u) registrarPush().catch(() => {});
        })();
    }, []);

    if (cargando) return <div className="app"><p>Cargando…</p></div>;
    if (!user) {
        return <Login onLogin={(u) => {
            setUser(u);
            registrarPush().catch(() => {});
        }} />;
    }

    if (page.name === 'viaje') {
        return <ViajeActivo viajeId={page.id} onVolver={() => setPage({ name: 'dashboard' })} />;
    }
    if (page.name === 'config') {
        return <Config onVolver={() => setPage({ name: 'dashboard' })} />;
    }
    return (
        <>
            <Dashboard
                user={user}
                onLogout={async () => { await api.logout(); setUser(null); }}
                onAbrirViaje={(id) => setPage({ name: 'viaje', id })}
            />
            <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100 }}>
                <button className="btn" style={{ width: 'auto', padding: '10px 16px' }}
                        onClick={() => setPage({ name: 'config' })}>
                    Configuración
                </button>
            </div>
        </>
    );
}
