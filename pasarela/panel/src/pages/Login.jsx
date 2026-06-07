import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { auth } from '../api.js';
import { useControlGlobal } from '../lib/controlGlobal/useControlGlobal';
import UpdateBanner from '../lib/controlGlobal/UpdateBanner';
import './Login.css';

const PANEL_VERSION = (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) || '0.1.0';

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const REMEMBER_FLAG_KEY = 'pasarela.panel.remember';
const REMEMBER_CREDS_KEY = 'pasarela.panel.credentials';

// Login clonado de saycu/saycupartes/panel/src/pages/Login.{jsx,css}
// (la referencia canónica del grupo, ver memoria
// `feedback_login_clonar_saycutrans_mobile.md` y CLAUDE.md global
// "PANTALLAS DE LOGIN — INVIOLABLE"). Branding arriba, panel del form más
// abajo con margin-top: 12vh.
export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [empresa, setEmpresa] = useState(auth.getEmpresaCodigo());
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [pendingNav, setPendingNav] = useState(false);
  const { deviceUid, updateInfo, setUpdateInfo, clearUpdateInfo } = useControlGlobal({ versionName: PANEL_VERSION });

  useEffect(() => {
    try {
      const flag = localStorage.getItem(REMEMBER_FLAG_KEY);
      if (flag !== '1') return;
      const raw = localStorage.getItem(REMEMBER_CREDS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.empresa === 'string') setEmpresa(parsed.empresa);
        if (typeof parsed.usuario === 'string') setUsuario(parsed.usuario);
        if (typeof parsed.password === 'string') setPassword(parsed.password);
        setRecordar(true);
      }
    } catch {
      // storage corrupto: ignorar
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const empresaCodigo = empresa.toUpperCase();
      const data = await login({
        empresa_codigo: empresaCodigo,
        usuario,
        password,
        extra: {
          device_uid: deviceUid,
          version_name: PANEL_VERSION,
          os_name: typeof navigator !== 'undefined' ? navigator.platform : null,
        },
      });

      if (recordar) {
        localStorage.setItem(REMEMBER_FLAG_KEY, '1');
        localStorage.setItem(REMEMBER_CREDS_KEY, JSON.stringify({ empresa: empresaCodigo, usuario, password }));
      } else {
        localStorage.removeItem(REMEMBER_FLAG_KEY);
        localStorage.removeItem(REMEMBER_CREDS_KEY);
      }

      if (data && data.control_global && data.control_global.update_available) {
        setPendingNav(true);
        setUpdateInfo(data.control_global);
      } else {
        navigate('/pedidos', { replace: true });
      }
    } catch (err) {
      setError(err.message === 'credenciales_invalidas'
        ? 'Empresa, usuario o contraseña incorrectos'
        : (err.message || 'Error al iniciar sesión'));
    } finally {
      setLoading(false);
    }
  };

  function dismissUpdateBanner() {
    clearUpdateInfo();
    if (pendingNav) {
      setPendingNav(false);
      navigate('/pedidos', { replace: true });
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="branding">
          <div className="logo-mark">SN</div>
          <div className="brand-text">
            <div className="brand-title">saycunode</div>
            <div className="brand-sub">Pasarela de datos</div>
          </div>
          <div className="build-meta">v0.1</div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <label htmlFor="empresa" className="field-label">Código empresa</label>
                <input
                  id="empresa"
                  className="native-field"
                  type="text"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="organization"
                  required
                />

                <label htmlFor="usuario" className="field-label">Usuario</label>
                <input
                  id="usuario"
                  className="native-field"
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  autoComplete="username"
                  required
                />

                <label htmlFor="password" className="field-label">Contraseña</label>
                <div className="password-wrap">
                  <input
                    id="password"
                    className="native-field"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div className="remember-row">
                <input
                  type="checkbox"
                  id="recordar"
                  className="native-checkbox"
                  checked={recordar}
                  onChange={(e) => setRecordar(e.target.checked)}
                />
                <label htmlFor="recordar" className="remember-label">Recordar</label>
              </div>

              {error && <p className="error-text">{error}</p>}

              <button type="submit" disabled={loading} className="login-btn">
                {loading ? 'Accediendo…' : 'Acceder'}
              </button>

              <button
                type="button"
                className="forgot-link"
                onClick={() => setShowForgot(true)}
              >
                ¿Has olvidado tu contraseña?
              </button>
            </form>
          </div>
        </div>
      </div>
      {showForgot && (
        <ForgotPasswordModal onClose={() => setShowForgot(false)} />
      )}
      {updateInfo && <UpdateBanner info={updateInfo} onClose={dismissUpdateBanner} appLabel="saycunode · Pasarela" />}
    </div>
  );
}

// El endpoint POST /api/auth/forgot-password todavía no está implementado
// en pasarela_api (ver TODO en pasarela/api/src/routes/auth.js). Hasta que
// lo esté, este modal da una respuesta clara al usuario en lugar de un
// fallback silencioso: pídeselo al admin de tu empresa, que puede generar
// nueva contraseña desde admin.saycusoft.es. No se llama al backend.
function ForgotPasswordModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Recuperar contraseña</h3>
        <p>
          La recuperación por email todavía no está disponible. Pide al
          administrador de tu empresa que te genere una contraseña nueva
          desde el panel de administración.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="login-btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
