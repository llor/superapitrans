import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Panel servido detrás de system-caddy en
// https://{dev-,}panel.superapi.eoden.es/pasarela/, por lo que el SPA se
// construye con base path '/pasarela/'. El API público vive en
// https://{dev-,}api.superapi.eoden.es/pasarela/* (mismo rewrite + reverse
// proxy a pasarela_api:3412 desde system-caddy).

export default defineConfig({
    base: '/pasarela/',
    plugins: [react()],
    server: {
        port: 5174,
        host: true,
        proxy: {
            // En desarrollo local, redirigir /api/* al backend Node.
            '/api': {
                target: process.env.VITE_API_BASE || 'http://localhost:3412',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
