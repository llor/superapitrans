import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import './Pedidos.css';

// Placeholder: en el siguiente paso de la Tarea 1 se clona aquí el visor
// completo del admin (admin.saycusoft.es/panel/src/pages/DatosPasarela.jsx)
// sin el botón "?" del resumen de proveedores y sin el selector "Cliente
// Saycu" (ya viene fijo del JWT). Por ahora muestra empresa + un primer
// listado básico de pedidos para verificar end-to-end.
export default function Pedidos() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.me.listPedidos({ page: 1, limit: 20 })
      .then((r) => {
        if (cancelled) return;
        setPedidos(r.data || []);
        setPagination(r.pagination || pagination);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Error cargando pedidos');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="ped-page">
      <header className="ped-header">
        <div className="ped-header__left">
          <div className="ped-title">Pasarela de datos</div>
          <div className="ped-sub">
            {user?.empresa_codigo || '—'}
            {user?.login && <span> · {user.login}</span>}
          </div>
        </div>
        <button type="button" className="ped-logout" onClick={onLogout}>Cerrar sesión</button>
      </header>

      <main className="ped-main">
        {error && <div className="ped-error">{error}</div>}
        {loading && <div className="ped-loading">Cargando pedidos…</div>}
        {!loading && !error && pedidos.length === 0 && (
          <div className="ped-empty">No hay pedidos sincronizados todavía para tu empresa.</div>
        )}
        {!loading && !error && pedidos.length > 0 && (
          <ul className="ped-list">
            {pedidos.map((p) => (
              <li key={p.id} className="ped-row">
                <div className="ped-row__main">
                  <strong>{p.numero_pedido || p.id_ruta_externa || `#${p.id}`}</strong>
                  <span className="ped-row__chip">{p.tipo === 'ALBARAN' ? 'Terminado' : 'Pendiente'}</span>
                </div>
                <div className="ped-row__meta">
                  {p.fecha_reparto && <span>📅 {p.fecha_reparto.slice(0, 10)}</span>}
                  {p.origen_municipio && <span>🅰️ {p.origen_municipio}</span>}
                  {p.destino_municipio && <span>🅱️ {p.destino_municipio}</span>}
                  {p.proveedor_codigo && <span className="ped-row__prov">{p.proveedor_codigo}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {pagination?.total > 0 && (
          <div className="ped-pagination">
            {pagination.total} pedido(s) · página {pagination.page} de {pagination.totalPages || 1}
          </div>
        )}
      </main>
    </div>
  );
}
