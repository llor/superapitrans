// Botón grande "pulsa y habla". Al tocarlo (mousedown/touchstart) abre
// reconocimiento; al soltarlo (mouseup/touchend) cierra y entrega el
// transcript final al callback.
//
// onResult recibe la frase completa final (ya sin parciales).

import { useEffect, useRef, useState } from 'react';
import { escucharPulsando, isVoiceRecognitionSupported, EscuchaHandle } from '../lib/voice';

export default function BotonVoz({
    onResult,
    label = 'PULSA Y HABLA',
    disabled = false,
}: {
    onResult: (frase: string) => void;
    label?: string;
    disabled?: boolean;
}) {
    const [activo, setActivo] = useState(false);
    const [parcial, setParcial] = useState('');
    const [error, setError] = useState('');
    const handleRef = useRef<EscuchaHandle | null>(null);
    const finalRef = useRef('');

    useEffect(() => () => { handleRef.current?.stop(); }, []);

    if (!isVoiceRecognitionSupported()) {
        return (
            <div className="error" style={{ marginTop: 12 }}>
                Reconocimiento de voz no disponible en este dispositivo.
            </div>
        );
    }

    const start = () => {
        if (disabled || activo) return;
        setError(''); setParcial(''); finalRef.current = '';
        const h = escucharPulsando({
            onTranscript: (texto, isFinal) => {
                if (isFinal) finalRef.current = (finalRef.current + ' ' + texto).trim();
                else         setParcial(texto);
            },
            onError: (e) => setError(e),
            onEnd: () => {
                setActivo(false); setParcial('');
                const f = finalRef.current.trim();
                if (f) onResult(f);
            },
        });
        if (h) { handleRef.current = h; setActivo(true); }
    };
    const stop = () => {
        if (!activo) return;
        handleRef.current?.stop();
        handleRef.current = null;
    };

    return (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
                type="button"
                disabled={disabled}
                onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
                onTouchStart={(e) => { e.preventDefault(); start(); }}
                onTouchEnd={stop} onTouchCancel={stop}
                aria-pressed={activo}
                style={{
                    width: 180, height: 180, borderRadius: '50%',
                    fontSize: 16, fontWeight: 800,
                    border: '3px solid ' + (activo ? '#c62828' : '#2554c0'),
                    color: activo ? '#fff' : '#2554c0',
                    background: activo ? '#c62828' : '#fff',
                    boxShadow: activo
                        ? '0 0 0 8px rgba(198,40,40,0.18), 0 4px 12px rgba(0,0,0,0.2)'
                        : '0 4px 12px rgba(0,0,0,0.12)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    userSelect: 'none', touchAction: 'manipulation',
                }}
            >
                {activo ? 'ESCUCHANDO…' : label}
            </button>
            {parcial && <p style={{ marginTop: 10, fontStyle: 'italic', color: '#666' }}>{parcial}</p>}
            {error && <p style={{ marginTop: 10, color: '#c62828' }}>{error}</p>}
        </div>
    );
}
