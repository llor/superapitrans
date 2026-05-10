import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarViajes } from '../services/api';

export default function ListaViajes() {
    const [viajes, setViajes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelado = false;
        listarViajes()
            .then(rows => { if (!cancelado) setViajes(rows); })
            .catch(err => { if (!cancelado) setError(err.message); })
            .finally(() => { if (!cancelado) setLoading(false); });
        return () => { cancelado = true; };
    }, []);

    if (loading) return <p>Cargando viajes…</p>;
    if (error) return <p className="error">Error: {error}</p>;
    if (!viajes.length) return <p>No hay viajes asignados todavía.</p>;

    return (
        <div className="lista-viajes">
            <h2>Mis viajes</h2>
            <div className="card-list">
                {viajes.map(v => (
                    <Link key={v.id} to={`/viajes/${v.id}`} className="card">
                        <div className="card-header">
                            <span className="card-title">{v.referencia_externa}</span>
                            <span className={`badge badge-estado-${v.estado_codigo}`}>
                                {v.estado_nombre}
                            </span>
                        </div>
                        <div className="card-body">
                            <div><strong>Cliente:</strong> {v.cliente_nombre || '—'}</div>
                            <div><strong>Mercancía:</strong> {v.mercancia_descripcion || '—'}</div>
                            <div>
                                <strong>{v.origen_municipio || '—'}</strong>
                                {' → '}
                                <strong>{v.destino_municipio || '—'}</strong>
                            </div>
                            <div className="card-footer">
                                <span>{v.fecha}</span>
                                {v.precio != null && <span>{v.precio} €</span>}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
