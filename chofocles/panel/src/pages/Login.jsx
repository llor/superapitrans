import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const { login, loading } = useAuth();
    const navigate = useNavigate();
    const [empresa, setEmpresa] = useState('DEMO');
    const [usuario, setUsuario] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        try {
            await login({ empresa, login: usuario, password });
            navigate('/viajes', { replace: true });
        } catch (err) {
            setError(err.message || 'No se ha podido iniciar sesión');
        }
    }

    // Layout de login: panel ligeramente por encima del centro
    // (margin-top ~12vh), nunca >70% del alto. Inputs nativos, sin
    // componentes que encapsulen estilos. Sigue el patrón de login del
    // grupo Saycu (ver CLAUDE.md global, sección "PANTALLAS DE LOGIN").
    return (
        <div className="login-page">
            <div className="login-panel">
                <h1 className="login-title">chofocles</h1>
                <form onSubmit={onSubmit} className="login-form">
                    <label>
                        Empresa
                        <input
                            type="text"
                            value={empresa}
                            onChange={e => setEmpresa(e.target.value.toUpperCase())}
                            required
                            autoComplete="organization"
                        />
                    </label>
                    <label>
                        Usuario
                        <input
                            type="text"
                            value={usuario}
                            onChange={e => setUsuario(e.target.value)}
                            required
                            autoComplete="username"
                        />
                    </label>
                    <label>
                        Contraseña
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </label>
                    {error && <div className="login-error">{error}</div>}
                    <button type="submit" disabled={loading}>
                        {loading ? 'Entrando…' : 'Acceder'}
                    </button>
                </form>
            </div>
        </div>
    );
}
