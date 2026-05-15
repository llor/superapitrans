/**
 * Tabla del visor pasarela en modo tabla (alternativa a cards).
 *
 * - Cabeceras clicables para ordenar ASC/DESC (solo si la columna es
 *   `sortable`, según el catálogo en services/pedidosColumnas.js — que a
 *   su vez debe coincidir con el `sortableFields` del backend).
 * - Lápiz en la primera celda de la cabecera para abrir
 *   `EditColumnasModal` y añadir/eliminar/reordenar columnas.
 * - Click en una fila ejecuta `onRowClick(pedido)` (modal detalle).
 */

import { IoCreateOutline, IoArrowUpOutline, IoArrowDownOutline } from 'react-icons/io5';
import { COLUMNAS_DISPONIBLES } from '../services/pedidosColumnas.js';
import './PedidosTable.css';

export default function PedidosTable({
  pedidos,
  columnas,         // array de keys, en orden
  sortBy,
  sortOrder,        // 'ASC' | 'DESC'
  onSortChange,     // (key) => void
  onEditarColumnas, // () => void (abre el modal)
  onRowClick,       // (pedido) => void
}) {
  const cols = columnas.filter((k) => COLUMNAS_DISPONIBLES[k]);

  const toggleSort = (key) => {
    const def = COLUMNAS_DISPONIBLES[key];
    if (!def?.sortable) return;
    if (sortBy === key) {
      onSortChange(key, sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      onSortChange(key, 'ASC');
    }
  };

  return (
    <div className="ptab-wrap">
      <table className="ptab">
        <thead>
          <tr>
            <th className="ptab__edit-cell" aria-label="Editar columnas">
              <button
                type="button"
                className="ptab__edit-btn"
                onClick={onEditarColumnas}
                title="Añadir o quitar columnas"
                aria-label="Editar columnas"
              >
                <IoCreateOutline />
              </button>
            </th>
            {cols.map((key) => {
              const def = COLUMNAS_DISPONIBLES[key];
              const isActive = sortBy === key;
              return (
                <th
                  key={key}
                  className={`ptab__th${def.sortable ? ' ptab__th--sortable' : ''}${isActive ? ' ptab__th--active' : ''}`}
                  onClick={() => toggleSort(key)}
                  title={def.sortable ? 'Pulsa para ordenar' : ''}
                >
                  <span>{def.label}</span>
                  {isActive && (sortOrder === 'ASC'
                    ? <IoArrowUpOutline className="ptab__arrow" />
                    : <IoArrowDownOutline className="ptab__arrow" />)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id} className="ptab__row" onClick={() => onRowClick?.(p)}>
              <td className="ptab__row-marker" aria-hidden="true">›</td>
              {cols.map((key) => {
                const def = COLUMNAS_DISPONIBLES[key];
                return (
                  <td key={key} className="ptab__td">
                    {def.render(p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
