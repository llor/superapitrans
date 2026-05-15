/**
 * Catálogo de columnas que el modo tabla del visor pasarela puede mostrar.
 *
 * - `key`: nombre de la propiedad en el objeto pedido devuelto por
 *          /api/(me|admin)/pasarela-datos/pedidos.
 * - `label`: lo que se ve en la cabecera de la tabla.
 * - `sortable`: si la cabecera puede pulsarse para ordenar (debe coincidir
 *               con la whitelist `sortableFields` del backend para evitar
 *               error_invalid_sort).
 * - `render(p)`: función que devuelve el contenido (string o ReactNode).
 *
 * COLUMNAS_DEFAULT son las que aparecen marcadas la primera vez que el
 * usuario abre el modo tabla; después se persisten sus elecciones en
 * localStorage (via filterStorage con sub-key 'columnas').
 */

const fmtFecha = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtFechaHora = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const v = (x) => (x === null || x === undefined || x === '' ? '—' : x);

export const COLUMNAS_DISPONIBLES = {
  numero_pedido:           { label: 'Nº pedido',            sortable: true,  render: (p) => v(p.numero_pedido || p.id_ruta_externa || `#${p.id}`) },
  id_viaje:                { label: 'ID viaje',             sortable: true,  render: (p) => v(p.id_viaje) },
  id_ruta_externa:         { label: 'ID ruta externa',      sortable: true,  render: (p) => v(p.id_ruta_externa) },
  fecha_plan:              { label: 'Fecha plan',           sortable: true,  render: (p) => fmtFecha(p.fecha_plan) },
  fecha_reparto:           { label: 'Fecha reparto',        sortable: true,  render: (p) => fmtFecha(p.fecha_reparto) },
  origen_municipio:        { label: 'Origen',               sortable: false, render: (p) => v(p.origen_municipio) },
  destino_municipio:       { label: 'Destino',              sortable: false, render: (p) => v(p.destino_municipio) },
  tipo:                    { label: 'Transporte',           sortable: true,  render: (p) => p.tipo === 'ALBARAN' ? 'Terminado' : p.tipo === 'PEDIDO' ? 'Pendiente' : '—' },
  estado:                  { label: 'Estado ERP',           sortable: true,  render: (p) => v(p.estado) },
  cliente_codigo:          { label: 'Cliente (código)',     sortable: true,  render: (p) => v(p.cliente_codigo) },
  cliente_cif:             { label: 'Cliente (CIF)',        sortable: false, render: (p) => v(p.cliente_cif) },
  tercero_codigo:          { label: 'Tercero (código)',     sortable: true,  render: (p) => v(p.tercero_codigo) },
  tercero_cif:             { label: 'Tercero (CIF)',        sortable: false, render: (p) => v(p.tercero_cif) },
  delegacion_codigo:       { label: 'Delegación',           sortable: true,  render: (p) => v(p.delegacion_codigo) },
  proveedor_codigo:        { label: 'Proveedor',            sortable: true,  render: (p) => v(p.proveedor_codigo) },
  proveedor_publication_id:{ label: 'ID en proveedor',      sortable: false, render: (p) => v(p.proveedor_publication_id) },
  matricula_tractor:       { label: 'Matrícula tractor',    sortable: true,  render: (p) => v(p.matricula_tractor) },
  matricula_remolque:      { label: 'Matrícula remolque',   sortable: false, render: (p) => v(p.matricula_remolque) },
  matricula_contenedor:    { label: 'Matrícula contenedor', sortable: false, render: (p) => v(p.matricula_contenedor) },
  chofer_principal_codigo: { label: 'Chofer principal',     sortable: false, render: (p) => v(p.chofer_principal_codigo) },
  chofer_principal_cif:    { label: 'CIF chofer ppal',      sortable: false, render: (p) => v(p.chofer_principal_cif) },
  albaranes_concatenados:  { label: 'Albaranes (resumen)',  sortable: false, render: (p) => v(p.albaranes_concatenados) },
  paradas_count:           { label: 'Paradas (nº)',         sortable: false, render: (p) => v(p.paradas_count || 0) },
  albaranes_count:         { label: 'Albaranes (nº)',       sortable: false, render: (p) => v(p.albaranes_count || 0) },
  bl_numero:               { label: 'BL',                   sortable: true,  render: (p) => v(p.bl_numero) },
  expediente_transitario:  { label: 'Expediente',           sortable: true,  render: (p) => v(p.expediente_transitario) },
  operacion_tipo:          { label: 'Operación',            sortable: false, render: (p) => v(p.operacion_tipo) },
  naviera_codigo:          { label: 'Naviera (código)',     sortable: false, render: (p) => v(p.naviera_codigo) },
  naviera_nombre:          { label: 'Naviera (nombre)',     sortable: false, render: (p) => v(p.naviera_nombre) },
  buque_nombre:            { label: 'Buque',                sortable: false, render: (p) => v(p.buque_nombre) },
  viaje_buque:             { label: 'Viaje buque',          sortable: false, render: (p) => v(p.viaje_buque) },
  created_at:              { label: 'Creado',               sortable: true,  render: (p) => fmtFechaHora(p.created_at) },
  updated_at:              { label: 'Actualizado',          sortable: false, render: (p) => fmtFechaHora(p.updated_at) },
};

// Selección por defecto cuando el usuario abre el modo tabla la 1ª vez:
// las mismas columnas que muestra el modo cards.
export const COLUMNAS_DEFAULT = [
  'numero_pedido',
  'fecha_reparto',
  'origen_municipio',
  'destino_municipio',
  'tercero_codigo',
  'matricula_tractor',
  'tipo',
  'estado',
  'proveedor_codigo',
];
