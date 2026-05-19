/**
 * Pedidos — visor de pedidos canónicos del N2 (panel web).
 *
 * Clonado de admin.saycusoft.es/panel/src/pages/DatosPasarela.jsx con las
 * adaptaciones que pidió el usuario:
 *   - SIN botón "?" del resumen de proveedores.
 *   - SIN selector "Cliente Saycu" (el tenant lo determina el JWT).
 *   - SIN el panel "qué obtenemos de cada proveedor" (era explicativo del
 *     admin para auditar, no procede en el panel del N2).
 *
 * Resto (cards, filtros, búsqueda, paginación, modal detalle con paradas /
 * albaranes / pcs_extra) idéntico, contra los endpoints /api/me/pedidos[/{id}]
 * del pasarela_api que ya fuerzan la empresa del token.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import {
  IoServerOutline,
  IoSearchOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoRefreshOutline,
  IoLogOutOutline,
  IoGridOutline,
  IoListOutline,
  IoTrashOutline,
} from 'react-icons/io5';
import { getUserFilters, setUserFilters } from '../services/filterStorage.js';
import DataCards from '../components/DataCards.jsx';
import PedidosTable from '../components/PedidosTable.jsx';
import EditColumnasModal from '../components/EditColumnasModal.jsx';
import { COLUMNAS_DEFAULT } from '../services/pedidosColumnas.js';
import { gray400, gray500 } from 'saycu-theme/colors.js';
import './Logs.css';
import './Pedidos.css';

export default function Pedidos() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const filtersLoadedRef = useRef(false);
  const abortRef = useRef(null);
  const lastSignatureRef = useRef('');

  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [filtroProveedor, setFiltroProveedor] = useState('todos');
  const [filtroCliente, setFiltroCliente] = useState('todos');
  const [filtroDelegacion, setFiltroDelegacion] = useState('todas');
  const [busqueda, setBusqueda] = useState('');

  // Modo de visualización + columnas visibles + orden (modo tabla).
  // Se persisten en localStorage por usuario.
  const [vistaTabla, setVistaTabla] = useState(false);
  const [columnasVisibles, setColumnasVisibles] = useState(COLUMNAS_DEFAULT);
  const [editColAbierto, setEditColAbierto] = useState(false);
  const [sortBy, setSortBy] = useState('fecha_reparto');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [showParadas, setShowParadas] = useState(false);
  const [verParadasModal, setVerParadasModal] = useState(false);
  const [pedidoSel, setPedidoSel] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState(null);

  // Cargar filtros y preferencias de vista guardadas (por usuario + página)
  useEffect(() => {
    if (!user?.id) return;
    const stored = getUserFilters(user.id, 'pasarela-panel-pedidos');
    if (stored) {
      if (stored.filtroEstado) setFiltroEstado(stored.filtroEstado);
      if (stored.filtroProveedor) setFiltroProveedor(stored.filtroProveedor);
      if (stored.filtroCliente) setFiltroCliente(stored.filtroCliente);
      if (stored.filtroDelegacion) setFiltroDelegacion(stored.filtroDelegacion);
      if (stored.busqueda !== undefined) setBusqueda(stored.busqueda);
      if (stored.limit) setPagination((p) => ({ ...p, limit: stored.limit }));
      if (typeof stored.vistaTabla === 'boolean') setVistaTabla(stored.vistaTabla);
      if (Array.isArray(stored.columnasVisibles) && stored.columnasVisibles.length > 0) {
        setColumnasVisibles(stored.columnasVisibles);
      }
      if (typeof stored.sortBy === 'string') setSortBy(stored.sortBy);
      if (stored.sortOrder === 'ASC' || stored.sortOrder === 'DESC') setSortOrder(stored.sortOrder);
    }
    filtersLoadedRef.current = true;
  }, [user?.id]);

  // Persistir filtros + preferencias de vista
  useEffect(() => {
    if (!user?.id || !filtersLoadedRef.current) return;
    setUserFilters(user.id, 'pasarela-panel-pedidos', {
      filtroEstado, filtroProveedor, filtroCliente, filtroDelegacion,
      busqueda, limit: pagination.limit,
      vistaTabla, columnasVisibles, sortBy, sortOrder,
    });
  }, [user?.id, filtroEstado, filtroProveedor, filtroCliente, filtroDelegacion,
      busqueda, pagination.limit, vistaTabla, columnasVisibles, sortBy, sortOrder]);

  const limpiarFiltros = () => {
    setFiltroEstado('TODOS');
    setFiltroProveedor('todos');
    setFiltroCliente('todos');
    setFiltroDelegacion('todas');
    setBusqueda('');
  };

  const applyResponse = useCallback((response) => {
    const items = response.data || [];
    const nextPagination = response.pagination || {};
    const signature = JSON.stringify({ items, pagination: nextPagination });
    if (signature !== lastSignatureRef.current) {
      setPedidos(items);
      setPagination((p) => ({ ...p, ...nextPagination }));
      lastSignatureRef.current = signature;
    }
  }, []);

  const cargarPedidos = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      const params = { page: pagination.page, limit: pagination.limit, sortBy, sortOrder };
      if (filtroEstado && filtroEstado !== 'TODOS') params.estado = filtroEstado;
      if (filtroProveedor && filtroProveedor !== 'todos') params.proveedor = filtroProveedor;
      if (filtroCliente && filtroCliente !== 'todos') params.cliente = filtroCliente;
      if (filtroDelegacion && filtroDelegacion !== 'todas') params.delegacion = filtroDelegacion;
      if (busqueda.trim()) params.q = busqueda.trim();

      const response = await api.me.listPedidos(params);
      applyResponse(response);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Pedidos] Error cargando:', err);
        setError(err.message || 'Error cargando pedidos');
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filtroEstado, filtroProveedor, filtroCliente, filtroDelegacion, busqueda, sortBy, sortOrder, applyResponse]);

  useEffect(() => {
    if (filtersLoadedRef.current) cargarPedidos();
  }, [cargarPedidos]);

  // Reset página al cambiar filtros
  useEffect(() => {
    setPagination((p) => ({ ...p, page: 1 }));
  }, [filtroEstado, filtroProveedor, filtroCliente, filtroDelegacion, busqueda]);

  const proveedoresDisponibles = Array.from(
    new Set(pedidos.map((p) => p.proveedor_codigo).filter(Boolean))
  ).sort();

  const clientesDisponibles = Array.from(
    new Set(pedidos.map((p) => p.tercero_codigo).filter(Boolean))
  ).sort();

  const delegacionesDisponibles = Array.from(
    new Set(pedidos.map((p) => p.delegacion_codigo).filter(Boolean))
  ).sort();

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const fila = (label, value) => {
    if (value === null || value === undefined || value === '' || value === '—') return null;
    return <div><strong>{label}:</strong> {value}</div>;
  };

  const irAPagina = (n) => setPagination((p) => ({ ...p, page: n }));
  const irAPaginaSegura = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return;
    const tot = pagination.totalPages || 1;
    irAPagina(Math.min(Math.max(1, n), tot));
  };

  const renderPagination = (label) => {
    if (!pagination || pagination.totalPages <= 1) return null;
    return (
      <div className="logs-pagination" aria-label={label}>
        <span className="pagination-info">
          Página {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
        </span>
        <div className="pagination-actions">
          <button className="btn-page" disabled={pagination.page <= 1} onClick={() => irAPagina(1)} title="Primera página">«</button>
          <button className="btn-page" disabled={pagination.page <= 1} onClick={() => irAPagina(pagination.page - 1)} title="Página anterior"><IoChevronBackOutline /></button>
          <input
            className="page-input" type="number" min={1} max={pagination.totalPages}
            value={pagination.page}
            onChange={(e) => irAPaginaSegura(e.target.value)}
            aria-label="Ir a página" title="Ir a página"
          />
          <button className="btn-page" disabled={pagination.page >= pagination.totalPages} onClick={() => irAPagina(pagination.page + 1)} title="Página siguiente"><IoChevronForwardOutline /></button>
          <button className="btn-page" disabled={pagination.page >= pagination.totalPages} onClick={() => irAPagina(pagination.totalPages)} title="Última página">»</button>
        </div>
      </div>
    );
  };

  const abrirParadas = async (pedido, event) => {
    if (event) event.stopPropagation();
    setShowParadas(true);
    setVerParadasModal(false);
    setPedidoSel(pedido);
    setDetalle(null);
    setErrorDetalle(null);
    setLoadingDetalle(true);
    try {
      const response = await api.me.getPedido(pedido.id);
      setDetalle(response.data);
    } catch (err) {
      setErrorDetalle(err.message || 'Error cargando detalle');
    } finally {
      setLoadingDetalle(false);
    }
  };

  const cerrarParadas = () => {
    setShowParadas(false);
    setVerParadasModal(false);
    setPedidoSel(null);
    setDetalle(null);
    setErrorDetalle(null);
  };

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="logs-page">
      <div className="logs-header">
        <h1>
          <IoServerOutline className="page-icon" />
          Pasarela de datos · {user?.empresa_codigo || '—'}
        </h1>
        <button
          className="btn-refresh"
          onClick={() => setVistaTabla((v) => !v)}
          title={vistaTabla ? 'Cambiar a modo cards' : 'Cambiar a modo tabla'}
          aria-label={vistaTabla ? 'Modo cards' : 'Modo tabla'}
        >
          {vistaTabla ? <IoGridOutline /> : <IoListOutline />}
          {vistaTabla ? 'Cards' : 'Tabla'}
        </button>
        <button className="btn-refresh" onClick={() => cargarPedidos()} disabled={loading}>
          <IoRefreshOutline className={loading ? 'spin' : ''} />
          Actualizar
        </button>
        <button className="btn-refresh" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
          <IoLogOutOutline />
          Salir
        </button>
      </div>

      <div className="dp-toolbar">
        <div className="logs-search">
          <IoSearchOutline className="search-icon" />
          <input
            type="text"
            placeholder="Buscar (pedido, ruta, cliente, tercero, matrícula, chofer)..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="dp-selects">
          <label className="toolbar-label">
            Estado
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="PROCESADO">Procesados</option>
              <option value="TERMINADO">Terminados</option>
            </select>
          </label>

          <label className="toolbar-label">
            Proveedor
            <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)}>
              <option value="todos">Todos</option>
              {proveedoresDisponibles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          <label className="toolbar-label">
            <span className="dp-label-with-info">Tercero<span className="dp-info-i" data-tooltip="Quien contrata y paga el viaje al transportista (naviera, operador logístico…)." aria-label="¿Qué es Tercero?" tabIndex="0">i</span></span>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
              <option value="todos">Todos</option>
              {clientesDisponibles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="toolbar-label">
            Delegación
            <select value={filtroDelegacion} onChange={(e) => setFiltroDelegacion(e.target.value)}>
              <option value="todas">Todas</option>
              {delegacionesDisponibles.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label className="toolbar-label">
            Por página
            <select
              value={pagination.limit}
              onChange={(e) => setPagination((p) => ({ ...p, limit: parseInt(e.target.value, 10), page: 1 }))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <button
            type="button"
            className="dp-clear-filters"
            onClick={limpiarFiltros}
            title="Limpiar filtros"
            aria-label="Limpiar filtros"
          >
            <IoTrashOutline /> Limpiar filtros
          </button>
        </div>
      </div>

      <div className="dp-results">
        {error && <div className="logs-error">{error}</div>}

        {renderPagination('Paginación superior')}

        <div className="logs-table-container">
          {loading && pedidos.length === 0 ? (
            <div className="logs-loading">Cargando pedidos...</div>
          ) : pedidos.length === 0 ? (
            <div className="logs-empty">
              <IoServerOutline />
              <p>No hay pedidos</p>
              <span>Aún no se ha sincronizado ningún pedido para tu empresa</span>
            </div>
          ) : vistaTabla ? (
            <PedidosTable
              pedidos={pedidos}
              columnas={columnasVisibles}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(key, dir) => { setSortBy(key); setSortOrder(dir); }}
              onEditarColumnas={() => setEditColAbierto(true)}
              onRowClick={(p) => abrirParadas(p)}
            />
          ) : (
            <DataCards
              items={pedidos}
              emptyText="No hay pedidos"
              onCardClick={(p) => abrirParadas(p)}
              bandRender={(p) => {
                if (p.tipo === 'ALBARAN') {
                  return <div className="dc-card__strip dc-card__strip--green">Terminado</div>;
                }
                if (p.tipo === 'PEDIDO') {
                  return <div className="dc-card__strip dc-card__strip--red">Pendiente</div>;
                }
                return null;
              }}
              columns={[
                { label: 'Pedido', primary: true, render: (p) => (
                  <strong>{p.numero_pedido || p.id_ruta_externa || `#${p.id}`}</strong>
                )},
                { label: 'Paradas', actions: true, render: (p) => (
                  <span className={`dc-badge ${p.paradas_count > 0 ? 'dc-badge--blue' : 'dc-badge--gray'}`}>
                    {p.paradas_count || 0}
                  </span>
                )},
                { label: 'Fecha', render: (p) => formatDate(p.fecha_reparto || p.fecha_plan) },
                { label: 'Origen', render: (p) => p.origen_municipio || <span style={{ color: gray400 }}>—</span> },
                { label: 'Destino', render: (p) => p.destino_municipio || <span style={{ color: gray400 }}>—</span> },
                { label: 'Tercero', render: (p) => p.tercero_codigo || <span style={{ color: gray400 }}>—</span> },
                { label: 'Matrícula', render: (p) => (
                  <span>
                    {p.matricula_tractor || '—'}
                    {p.matricula_remolque && <small style={{ color: gray400 }}> · {p.matricula_remolque}</small>}
                  </span>
                )},
                { label: 'Albaranes', render: (p) => p.albaranes_count || 0 },
                { label: 'Terminal devolución', render: (p) => {
                  if (p.proveedor_codigo !== 'pcs-valencia') return <span style={{ color: gray400 }}>—</span>;
                  return p.terminal_devolucion
                    ? <span className="dc-badge dc-badge--green" title="El DUT trae <AcceptanceCompany>: el chofer sabe dónde devolver el contenedor vacío.">Indicada</span>
                    : <span className="dc-badge dc-badge--gray" title="El DUT no incluye Orden de Entrega: el puerto no ha enviado la organización de admisión del vacío.">No indicada</span>;
                }},
                { label: 'Estado', render: (p) => (
                  <span
                    className={`dc-badge ${p.estado === 'PROCESADO' ? 'dc-badge--green' : 'dc-badge--yellow'}`}
                    title="Procesamiento por el ERP del cliente vía API marcar-procesado. No es el estado real del transporte (eso lo indica la banda superior del card)."
                  >
                    {p.estado || '—'}
                  </span>
                )},
                { label: 'Proveedor', render: (p) => p.proveedor_codigo || <span style={{ color: gray400 }}>—</span> },
              ]}
            />
          )}

          {renderPagination('Paginación inferior')}
        </div>
      </div>

      {editColAbierto && (
        <EditColumnasModal
          columnas={columnasVisibles}
          onChange={setColumnasVisibles}
          onClose={() => setEditColAbierto(false)}
        />
      )}

      {showParadas && (
        <div className="paradas-modal-overlay" onClick={cerrarParadas}>
          <div className="paradas-modal" onClick={(e) => e.stopPropagation()}>
            <div className="paradas-modal-header">
              <h3>Detalle del pedido</h3>
              <button className="paradas-close" onClick={cerrarParadas} type="button">Cerrar</button>
            </div>

            {pedidoSel && (
              <div className="paradas-modal-subtitle">
                {pedidoSel.numero_pedido || pedidoSel.id_ruta_externa || `#${pedidoSel.id}`}
                {pedidoSel.proveedor_codigo && (
                  <span style={{ color: gray500, marginLeft: 8 }}>· {pedidoSel.proveedor_codigo}</span>
                )}
              </div>
            )}

            {loadingDetalle && <div className="paradas-loading">Cargando detalle...</div>}
            {!loadingDetalle && errorDetalle && <div className="paradas-error">{errorDetalle}</div>}

            {!loadingDetalle && !errorDetalle && detalle && (() => {
              const ped = detalle.pedido;
              const albs = detalle.albaranes || [];
              const pars = detalle.paradas || [];
              return (
                <>
                  {/* IDENTIFICACIÓN */}
                  <div className="parada-item">
                    <div className="parada-title"><span className="parada-tipo">IDENTIFICACIÓN</span></div>
                    <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {fila('ID interno', `#${ped.id}`)}
                      {fila('Proveedor', ped.proveedor_codigo)}
                      {fila('ID en proveedor (publication)', ped.proveedor_publication_id)}
                      {fila('ID ruta externa', ped.id_ruta_externa)}
                      {fila('ID viaje (Satelles)', ped.id_viaje)}
                      {fila('Nº pedido', ped.numero_pedido)}
                      {fila('Tipo', ped.tipo)}
                      {fila('Estado', ped.estado)}
                      {fila('Origen del dato', ped.origen)}
                      {fila('Creado', formatDateTime(ped.created_at))}
                      {fila('Actualizado', formatDateTime(ped.updated_at))}
                    </div>
                  </div>

                  {/* CLIENTE / TERCERO */}
                  <div className="parada-item">
                    <div className="parada-title"><span className="parada-tipo">PARTES</span></div>
                    <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {fila('Cliente Saycu (tenant)', ped.cliente_codigo)}
                      {fila('Cliente CIF', ped.cliente_cif)}
                      {fila('Tercero', ped.tercero_codigo)}
                      {fila('CIF del tercero', ped.tercero_cif)}
                      {fila('Delegación', ped.delegacion_codigo)}
                    </div>
                  </div>

                  {/* DOCUMENTOS (BL, expediente, operación) — solo si hay datos */}
                  {(ped.bl_numero || ped.expediente_transitario || ped.operacion_tipo) && (
                    <div className="parada-item">
                      <div className="parada-title"><span className="parada-tipo">DOCUMENTOS</span></div>
                      <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {fila('Nº BL (Bill of Lading)', ped.bl_numero)}
                        {fila('Expediente transitario', ped.expediente_transitario)}
                        {fila('Operación', ped.operacion_tipo)}
                      </div>
                    </div>
                  )}

                  {/* TRANSPORTE */}
                  <div className="parada-item">
                    <div className="parada-title"><span className="parada-tipo">TRANSPORTE</span></div>
                    <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      {fila('Matrícula tractor', ped.matricula_tractor)}
                      {fila('Matrícula remolque', ped.matricula_remolque)}
                      {fila('Matrícula contenedor', ped.matricula_contenedor)}
                      {fila('Chofer principal', ped.chofer_principal_codigo)}
                      {fila('CIF chofer principal', ped.chofer_principal_cif)}
                      {fila('Chofer secundario', ped.chofer_secundario_codigo)}
                      {fila('CIF chofer secundario', ped.chofer_secundario_cif)}
                      {fila('Email chofer', ped.email_chofer)}
                      {fila('Email remitente', ped.email_remitente)}
                      {fila('Email otros', ped.email_otros)}
                      {fila('Fecha plan', formatDate(ped.fecha_plan))}
                      {fila('Fecha reparto', formatDate(ped.fecha_reparto))}
                    </div>
                  </div>

                  {/* BUQUE Y NAVIERA — solo si hay datos */}
                  {(ped.naviera_codigo || ped.naviera_nombre || ped.buque_nombre || ped.viaje_buque) && (
                    <div className="parada-item">
                      <div className="parada-title"><span className="parada-tipo">BUQUE Y NAVIERA</span></div>
                      <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {fila('Naviera (código)', ped.naviera_codigo)}
                        {fila('Naviera (nombre)', ped.naviera_nombre)}
                        {fila('Buque', ped.buque_nombre)}
                        {fila('Viaje', ped.viaje_buque)}
                      </div>
                    </div>
                  )}

                  {/* TERMINAL DE DEVOLUCIÓN DEL CONTENEDOR VACÍO
                       (solo PCS Valencia; siempre visible: muestra los datos
                       del <AcceptanceCompany> del DUT cuando viene Orden de
                       Entrega, o "no incluida" cuando no — caso reportado
                       por el puerto el 2026-05-18 para TIBA26051800052093). */}
                  {ped.proveedor_codigo === 'pcs-valencia' && (() => {
                    const ex = detalle.pcs_extra || {};
                    const hayTerminal = ex.terminal_devolucion_codigo
                      || ex.terminal_devolucion_nombre
                      || ex.terminal_devolucion_cif
                      || ex.terminal_devolucion_direccion
                      || ex.terminal_devolucion_ciudad
                      || ex.terminal_devolucion_codigo_postal
                      || ex.terminal_devolucion_unlocode;
                    return (
                      <div className="parada-item">
                        <div className="parada-title">
                          <span className="parada-tipo">TERMINAL DE DEVOLUCIÓN DEL CONTENEDOR VACÍO</span>
                        </div>
                        {hayTerminal ? (
                          <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                            {fila('Código (PCS)', ex.terminal_devolucion_codigo)}
                            {fila('Nombre', ex.terminal_devolucion_nombre)}
                            {fila('CIF', ex.terminal_devolucion_cif)}
                            {fila('Dirección', ex.terminal_devolucion_direccion)}
                            {fila('Ciudad', ex.terminal_devolucion_ciudad)}
                            {fila('Código postal', ex.terminal_devolucion_codigo_postal)}
                            {fila('UNLOCODE', ex.terminal_devolucion_unlocode)}
                          </div>
                        ) : (
                          <div className="parada-body" style={{ color: gray500 }}>
                            El puerto no ha proporcionado esta información: el documento (DUT) no incluye Orden de Entrega, por lo que no llega la organización de admisión del vacío.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* DETALLE PCS — contenedor, mercancía, puertos, precinto, aduanas */}
                  {detalle.pcs_extra && (() => {
                    const ex = detalle.pcs_extra;
                    const hayContenedor = ex.contenedor_iso_tipo || ex.contenedor_iso_descripcion || ex.contenedor_full_state
                      || ex.contenedor_estado_release || ex.contenedor_estado_acceptance
                      || ex.contenedor_tara != null || ex.contenedor_peso_bruto != null
                      || ex.contenedor_descargado != null;
                    const hayMerc = ex.mercancia_descripcion || ex.mercancia_peso_bruto != null
                      || ex.mercancia_bultos_numero != null || ex.mercancia_bultos_tipo_codigo;
                    const hayPuertos = ex.puerto_carga_codigo || ex.puerto_carga_nombre
                      || ex.puerto_origen_codigo || ex.puerto_origen_nombre
                      || ex.locator_release || ex.locator_acceptance || ex.berth_request;
                    const hayAduana = ex.customs_status || ex.precinto_numero || ex.precinto_proveedor;
                    return (
                      <>
                        {hayContenedor && (
                          <div className="parada-item">
                            <div className="parada-title"><span className="parada-tipo">CONTENEDOR</span></div>
                            <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                              {fila('Tipo ISO', ex.contenedor_iso_tipo)}
                              {fila('Descripción ISO', ex.contenedor_iso_descripcion)}
                              {fila('Estado (FCL/LCL)', ex.contenedor_full_state)}
                              {fila('Estado en release', ex.contenedor_estado_release)}
                              {fila('Estado en acceptance', ex.contenedor_estado_acceptance)}
                              {fila('Descargado', ex.contenedor_descargado == null ? null : (ex.contenedor_descargado ? 'Sí' : 'No'))}
                              {fila('Tara (kg)', ex.contenedor_tara)}
                              {fila('Peso bruto (kg)', ex.contenedor_peso_bruto)}
                            </div>
                          </div>
                        )}
                        {hayMerc && (
                          <div className="parada-item">
                            <div className="parada-title"><span className="parada-tipo">MERCANCÍA</span></div>
                            <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                              {fila('Descripción', ex.mercancia_descripcion)}
                              {fila('Peso bruto (kg)', ex.mercancia_peso_bruto)}
                              {fila('Nº bultos', ex.mercancia_bultos_numero)}
                              {fila('Tipo de bultos (cód.)', ex.mercancia_bultos_tipo_codigo)}
                              {fila('Tipo de bultos (desc.)', ex.mercancia_bultos_tipo_descripcion)}
                            </div>
                          </div>
                        )}
                        {hayPuertos && (
                          <div className="parada-item">
                            <div className="parada-title"><span className="parada-tipo">PUERTOS Y LOCATORS</span></div>
                            <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                              {fila('Puerto de carga (UNLOCODE)', ex.puerto_carga_codigo)}
                              {fila('Puerto de carga (nombre)', ex.puerto_carga_nombre)}
                              {fila('Puerto de origen (UNLOCODE)', ex.puerto_origen_codigo)}
                              {fila('Puerto de origen (nombre)', ex.puerto_origen_nombre)}
                              {fila('Locator release', ex.locator_release)}
                              {fila('Locator acceptance', ex.locator_acceptance)}
                              {fila('Berth request', ex.berth_request)}
                              {fila('Transporte', ex.transporte_tipo)}
                              {fila('Ferroviario', ex.transporte_ferroviario == null ? null : (ex.transporte_ferroviario ? 'Sí' : 'No'))}
                            </div>
                          </div>
                        )}
                        {hayAduana && (
                          <div className="parada-item">
                            <div className="parada-title"><span className="parada-tipo">ADUANAS Y PRECINTO</span></div>
                            <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                              {fila('Estado aduanero', ex.customs_status)}
                              {fila('Precinto (número)', ex.precinto_numero)}
                              {fila('Precinto (proveedor)', ex.precinto_proveedor)}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* ALBARANES */}
                  {albs.length > 0 && (
                    <div className="paradas-list">
                      <h4>Albaranes ({albs.length})</h4>
                      {albs.map((a) => (
                        <div key={a.id} className="parada-item">
                          <div className="parada-title">
                            <span className="parada-orden">#{a.id}</span>
                            <span className="parada-tipo">{a.numero || 'ALBARÁN'}</span>
                          </div>
                          <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                            {fila('Número', a.numero)}
                            {fila('Fecha', formatDate(a.fecha))}
                            {fila('Lugar carga (código)', a.lugar_carga_codigo)}
                            {fila('Unidad medida', a.unidad_medida)}
                            {fila('Proveedor', a.proveedor_codigo)}
                            {fila('ID en proveedor', a.proveedor_albaran_id)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PARADAS — tras botón porque suelen ser varias */}
                  {pars.length > 0 && (
                    <div className="paradas-list">
                      <button
                        type="button"
                        className="dp-toggle-paradas"
                        onClick={() => setVerParadasModal((v) => !v)}
                      >
                        {verParadasModal ? '▾' : '▸'} Paradas ({pars.length}) {verParadasModal ? '— ocultar' : '— ver detalle'}
                      </button>
                      {verParadasModal && pars.map((p) => (
                        <div key={p.id} className="parada-item">
                          <div className="parada-title">
                            <span className="parada-orden">{p.orden || '—'}</span>
                            <span className="parada-tipo">{p.tipo || '—'}</span>
                            {p.secuencia != null && <span style={{ fontSize: 11, color: gray500 }}>· seq {p.secuencia}</span>}
                          </div>
                          <div className="parada-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                            {fila('Lugar', p.lugar_nombre)}
                            {fila('Tipo lugar', p.tipo_lugar)}
                            {fila('Código lugar', p.lugar_codigo)}
                            {fila('Dirección 1', p.direccion1)}
                            {fila('Dirección 2', p.direccion2)}
                            {fila('Código postal', p.codigo_postal)}
                            {fila('Municipio', p.municipio)}
                            {fila('Provincia', p.provincia)}
                            {fila('País', p.pais)}
                            {fila('Persona contacto', p.persona_contacto)}
                            {fila('Teléfono', p.telefono)}
                            {fila('Latitud', p.latitud)}
                            {fila('Longitud', p.longitud)}
                            {fila('Producto', p.producto)}
                            {fila('Cantidad', p.cantidad != null ? `${p.cantidad} ${p.unidad_medida || ''}`.trim() : null)}
                            {fila('Kms tramo', p.kms_tramo)}
                            {fila('Llegada prevista', formatDateTime(p.llegada_prevista))}
                            {fila('Salida prevista', formatDateTime(p.salida_prevista))}
                            {fila('Llegada real', formatDateTime(p.llegada_real))}
                            {fila('Salida real', formatDateTime(p.salida_real))}
                            {fila('Reparto id externo', p.reparto_id_externo)}
                            {fila('Albarán vinculado', p.albaran_id ? `#${p.albaran_id}` : null)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {albs.length === 0 && pars.length === 0 && (
                    <div className="paradas-empty">No hay albaranes ni paradas registradas para este pedido</div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
