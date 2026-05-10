import { useEffect, useState } from 'react';
import { api } from '../api';
import { storage } from '../lib/storage';

const TOQUES_PARA_DEV = 7;

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

export default function Login({ onLogin }: { onLogin: (u: any) => void }) {
    const [empresa, setEmpresa]   = useState('DEMO');
    const [login, setLogin]       = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const [error, setError]       = useState('');
    const [busy, setBusy]         = useState(false);
    const [base, setBase]         = useState('');
    const [override, setOverride] = useState<string | null>(null);
    const [toques, setToques]     = useState(0);

    useEffect(() => {
        (async () => {
            const e = await storage.get('chofoclesapp_empresa');
            if (e) setEmpresa(e);
            setBase(await api.getApiBase());
            setOverride(await api.getEnvOverride());
        })();
    }, []);

    const cambiarEntorno = async () => {
        const next = override === 'dev' ? 'prod' : override === 'prod' ? null : 'dev';
        await api.setEnvOverride(next as any);
        setOverride(next);
        setBase(await api.getApiBase());
    };

    const tocarLogo = () => {
        const t = toques + 1;
        setToques(t);
        if (t >= TOQUES_PARA_DEV) { setToques(0); cambiarEntorno(); }
        setTimeout(() => setToques(0), 2500);
    };

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setBusy(true);
        try {
            const r = await api.login(empresa, login, password);
            onLogin(r.user);
        } catch (e: any) { setError(e.message); }
        finally { setBusy(false); }
    };

    const esDev = base.includes('dev-');

    return (
        <div className="app">
            <div className="brand" onClick={tocarLogo}>
                <h1>Chofocles</h1>
                <small>v{__APP_VERSION__} — {esDev ? 'DEV' : 'prod'}</small>
                {esDev && <div style={{ height: 4, background: '#c62828', marginTop: 6, borderRadius: 2 }} />}
            </div>
            <form className="card" onSubmit={enviar}>
                {error && <div className="error">{error}</div>}
                <div className="field"><label>Empresa</label>
                    <input value={empresa} onChange={(e) => setEmpresa(e.target.value.toUpperCase())} required />
                </div>
                <div className="field"><label>Usuario</label>
                    <input value={login} onChange={(e) => setLogin(e.target.value.toLowerCase())} required />
                </div>
                <div className="field"><label>Contraseña</label>
                    <div className="password-wrap" style={{ position: 'relative' }}>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{ width: '100%', paddingRight: 36 }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            style={{
                                position: 'absolute', right: 4, top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent', border: 'none',
                                cursor: 'pointer', padding: 6, color: '#666',
                            }}
                        >
                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                    </div>
                </div>
                <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Acceder'}</button>
                <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    style={{
                        display: 'block', margin: '10px auto 0', background: 'transparent',
                        border: 'none', color: '#1976d2', fontSize: 14,
                        textDecoration: 'underline', cursor: 'pointer',
                    }}
                >
                    ¿Has olvidado tu contraseña?
                </button>
            </form>
            {showForgot && <ForgotPasswordModal empresaInicial={empresa} onClose={() => setShowForgot(false)} />}
        </div>
    );
}

function ForgotPasswordModal({ empresaInicial, onClose }: { empresaInicial: string; onClose: () => void }) {
    const [empresa, setEmpresa] = useState(empresaInicial || '');
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [mensaje, setMensaje] = useState('');
    const [error, setError] = useState('');

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true); setError(''); setMensaje('');
        try {
            const r = await api.forgotPassword(email.trim(), empresa.toUpperCase());
            setMensaje(r.message || 'Si la dirección está registrada, recibirás un correo con instrucciones.');
        } catch (err: any) {
            setError(err.message || 'Error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
        }} onClick={onClose}>
            <div className="card" style={{ width: 'min(380px, 95vw)', padding: 18 }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>Recuperar contraseña</h3>
                {mensaje ? (
                    <>
                        <p>{mensaje}</p>
                        <button className="btn" type="button" onClick={onClose}>Cerrar</button>
                    </>
                ) : (
                    <form onSubmit={onSubmit}>
                        <p style={{ marginTop: 0 }}>
                            Te enviaremos un correo con un enlace para definir una contraseña nueva.
                        </p>
                        {error && <div className="error">{error}</div>}
                        <div className="field"><label>Empresa</label>
                            <input value={empresa} onChange={(e) => setEmpresa(e.target.value.toUpperCase())} required />
                        </div>
                        <div className="field"><label>Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn" onClick={onClose} style={{ background: 'transparent', color: '#666' }}>Cancelar</button>
                            <button type="submit" className="btn" disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
