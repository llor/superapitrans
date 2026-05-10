import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ListaViajes from './pages/ListaViajes';
import DetalleViaje from './pages/DetalleViaje';

function Protegida({ children }) {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return <Layout>{children}</Layout>;
}

export default function App() {
    return (
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/viajes" replace />} />
                <Route path="/viajes" element={<Protegida><ListaViajes /></Protegida>} />
                <Route path="/viajes/:id" element={<Protegida><DetalleViaje /></Protegida>} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </AuthProvider>
    );
}
