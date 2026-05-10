// Pantalla del viaje en curso. Muestra paradas, estado actual y un botón
// grande "pulsa y habla". La frase reconocida se mapea a un comando del
// backend y se aplica con GPS adjunto.

import { useEffect, useState } from 'react';
import { api, Viaje } from '../api';
import BotonVoz from '../components/BotonVoz';
import { fraseAComando, hablar } from '../lib/voice';
import { obtenerCoords } from '../lib/geo';

export default function ViajeActivo({
    viajeId,
    onVolver,
}: {
    viajeId: number;
    onVolver: () => void;
}) {
    const [viaje, setViaje] = useState<Viaje | null>(null);
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [pasosActivos, setPasosActivos] = useState<Record<string, boolean>>({});
    const [ultimaFrase, setUltimaFrase] = useState('');
    const [ultimoComando, setUltimoComando] = useState('');

    const cargar = async () => {
        try {
            const v = await api.getViaje(viajeId);
            setViaje(v);
        } catch (e: any) { setError(e.message); }
    };

    useEffect(() => {
        cargar();
        api.getMisPasos()
            .then((r) => setPasosActivos(r.pasos || {}))
            .catch(() => { /* sin config previa: todos activos */ });
    }, [viajeId]);

    const aplicarComando = async (comando: string) => {
        if (enviando) return;
        // Aceptar/rechazar/terminar son siempre obligatorios; los demás se
        // pueden haber desactivado en config y se aceptan igualmente vía voz.
        const obligatorios = new Set(['aceptar', 'rechazar', 'terminar']);
        if (!obligatorios.has(comando) && pasosActivos[comando] === false) {
            hablar('Ese paso está desactivado en tu configuración. Lo aplico igualmente.');
        }
        setEnviando(true);
        const gps = await obtenerCoords(4000);
        try {
            await api.enviarComando(viajeId, comando, { gps });
            hablar(_anunciarComando(comando));
            await cargar();
        } catch (e: any) {
            setError(e.message);
            hablar('No he podido aplicarlo. ' + e.message);
        } finally {
            setEnviando(false);
        }
    };

    const handleFrase = (frase: string) => {
        setUltimaFrase(frase);
        const c = fraseAComando(frase);
        setUltimoComando(c || '');
        if (!c) {
            hablar('No entendí. Repite, por favor.');
            return;
        }
        aplicarComando(c);
    };

    if (!viaje) return <div className="app"><p>Cargando viaje…</p></div>;

    return (
        <div className="app">
            <div className="brand">
                <h1>{viaje.referencia_externa}</h1>
                <small>{viaje.estado_nombre || viaje.estado_codigo}</small>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="card" style={{ marginBottom: 12 }}>
                <p><strong>Cliente:</strong> {viaje.cliente_nombre || '—'}</p>
                <p><strong>Mercancía:</strong> {viaje.mercancia_descripcion || '—'}</p>
                <p><strong>De:</strong> {viaje.origen_municipio || '—'}</p>
                <p><strong>A:</strong> {viaje.destino_municipio || '—'}</p>
            </div>

            {viaje.paradas && viaje.paradas.length > 0 && (
                <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ margin: '0 0 8px' }}>Paradas</h3>
                    {viaje.paradas.sort((a, b) => a.orden - b.orden).map((p) => (
                        <div key={p.id} style={{ borderTop: '1px solid #eee', paddingTop: 6, marginTop: 6 }}>
                            <strong>{p.orden}. {p.tipo === 'recogida' ? 'Carga' : 'Descarga'}</strong>
                            {' — '}{p.estado_codigo || '—'}
                            <p style={{ margin: '4px 0', fontSize: 14 }}>
                                {[p.nombre_cliente, p.direccion1, p.poblacion || p.municipio, p.provincia].filter(Boolean).join(', ') || '—'}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            <BotonVoz onResult={handleFrase} disabled={enviando} />

            {ultimaFrase && (
                <div className="card" style={{ marginTop: 12 }}>
                    <p style={{ margin: 0 }}><strong>Tú:</strong> {ultimaFrase}</p>
                    {ultimoComando && <p style={{ margin: 0 }}><strong>Comando:</strong> {ultimoComando}</p>}
                </div>
            )}

            {/* Botones manuales por si la voz falla */}
            <div className="card" style={{ marginTop: 12 }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>
                    Si la voz no funciona, puedes pulsar:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {['aceptar','rechazar','en_camino','llegado','cargado','descargado','terminar','cancelar']
                      .map((c) => (
                        <button
                            key={c} className="btn"
                            style={{ height: 36, fontSize: 13 }}
                            disabled={enviando}
                            onClick={() => aplicarComando(c)}
                        >{c}</button>
                    ))}
                </div>
            </div>

            <button className="btn" style={{ marginTop: 12 }} onClick={onVolver}>← Volver</button>
        </div>
    );
}

function _anunciarComando(c: string): string {
    const m: Record<string, string> = {
        aceptar:    'Pedido aceptado.',
        rechazar:   'Pedido rechazado.',
        en_camino:  'En camino.',
        llegado:    'Llegada registrada.',
        cargado:    'Carga registrada.',
        descargado: 'Descarga registrada.',
        terminar:   'Viaje terminado.',
        cancelar:   'Viaje cancelado.',
    };
    return m[c] || 'Hecho.';
}
