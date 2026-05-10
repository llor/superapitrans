# chofoclesapp — App móvil chofocles

Última actualización: 2026-05-01 (esqueleto inicial creado)

OBJETIVO
--------

App móvil del chofer (Capacitor + React + Vite + TypeScript).

Estado actual: **esqueleto navegable** con login y listado de pedidos
contra la API de chofocles. Sin voz, sin push, sin interruptores de
pasos. Todo eso queda pendiente.

PRIMER USO
----------

```bash
cd /Volumes/THUND/proyectos/saycu/superapitrans/chofoclesapp
npm install
npx cap add android
npx cap add ios       # opcional
npm run build
npx cap sync
npx cap open android
```

DETECCIÓN DE ENTORNO
--------------------

- Hostname empieza por `dev-` o es `localhost` → API DEV
  (`https://dev-api.superapi.eoden.es/chofocles`).
- Si no → API PROD (`https://api.superapi.eoden.es/chofocles`).
- Override manual: `localStorage.setItem('chofoclesapp_api_base', 'https://...')`.

PENDIENTE (en orden de prioridad)
---------------------------------

1. **Voz**:
   - Wake word "chófocles".
   - SpeechRecognition (web) + plugin nativo en Capacitor.
   - TTS para anuncio de nuevos pedidos y para preguntas (cargas
     ambiguas).
2. **Push notifications** vía Capacitor + el backend chofocles
   (DESHABILITADO por orden del usuario hasta nuevo aviso).
3. **Interruptores de pasos** en la pantalla de configuración del
   chofer: aceptar/rechazar, hacia carga, en carga, hacia descarga,
   en descarga, fin.
4. **Cambios de estado por voz**:
   - Mapeo voz → comando de transición (servicios/transiciones.js
     del backend).
   - Diálogos por voz cuando hay varias cargas/destinos.
5. **Modo offline**: cola local de eventos cuando no hay cobertura,
   reenvío al volver.
6. **Branding y temas**: integrar `saycu-theme` cuando proceda.

REGLAS DE DISEÑO
----------------

Sigue las directrices globales de `/Volumes/THUND/proyectos/CLAUDE.md`:
- CSS tradicional (no Tailwind, no MUI, no Shadow DOM).
- Inputs/buttons/selects nativos.
- Login con margin-top ~12vh, formulario nunca >70% del alto, panel
  blanco con borde 14px.
- Sistema de 3 temas con selección oculta (7 toques en logo) cuando
  toque implementarlo.
