/**
 * pasarela — Preferencias de VISUALIZACIÓN de los listados del panel web
 * (toggle Tarjetas/Tabla, columnas, campos de card, orden) por usuario y
 * navegador.
 *
 * Persistidas en saycu_admin.panel_vista_prefs (tabla compartida del grupo,
 * creada/mantenida por admin.saycusoft.es). Router clonado del de chofocles;
 * aquí usa el pool admin de pasarela (`getAdminPool()`, BD saycu_admin) y el
 * `requireUser` de pasarela (JWT con `login` + `empresa_codigo`).
 *
 * El navegador es un UUID que genera el CLIENTE en una cookie propia y
 * envía como parámetro (`?nav=` en GET, `{ nav, config }` en PUT) — funciona
 * con la API en otro subdominio sin cookies cross-site.
 *
 * Endpoints (montados en app.js con prefijo /api):
 *   GET /api/vista-prefs/:scope?nav=<uuid>
 *   PUT /api/vista-prefs/:scope   body { nav, config }
 */

const { Router } = require('express');
const { getAdminPool } = require('../db');
const { requireUser } = require('../auth/user-jwt');

const router = Router();
router.use(requireUser);

function identidad(req) {
  const u = req.user || {};
  const login = u.login || u.email || (u.id != null ? `id:${u.id}` : null);
  const empresa = u.empresa_codigo || u.empresa || '';
  return { login, empresa };
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function navValido(valor) {
  return RE_UUID.test(String(valor || '')) ? String(valor) : null;
}

function etiquetaNavegador(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return null;
  let nav = 'otro';
  if (s.includes('edg/') || s.includes('edga') || s.includes('edgios')) nav = 'edge';
  else if (s.includes('opr/') || s.includes('opera')) nav = 'opera';
  else if (s.includes('samsungbrowser')) nav = 'samsung';
  else if (s.includes('firefox') || s.includes('fxios')) nav = 'firefox';
  else if (s.includes('chrome') || s.includes('crios') || s.includes('chromium')) nav = 'chrome';
  else if (s.includes('safari')) nav = 'safari';
  let so = 'otro';
  if (s.includes('android')) so = 'android';
  else if (s.includes('iphone') || s.includes('ipad') || s.includes('ipod')) so = 'ios';
  else if (s.includes('windows')) so = 'windows';
  else if (s.includes('mac os') || s.includes('macintosh')) so = 'mac';
  else if (s.includes('linux')) so = 'linux';
  const movil = s.includes('mobile') || so === 'android' || so === 'ios';
  return `${nav}-${so}-${movil ? 'movil' : 'escritorio'}`;
}

// GET /vista-prefs/:scope?nav=<uuid>
router.get('/:scope', async (req, res) => {
  const { scope } = req.params;
  const { login, empresa } = identidad(req);
  if (!login) return res.status(401).json({ error: 'Usuario sin identificar' });
  const navegador = navValido(req.query.nav);
  if (!navegador) return res.json({ success: true, data: null, origen: 'defecto', navegador: null });
  try {
    const pool = getAdminPool();
    const exacto = await pool.query(
      `SELECT config FROM panel_vista_prefs
        WHERE login = $1 AND empresa = $2 AND navegador = $3 AND pantalla = $4`,
      [login, empresa, navegador, scope]
    );
    if (exacto.rows.length) {
      return res.json({ success: true, data: exacto.rows[0].config, origen: 'exacto', navegador });
    }
    const heredado = await pool.query(
      `SELECT config FROM panel_vista_prefs
        WHERE login = $1 AND empresa = $2 AND pantalla = $3
        ORDER BY updated_at DESC LIMIT 1`,
      [login, empresa, scope]
    );
    if (heredado.rows.length) {
      return res.json({ success: true, data: heredado.rows[0].config, origen: 'heredado', navegador });
    }
    return res.json({ success: true, data: null, origen: 'defecto', navegador });
  } catch (err) {
    console.error('[VISTA-PREFS] Error leyendo:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /vista-prefs/:scope  body { nav, config }
router.put('/:scope', async (req, res) => {
  const { scope } = req.params;
  const { login, empresa } = identidad(req);
  if (!login) return res.status(401).json({ error: 'Usuario sin identificar' });
  const body = req.body || {};
  const navegador = navValido(body.nav);
  const config = body.config;
  if (!navegador) return res.status(400).json({ error: 'Identificador de navegador no válido' });
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return res.status(400).json({ error: 'El cuerpo debe incluir un objeto config' });
  }
  const label = etiquetaNavegador(req.headers['user-agent']);
  try {
    await getAdminPool().query(
      `INSERT INTO panel_vista_prefs (login, empresa, navegador, navegador_label, pantalla, config, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ON CONSTRAINT uq_panel_vista_prefs
       DO UPDATE SET config = $6, navegador_label = $4, updated_at = NOW()`,
      [login, empresa, navegador, label, scope, JSON.stringify(config)]
    );
    res.json({ success: true, navegador });
  } catch (err) {
    console.error('[VISTA-PREFS] Error guardando:', err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
