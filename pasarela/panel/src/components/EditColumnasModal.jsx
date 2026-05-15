/**
 * Modal para editar las columnas visibles del modo tabla.
 *
 * Permite:
 *   - Eliminar columnas (botón × en cada una).
 *   - Añadir columnas (formulario con selector "campo" + selector
 *     "posición" que ofrece «Al principio», «Antes de X», «Después de X»
 *     para cada columna ya visible, «Al final»).
 *   - Resetear a las columnas por defecto.
 *
 * No hace persistencia: el padre decide qué hacer con `onChange(newCols)`.
 */

import { useMemo, useState } from 'react';
import { IoClose, IoAddCircleOutline, IoRefreshOutline } from 'react-icons/io5';
import { COLUMNAS_DISPONIBLES, COLUMNAS_DEFAULT } from '../services/pedidosColumnas.js';
import './EditColumnasModal.css';

export default function EditColumnasModal({ columnas, onChange, onClose }) {
  const [campoSel, setCampoSel] = useState('');
  const [posicionSel, setPosicionSel] = useState('end'); // start | before:<k> | after:<k> | end

  const disponibles = useMemo(
    () => Object.keys(COLUMNAS_DISPONIBLES).filter((k) => !columnas.includes(k)),
    [columnas]
  );

  const quitar = (key) => {
    onChange(columnas.filter((k) => k !== key));
  };

  const añadir = () => {
    if (!campoSel) return;
    const next = columnas.slice();
    if (posicionSel === 'start') {
      next.unshift(campoSel);
    } else if (posicionSel === 'end') {
      next.push(campoSel);
    } else if (posicionSel.startsWith('before:')) {
      const ref = posicionSel.slice('before:'.length);
      const idx = next.indexOf(ref);
      if (idx < 0) next.push(campoSel);
      else next.splice(idx, 0, campoSel);
    } else if (posicionSel.startsWith('after:')) {
      const ref = posicionSel.slice('after:'.length);
      const idx = next.indexOf(ref);
      if (idx < 0) next.push(campoSel);
      else next.splice(idx + 1, 0, campoSel);
    }
    onChange(next);
    setCampoSel('');
    setPosicionSel('end');
  };

  const resetear = () => {
    onChange(COLUMNAS_DEFAULT.slice());
  };

  return (
    <div className="ecm-overlay" onClick={onClose}>
      <div className="ecm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ecm-head">
          <h3>Editar columnas</h3>
          <button type="button" className="ecm-close" onClick={onClose} aria-label="Cerrar">
            <IoClose />
          </button>
        </div>

        <p className="ecm-help">
          Columnas que se muestran en modo tabla, en orden. Quita las que no
          uses con el «×» y añade nuevas con el formulario de abajo (puedes
          colocarlas antes o después de cualquiera ya visible).
        </p>

        <ul className="ecm-list">
          {columnas.map((key) => {
            const def = COLUMNAS_DISPONIBLES[key];
            return (
              <li key={key} className="ecm-item">
                <span className="ecm-item__label">{def?.label || key}</span>
                <button
                  type="button"
                  className="ecm-item__remove"
                  onClick={() => quitar(key)}
                  title="Quitar columna"
                  aria-label={`Quitar ${def?.label || key}`}
                >
                  <IoClose />
                </button>
              </li>
            );
          })}
          {columnas.length === 0 && (
            <li className="ecm-item ecm-item--empty">No hay columnas. Añade al menos una.</li>
          )}
        </ul>

        <div className="ecm-add">
          <label className="ecm-add__label">
            Añadir columna
            <select value={campoSel} onChange={(e) => setCampoSel(e.target.value)}>
              <option value="">— elige un campo —</option>
              {disponibles.map((k) => (
                <option key={k} value={k}>{COLUMNAS_DISPONIBLES[k].label}</option>
              ))}
            </select>
          </label>

          <label className="ecm-add__label">
            Posición
            <select value={posicionSel} onChange={(e) => setPosicionSel(e.target.value)}>
              <option value="start">Al principio</option>
              {columnas.map((k) => (
                <option key={`b:${k}`} value={`before:${k}`}>Antes de «{COLUMNAS_DISPONIBLES[k]?.label || k}»</option>
              ))}
              {columnas.map((k) => (
                <option key={`a:${k}`} value={`after:${k}`}>Después de «{COLUMNAS_DISPONIBLES[k]?.label || k}»</option>
              ))}
              <option value="end">Al final</option>
            </select>
          </label>

          <button
            type="button"
            className="ecm-add__btn"
            onClick={añadir}
            disabled={!campoSel || disponibles.length === 0}
          >
            <IoAddCircleOutline /> Añadir
          </button>
        </div>

        <div className="ecm-foot">
          <button type="button" className="ecm-reset" onClick={resetear}>
            <IoRefreshOutline /> Restablecer columnas por defecto
          </button>
          <button type="button" className="ecm-done" onClick={onClose}>
            Hecho
          </button>
        </div>
      </div>
    </div>
  );
}
