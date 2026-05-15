/**
 * DataCards — renderiza una lista de items como cards responsive.
 *
 * Props:
 *   items       {Array}   — lista de objetos a mostrar
 *   columns     {Array}   — definición de columnas:
 *     {
 *       label    {string}           — etiqueta visible
 *       key      {string}           — campo del objeto (si no hay render)
 *       render   {(item) => node}   — render personalizado
 *       primary  {boolean}          — si true, va en la fila principal (título)
 *       actions  {boolean}          — si true, va en la esquina de acciones
 *       full     {boolean}          — si true, ocupa el ancho completo
 *       hide     {boolean}          — si true, no se muestra
 *     }
 *   emptyText   {string}  — texto cuando no hay items
 *   wide        {boolean} — si true, usa layout de 1 columna en pantallas anchas
 *   layout      {'list'|'tiles'} — variante visual del grid
 *   bandRender  {(item) => node} — opcional. Si devuelve algo, se pinta
 *                                  como banda superior del card (clase
 *                                  .dc-card__strip en saycu-theme).
 */
import './DataCards.css';
import { gray300 } from 'saycu-theme/colors.js';

export default function DataCards({ items = [], columns = [], emptyText = 'No hay datos', wide = false, layout = 'list', onCardClick, cardStyle, bandRender }) {
  if (!items.length) {
    return <div className="dc-empty">{emptyText}</div>;
  }

  const primaryCols = columns.filter((c) => c.primary && !c.hide);
  const actionCols  = columns.filter((c) => c.actions && !c.hide);
  const fieldCols   = columns.filter((c) => !c.primary && !c.actions && !c.hide);

  function getValue(item, col) {
    if (col.render) return col.render(item);
    const val = col.key ? item[col.key] : null;
    if (val === null || val === undefined || val === '') return <span style={{ color: gray300 }}>—</span>;
    return String(val);
  }

  return (
    <div className={`dc-grid${wide ? ' dc-grid--wide' : ''}${layout === 'tiles' ? ' dc-grid--tiles' : ''}`}>
      {items.map((item, idx) => (
        <div
          key={item.id ?? idx}
          className={`dc-card${onCardClick ? ' dc-card--clickable' : ''}`}
          style={cardStyle ? cardStyle(item) : undefined}
          onClick={onCardClick ? () => onCardClick(item) : undefined}
          role={onCardClick ? 'button' : undefined}
          tabIndex={onCardClick ? 0 : undefined}
          onKeyDown={onCardClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(item); } } : undefined}
        >
          {/* Banda superior opcional (estado real, etiqueta, etc.) */}
          {bandRender && bandRender(item)}

          {/* Fila principal: título + acciones */}
          {(primaryCols.length > 0 || actionCols.length > 0) && (
            <div className="dc-card__primary">
              <div className="dc-card__title">
                {primaryCols.map((col, i) => (
                  <span key={i}>{getValue(item, col)}</span>
                ))}
              </div>
              {actionCols.length > 0 && (
                <div className="dc-card__actions">
                  {actionCols.map((col, i) => (
                    <span key={i}>{getValue(item, col)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Campos secundarios */}
          {fieldCols.length > 0 && (
            <div className="dc-card__fields">
              {fieldCols.map((col, i) => (
                <div key={i} className={`dc-field${col.full ? ' dc-field--full' : ''}`}>
                  {!col.hideLabel && <span className="dc-field__label">{col.label}</span>}
                  <span className="dc-field__value">{getValue(item, col)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
