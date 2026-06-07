// UpdateBanner — componente canónico de aviso de actualización (Capacitor).
//
// Modal NO BLOQUEANTE (decisión 5 del GUION de ControlGlobal: solo avisa).
// El usuario siempre puede pulsar "Más tarde" y seguir usando la app.

export default function UpdateBanner({ info, onClose, appLabel = 'Esta aplicación' }) {
  if (!info || !info.update_available || !info.latest) return null;

  const { latest, update_required } = info;

  function actualizar() {
    if (latest.download_url) {
      window.open(latest.download_url, '_blank', 'noopener');
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 92vw)',
          background: 'var(--bg-card, #fff)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle, #e5e7eb)',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle, #e5e7eb)', background: update_required ? 'var(--feedback-warning-bg, #fff8e1)' : 'var(--bg-card, #fff)' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>
            {update_required ? 'Actualización necesaria' : 'Actualización disponible'}
          </h3>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ margin: 0, marginBottom: 12, lineHeight: 1.5 }}>
            Esta versión dejará de funcionar en breve. Por favor, actualiza a la última versión
            {latest.version_name && <> (<b>{latest.version_name}</b>)</>}.
          </p>
          {latest.download_url && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #6b7280)', wordBreak: 'break-all' }}>
              {latest.download_url}
            </p>
          )}
          {latest.release_notes && (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-secondary, #6b7280)', margin: '8px 0 0', maxHeight: 120, overflow: 'auto' }}>
              {latest.release_notes}
            </pre>
          )}
        </div>
        <div style={{ padding: 12, display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-subtle, #e5e7eb)' }}>
          <button className="btn-secondary" onClick={onClose}>Más tarde</button>
          <button className="btn-primary" onClick={actualizar} disabled={!latest.download_url}>
            Actualizar ahora
          </button>
        </div>
      </div>
    </div>
  );
}
