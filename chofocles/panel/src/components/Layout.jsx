import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    async function handleLogout() {
        await logout();
        navigate('/login');
    }

    // Estructura mínima alineada con saycu: header + main-content--full.
    // Las clases del tema (page-header, etc.) se reusarán cuando se
    // implementen pantallas reales — aquí solo el armazón.
    return (
        <div className="app-container chofocles-app">
            <header className="app-header">
                <div className="app-header-row">
                    <Link to="/" className="app-header-title">chofocles</Link>
                    {user && (
                        <div className="app-header-user">
                            <span>{user.nombre} {user.apellidos || ''} ({user.rol})</span>
                            <button type="button" onClick={handleLogout}>Salir</button>
                        </div>
                    )}
                </div>
            </header>
            <main className="main-content main-content--full chofocles-main">
                {children}
            </main>
        </div>
    );
}
