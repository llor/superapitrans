# GUION - saycu-theme

Ultima actualizacion: 2026-04-07

## Objetivo
Paquete CSS compartido entre todos los paneles del ecosistema Saycu.
Centraliza variables de color (paleta morada ERP), reset, estilos de DataCards, contenedores y botones.

## Archivos
- variables.css — Variables :root globales (--erp-header, --erp-label, colores, fondos, feedback, overlay)
- reset.css — Box-sizing, fuente base, min-height body
- datacards.css — Estilos de tarjetas tipo DataCard (grid, sombras, hover)
- containers.css — Contenedor principal con fondo #f0f0f0, padding, border-radius
- buttons.css — Botones ERP (.erp-btn, variantes primary/secondary/danger/success)
- login-recovery.css — Estilos compartidos de login: ojo password, forgot link, modal, mensajes feedback
- index.css — Barrel que importa todos los anteriores

## Uso en proyectos
Cada panel lo referencia asi en su package.json:
```json
"dependencies": {
  "saycu-theme": "file:./saycu-theme"
}
```
Y tiene un symlink local: `saycu-theme -> ../../saycu-theme` (o `../saycu-theme` segun nivel).

En el CSS del panel se importa con:
```css
@import 'saycu-theme/variables.css';
@import 'saycu-theme/reset.css';
```

## Docker
En los Dockerfile, el contexto de build es "." (raiz proyecto) y se copia con:
```dockerfile
COPY saycu-theme/ ./saycu-theme/
```
Y en deploy scripts se sincroniza el directorio real (no el symlink) al servidor.

## Paneles que lo usan
- admin.saycusoft.es/panel
- saycutrans/panel-admin
- saycutrans/panel-empresa
- saycucontrol/admin
- saycucontrol/panel
- datacontrol/panel

## Sombra estandar de tarjetas
- Normal: `3px 4px 8px rgba(0,0,0,0.25)`
- Hover: `4px 6px 14px rgba(0,0,0,0.32)`

## Paleta azul ERP
- --erp-header: #3a5fc4
- --erp-header-dark: #2f4ea8
- --erp-primary: var(--erp-header)

## Login Recovery centralizado (2026-03-26)

### Nuevo archivo: login-recovery.css
Estilos compartidos para la funcionalidad de recuperacion de contrasena en todos los login:
- `.password-wrapper` / `.password-toggle` — Contenedor relativo + boton ojo show/hide
- `.forgot-link-row` / `.forgot-link` — Enlace "olvidaste tu contrasena"
- `.forgot-overlay` / `.forgot-modal` — Modal de recuperacion (overlay + caja)
- `.forgot-cancel` — Boton cancelar del modal
- `.forgot-success` / `.forgot-error` / `.error-message` — Mensajes de feedback

Todos los colores usan variables del tema (--erp-primary, --text-muted, --overlay-bg, etc.), cero hardcoded.

### Variables nuevas en variables.css
- `--feedback-success-bg`, `--feedback-success-text` — Fondo/texto para mensajes de exito
- `--feedback-error-bg`, `--feedback-error-text` — Fondo/texto para mensajes de error
- `--overlay-bg` — Fondo semitransparente para overlays modales
- `--shadow-modal` — Sombra estandar para cajas modales

### Refactorizacion aplicada
Eliminados bloques duplicados de estilos recovery en:
- admin.saycusoft.es/panel/src/pages/Login.css (colores hardcoded -> variables)
- saycutrans/panel-admin/src/pages/Login.css
- saycutrans/panel-empresa/src/pages/Login.css
- saycucontrol/admin/src/index.css (eliminado bloque sc-password/sc-forgot)
- saycucontrol/panel/src/index.css (eliminado bloque sc-password/sc-forgot)
- datacontrol/panel/src/App.css (eliminado bloque dc-password/dc-forgot)

Clases JSX migradas a nombres unificados del tema:
- `sc-password-wrapper` / `dc-password-wrapper` -> `password-wrapper`
- `sc-password-toggle` / `dc-password-toggle` -> `password-toggle`
- `sc-forgot-row` / `dc-forgot-row` -> `forgot-link-row`
- `sc-forgot-link` / `dc-forgot-link` -> `forgot-link`

## Fix temas CSS (abril 2026)

### Regla CRÍTICA: sin cadenas var() en temas
**NUNCA** definir `--nueva: var(--otra)` en `:root` si `--otra` puede ser sobreescrita en temas (`body.theme-*`). Las cadenas `var()` se resuelven en `:root` y los hijos heredan el valor ya resuelto — los overrides de temas NO propagan. Siempre poner el valor literal en cada tema.

### Estado actual de los temas
- 5 temas: `default.css`, `red.css`, `green.css`, `purple.css`, `white.css`
- Cada tema define ~68 variables explícitas con valores literales
- `white.css` incluye además ~287 líneas de component overrides (textos oscuros, fondos claros, bordes grises)
- `themes.js`: `applyTheme(key)` / `clearTheme()` / `getHex(varRef)`
- Todos los paneles tienen `useEffect` para aplicar tema al recargar (F5) vía endpoint `/temas/actual`

### Login global
- Variables de login transversales en `variables.css` + overrides por tema
- `clearTheme()` limpia clases `theme-*` en logout
- `themes/index.css`: fondo diagonal solo en temas de color (no en white)

## Sesion 2026-04-07: ajustes white para control embebido

- `themes/white.css` amplía overrides para botones de ecosistema Saycu:
  - `sc-btn--success` pasa a escala gris (mismo patrón visual que botones de búsqueda en white).
  - `btn-erp-outline` elimina hover oscuro y conserva fondo/borde gris claro.
- Objetivo: evitar verdes/chocantes en tema `white` y mantener consistencia visual entre admin y módulos embebidos (saycucontrol).
