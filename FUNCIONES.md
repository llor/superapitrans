# FUNCIONES — superapitrans (Nodo API)

Mapa de funciones del proyecto (convención: `docs/rules/mapa-funciones.md`
del workspace). Consultarlo ANTES de buscar o crear una función; si existe
una de menester similar → reutilizar/extender, no duplicar. Actualizar en
la misma sesión que cualquier alta/cambio/retirada.

Componentes: `pasarela/api/` (Express: sincroniza pedidos/albaranes de
proveedores externos hacia la BD del tenant) · `pasarela/panel/` (React:
visor de pedidos) · `A3/NodeImport/` (WinForms C# que importa
superapitrans → a3ERP vía COM ActiveX; Satelles→albaranes, PCS→pedidos) ·
`pasarela/db/` · `_scripts/`. Mapa sobre main (722b148, 2026-07-10).

## Pantallas

(`pasarela/panel/src/App.jsx`)
- `/login` — `pages/Login.jsx`; `/pedidos` — `pages/Pedidos.jsx` — visor
  de pedidos/documentos de superapitrans (tabla con columnas elegibles).

## Endpoints API

(`pasarela/api/src/routes/*` montados en `src/app.js`)
- `/api/datos` — `datos.js` (4) — datos sincronizados (pedidos/albaranes)
  para NodeImport y panel.
- `/api/satelles` — `satelles.js` (6) — operaciones del proveedor
  Satelles.
- `/api/auth` — `auth.js` (1); `/api/me` — `me.js` (2);
  `/api/vista-prefs` — `vista-prefs.js` (2).

## Jobs y crons

- Scheduler interno de sincronización — `pasarela/api/src/cron.js`: la
  expresión cron vive en `saycu_admin.pasarela_config` (clave
  `cron_expr`); el operador la cambia desde la web admin y el api
  reprograma EN CALIENTE sin redespliegue.

## Scripts

- `pasarela/_scripts/deploy-dev.sh` / `deploy-prod.sh` (api) y
  `deploy-panel-dev.sh` / `deploy-panel-prod.sh` (panel);
  `bootstrap-env.sh`; `restart-with-env-reload.sh` (up -d
  --force-recreate para recargar .env).
- `_scripts/detect_env.sh` (raíz del repo).
- `A3/NodeImport/compilar.bat` — compilación en el Windows de dev.

## Servicios y utilidades

API (`pasarela/api/src/`):
- Proveedores (patrón client/mapper/sync por proveedor):
  `proveedores/satelles/{client,mapper,sync}.js` y
  `proveedores/pcs-valencia/{client,mapper,sync}.js` — cliente HTTP del
  proveedor, mapeo a esquema propio y rutina de sincronización. Proveedor
  nuevo → replicar este patrón, no incrustar en rutas.
- Auth (tres ámbitos): `auth/client-key.js` (api_key de cliente),
  `auth/provider-cred.js` (credenciales de proveedor),
  `auth/user-jwt.js` (JWT del panel).
- `secrets.js` — descifrado de credenciales (AES; clave
  `*_SECRETS_KEY` del entorno); `utils/fallo-persistente.js` — registro
  de fallos persistentes de sync; `middleware/log-request.js` — log de
  peticiones (visor de técnicos); `db.js`; réplicas del grupo:
  `utils/error-reporter-client.js`, `utils/control-global-client.js`.

Panel (`pasarela/panel/src/`):
- `api.js`; `context/AuthContext.jsx`; `services/pedidosColumnas.js` —
  catálogo de columnas del visor; `services/filterStorage.js`;
  `utils/useVistaPrefs.js`; `lib/controlGlobal/`.

NodeImport (`A3/NodeImport/`, WinForms .NET x86):
- `Program.cs` — entrada; `MainForm.cs` — ventana principal;
  `A3ErpService.cs` — importación a a3ERP vía COM ActiveX;
  `PasarelaApi.cs` — cliente HTTP de superapitrans; `Config.cs` — config
  local (`config.json`; `config.gfe.json` de ejemplo por empresa);
  `Registro.cs` — modelo de registro; `ErrorHelper.cs`, `Logger.cs`;
  `Instalador/` — Inno Setup.

## Componentes compartidos

(`pasarela/panel/src/components/`)
- `PedidosTable.jsx` + `EditColumnasModal.jsx` — tabla de pedidos con
  columnas elegibles (mismo patrón que el visor de admin.saycusoft.es);
  `DataCards.jsx`.

## Otros

- `pasarela/db/` — SQL del esquema del tenant `pasarela` (drift vigilado
  por `saycu/_scripts/audit-tenant-schema.sh`).
- `documentos/` — documentación de proveedores/encargos; `GUION.md` de
  pasarela y del repo.
- La página admin que describe qué da cada proveedor es
  `admin.saycusoft.es/panel/src/pages/DatosPasarela.jsx` — mantenerla al
  cambiar proveedores (regla de memoria del workspace).
