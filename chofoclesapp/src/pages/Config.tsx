// Config del chofer: interruptores de pasos del viaje (algunos son
// obligatorios y no se pueden desactivar).

import { useEffect, useState } from 'react';
import { api } from '../api';

const PASOS = [
    { codigo: 'aceptar',    label: 'Aceptar pedido',     obligatorio: true  },
    { codigo: 'rechazar',   label: 'Rechazar pedido',    obligatorio: true  },
    { codigo: 'en_camino',  label: 'En camino (a carga / descarga)', obligatorio: false },
    { codigo: 'llegado',    label: 'Llegada a la parada',obligatorio: false },
    { codigo: 'cargado',    label: 'Carga completada',   obligatorio: false },
    { codigo: 'descargado', label: 'Descarga completada',obligatorio: false },
    { codigo: 'terminar',   label: 'Terminar viaje',     obligatorio: true  },
    { codigo: 'cancelar',   label: 'Cancelar viaje',     obligatorio: false },
];

export default function Config({ onVolver }: { onVolver: () => void }) {
    const [pasos, setPasos] = useState<Record<string, boolean>>({});
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.getMisPasos()
            .then((r) => setPasos(r.pasos || {}))
            .catch(() => {
                // Sin config previa: marcamos todos activos.
                const all: Record<string, boolean> = {};
                PASOS.forEach(p => all[p.codigo] = true);
                setPasos(all);
            });
    }, []);

    const guardar = async () => {
        setBusy(true); setError(''); setOkMsg('');
        try {
            // Forzar obligatorios a true.
            const out: Record<string, boolean> = { ...pasos };
            PASOS.forEach(p => { if (p.obligatorio) out[p.codigo] = true; });
            await api.setMisPasos(out);
            setOkMsg('Guardado.');
        } catch (e: any) { setError(e.message); }
        finally { setBusy(false); }
    };

    return (
        <div className="app">
            <div className="brand">
                <h1>Configuración</h1>
                <small>Pasos del viaje</small>
            </div>
            {error && <div className="error">{error}</div>}
            {okMsg && <div className="card" style={{ background: '#e8f5e9' }}>{okMsg}</div>}
            <div className="card">
                {PASOS.map((p) => (
                    <label key={p.codigo} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 0', borderBottom: '1px solid #eee',
                    }}>
                        <input
                            type="checkbox"
                            checked={p.obligatorio || pasos[p.codigo] !== false}
                            disabled={p.obligatorio}
                            onChange={(e) => setPasos({ ...pasos, [p.codigo]: e.target.checked })}
                            style={{ width: 22, height: 22 }}
                        />
                        <div style={{ flex: 1 }}>
                            <strong>{p.label}</strong>
                            {p.obligatorio && <small style={{ color: '#888' }}> (obligatorio)</small>}
                        </div>
                    </label>
                ))}
            </div>
            <button className="btn" style={{ marginTop: 12 }} onClick={guardar} disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button className="btn" style={{ marginTop: 12 }} onClick={onVolver}>← Volver</button>
        </div>
    );
}
