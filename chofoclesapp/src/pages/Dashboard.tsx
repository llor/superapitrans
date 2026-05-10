import { useEffect, useRef, useState } from 'react';
import { api, Viaje } from '../api';
import { hablar } from '../lib/voice';
import AvisoLuminoso from '../components/AvisoLuminoso';

export default function Dashboard({
    user,
    onLogout,
    onAbrirViaje,
}: {
    user: any;
    onLogout: () => void;
    onAbrirViaje: (viajeId: number) => void;
}) {
    const [viajes, setViajes] = useState<Viaje[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState(false);
    const idsConocidos = useRef<Set<number>>(new Set());

    const cargar = async (anuncio: boolean) => {
        try {
            const r = await api.listarViajes();
            const items = r.data?.viajes || [];
            const nuevos = items.filter(v => !idsConocidos.current.has(v.id));
            items.forEach(v => idsConocidos.current.add(v.id));
            setViajes(items);
            if (anuncio && nuevos.length > 0) {
                setAviso(true);
                hablar(`Tienes ${nuevos.length} pedido${nuevos.length > 1 ? 's' : ''} nuevo${nuevos.length > 1 ? 's' : ''}.`);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargar(false);
        const t = setInterval(() => cargar(true), 30000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="app">
            <AvisoLuminoso activo={aviso} onClose={() => setAviso(false)} />
            <div className="brand">
                <h1>Chofocles</h1>
                <small>{user.nombre} · {user.empresa}</small>
            </div>
            <div className="card" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={onLogout}>Salir</button>
                <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => cargar(true)}>Actualizar</button>
            </div>
            {error && <div className="error">{error}</div>}
            <h3>Pedidos</h3>
            {loading ? <p>Cargando…</p> : viajes.length === 0 ? (
                <p style={{ color: '#888' }}>No hay pedidos pendientes.</p>
            ) : (
                viajes.map((v) => (
                    <div key={v.id} className="viaje" onClick={() => onAbrirViaje(v.id)} style={{ cursor: 'pointer' }}>
                        <h3>{v.referencia_externa}</h3>
                        <p><strong>De:</strong> {v.origen_municipio || '—'}</p>
                        <p><strong>A:</strong> {v.destino_municipio || '—'}</p>
                        <p><strong>Estado:</strong> {v.estado_nombre || v.estado_codigo || '—'}</p>
                    </div>
                ))
            )}
        </div>
    );
}
