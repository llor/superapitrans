import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'saycu-theme/index.css';
import './index.css';
import App from './App.jsx';
import { installErrorReporter } from './utils/error-reporter';

installErrorReporter({
    project: 'chofocles-panel',
    url: import.meta.env.VITE_ERROR_REPORTER_URL
        || (window.location.hostname.startsWith('dev-')
            ? 'https://dev-admin.saycusoft.es/api/error-report'
            : 'https://admin.saycusoft.es/api/error-report'),
    environment: import.meta.env.PROD ? 'production' : 'development',
    enabled: import.meta.env.VITE_ERROR_REPORTER_ENABLED !== 'false',
});

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>
);
