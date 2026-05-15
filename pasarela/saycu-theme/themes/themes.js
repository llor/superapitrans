/**
 * Catálogo de temas disponibles en Saycu.
 * Cada tema tiene: key (valor en BD), label (UI), color (preview hex).
 */
export const THEMES = [
  { key: 'default', label: 'Azul ', color: '#3a5fc4' },
  { key: 'green',   label: 'Verde',              color: '#2e7d32' },
  { key: 'red',     label: 'Rojo',               color: '#c62828' },
  { key: 'purple',  label: 'Púrpura',            color: '#6a1b9a' },
  { key: 'white',      label: 'Blanco',             color: '#e5e7eb' },
  { key: 'white-blue', label: 'Blanco azul',        color: 'linear-gradient(135deg, #e5e7eb 50%, #3a5fc4 50%)' },
];

function clearThemeClasses() {
  document.body.className = document.body.className
    .replace(/\btheme-\S+/g, '')
    .trim();
}

/**
 * Limpia el tema activo (estado pre-login neutro).
 * Sin clase theme-* en body => fondo base del login.
 */
export function clearTheme() {
  clearThemeClasses();
}

/**
 * Aplica un tema al body.
 * El tema viene siempre del servidor (BD columna usuarios_admin.tema).
 * No se usa localStorage: esto garantiza que no haya mezcla de temas
 * entre dominios y que el tema del superadmin siempre prevalezca.
 *
 * Siempre añade clase theme-{key} al body (incluyendo 'default').
 * Sin clase = pre-login (fondo neutro blanco).
 * Con clase = tema activo (gradiente de color o blanco).
 */
export function applyTheme(key) {
  const tema = key || 'default';

  clearThemeClasses();
  document.body.classList.add('theme-' + tema);
}

/**
 * Lee el valor hexadecimal resuelto de una variable CSS.
 * Acepta 'var(--nombre)' o '--nombre'.
 * Para contextos que necesitan hex puro (SVG base64, canvas, Leaflet, QR).
 */
export function getHex(varRef) {
  const name = varRef.startsWith('var(') ? varRef.slice(4, -1) : varRef;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
