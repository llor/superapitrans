import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El panel se sirve detrás de system-caddy en
// https://{dev-,}panel.superapi.eoden.es/chofocles/, por lo que el SPA debe
// construirse con base path '/chofocles/'.

export default defineConfig({
    base: '/chofocles/',
    plugins: [react()],
    server: {
        port: 5173,
        host: true,
        proxy: {
            // En desarrollo local, redirigir /api/* al backend Node
            '/api': {
                target: process.env.VITE_API_BASE || 'http://localhost:3411',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
