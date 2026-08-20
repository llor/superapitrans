# GUION — superapitrans (futuro: SaycuNode)

Última actualización: 2026-08-20 (depurado según la norma «GUION.md — UN
GUION DE VERDAD»; la crónica vive en el historial de git).

## Objetivo

Nodo de datos del grupo Saycu: obtiene datos de proveedores externos
(Satelles, PCS Valencia…) y los ofrece vía API. Alojado en
`debian.saycusoft.es` (alias saycu/saycudev). Renombrado pendiente a
SaycuNode (fase B); por ahora repo, carpeta e infra siguen como
`superapitrans`.

## Método vigente

- SIN Caddy propio: se registra como bloque en el frontal global
  `system_caddy` (repo saycucontrol/system-caddy) con la variable única
  `BASE_DOMAIN_SUPERAPI=saycunode.saycutrans.es` y la red Docker externa
  `superapitrans_network` (crearla una vez por servidor antes de arrancar
  system_caddy). Un subdominio API único cubre los sub-servicios por path
  (`handle_path /<servicio>/*` + `rewrite /api{path}`): el código del
  sub-servicio no sabe que vive tras un prefijo.
- Dominios cableados: api./panel. (prod, 149.86.232.18) y dev-api./
  dev-panel. (dev, 149.86.233.79). www./dev-www. reservados sin cablear.
- Carpetas: local `/home/llor/proyectos/saycu/superapitrans/`; remota
  `/var/opt/superapitrans/`. Sub-servicio: `pasarela/` (el nodo de datos;
  ver su GUION). `documentos/` guarda las specs de proveedores.
- Cada sub-servicio mantiene su propio docker-compose; superapitrans no
  orquesta nada. Sin tablas para dominios (build/start time, no runtime).
- chofocles ya no vive aquí: se separó a repo propio (2026-06-03), se
  apartó del grupo (2026-07-02) y se retiró del disco (2026-08-07; el
  repo íntegro sigue en GitHub `llor/chofocles`).

## NodeImport (A3/ — cliente C# Windows para a3ERP)

Programa C# WinForms (.NET 10, x86) que importa datos de la API a a3ERP
por COM ActiveX, integrado en el menú de a3ERP (entrada `NI_IMP`, convive
con SaycuImport `SS_IMP`). Clonado de `datacontrol/A3/SaycuImportV2/`.

- Dos modos por proveedor: Satelles → albaranes de compra; PCS Valencia →
  pedidos de compra (cada parada = una línea). La tabla canónica `pedidos`
  distingue por el campo `tipo` (ALBARAN|PEDIDO).
- Solo campos comerciales estándar en a3ERP; el detalle logístico queda en
  la API. Marca lo importado con REFERENCIA `NI-{id}`.
- Auto-reinicio post-importación (patrón SaycuImport): tras importar, el
  exe se relanza a sí mismo con --restore (la conexión COM queda sucia).
- Desarrollo en SRV-SAYC00-009 vía `ssh a3win` (editar local → scp →
  compilar con `C:\dotnet\dotnet.exe publish … win-x86`). Carpetas Windows:
  `C:\Saycusoft\NodeImport\` (+ bin\Publish). Config en `config.json`
  (URL de la API, empresa, API key Bearer, credenciales a3ERP, import).
  Instalador Inno Setup (`Instalador/NodeImport_Setup.iss`).
- ESTADO: APARCADO desde 2026-06-04. Compilado y consultando datos reales
  de GFE (199 albaranes) en el grid; la empresa GFE existe en a3ERP con
  datos de ejemplo y permisos dados. SIGUIENTE PASO: probar la importación
  COM real (abrir en el escritorio remoto, importar UN albarán y
  verificarlo en Compras → Albaranes; si el login COM SA/SA falla, probar
  sin contraseña o crear usuario en a3ERP). La empresa real del N1 es
  TRANSCOLLADO (BD creada; faltan permisos del usuario Windows).

## Pendientes vigentes

- NodeImport en a3win: el `config.json` real de la carpeta Publish apunta
  ya al dominio nuevo (verificar al retomar); probar importación COM real.
- Monitorización del servidor: confirmar que
  `/etc/saycu-monitoring/monitoring.conf` lleva los dominios saycunode.
- Fase B (renombrado a SaycuNode): carpeta, repo, variable
  BASE_DOMAIN_SUPERAPI y desacople de la red de chofocles. Al hacerla, se
  revisa la regla de nomenclatura «superapitrans» del CLAUDE.md global.
- Si el N1 quiere campos logísticos dentro de a3ERP: diccionario de a3ERP
  (tablas/campos personalizados).
