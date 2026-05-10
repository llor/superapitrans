// Flash visual a pantalla completa para anunciar pedido nuevo.
// Se activa por unos segundos cuando llega push o cuando queremos.

import { useEffect } from 'react';

export default function AvisoLuminoso({
    activo,
    onClose,
    duracionMs = 4000,
    color = '#ffeb3b',
}: {
    activo: boolean;
    onClose: () => void;
    duracionMs?: number;
    color?: string;
}) {
    useEffect(() => {
        if (!activo) return;
        const t = setTimeout(onClose, duracionMs);
        return () => clearTimeout(t);
    }, [activo, duracionMs, onClose]);

    if (!activo) return null;
    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: color,
                animation: 'flashLum 0.5s ease-in-out infinite alternate',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 900, color: '#000',
                cursor: 'pointer',
            }}
        >
            ¡PEDIDO NUEVO!
            <style>{`@keyframes flashLum {
                from { background: ${color}; }
                to   { background: #ffffff; }
            }`}</style>
        </div>
    );
}
