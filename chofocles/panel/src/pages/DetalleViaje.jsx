import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { detalleViaje } from '../services/api';

export default function DetalleViaje() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelado = false;
        detalleViaje(id)
            .then(d => { if (!cancelado) setData(d); })
            .catch(err => { if (!cancelado) setError(err.message); })
            .finally(() => { if (!cancelado) setLoading(false); });
        return () => { cancelado = true; };
    }, [id]);

    if (loading) return <p>Cargando…</p>;
    if (error) return <p className="error">Error: {error}</p>;
    if (!data) return <p>Sin datos.</p>;

    const { viaje, paradas } = data;

    return (
        <div className="detalle-viaje">
            <div className="page-header">
                <Link to="/viajes" className="link-back">‹ Volver</Link>
                <h2>Viaje {viaje.referencia_externa}</h2>
                <span className={`badge badge-estado-${viaje.estado_codigo}`}>
                    {viaje.estado_nombre}
                </span>
            </div>

            <section className="card">
                <h3>Cabecera</h3>
                <dl>
                    <dt>Cliente</dt><dd>{viaje.cliente_nombre || '—'}</dd>
                    <dt>Mercancía</dt><dd>{viaje.mercancia_descripcion || '—'}</dd>
                    <dt>Fecha</dt><dd>{viaje.fecha}</dd>
                    <dt>Precio</dt><dd>{viaje.precio != null ? `${viaje.precio} €` : '—'}</dd>
                    <dt>Origen</dt><dd>{viaje.origen_municipio} — {viaje.origen_direccion1}</dd>
                    <dt>Destino</dt><dd>{viaje.destino_municipio} — {viaje.destino_direccion1}</dd>
                </dl>
            </section>

            <section className="card">
                <h3>Paradas ({paradas.length})</h3>
                <div className="paradas-list">
                    {paradas.map(p => (
                        <div key={p.id} className={`parada parada-${p.tipo}`}>
                            <div className="parada-head">
                                <span className="parada-orden">{p.orden}</span>
                                <span className="parada-tipo">{p.tipo === 'recogida' ? 'Carga' : 'Descarga'}</span>
                                <span className={`badge badge-estado-${p.estado_codigo}`}>
                                    {p.estado_nombre}
                                </span>
                            </div>
                            <div className="parada-body">
                                <div><strong>{p.nombre_cliente || '—'}</strong></div>
                                <div>{p.direccion1}{p.codigo_postal ? `, ${p.codigo_postal}` : ''}</div>
                                <div>{p.poblacion} {p.provincia ? `(${p.provincia})` : ''}</div>
                                {p.contacto && <div>Contacto: {p.contacto} {p.telefono ? `· ${p.telefono}` : ''}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
