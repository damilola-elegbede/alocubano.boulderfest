import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    base: "/dist/",
    define: {
        // Inject debug flag at build time (default: false)
        '__CONSOLE_LOG_DEBUG_ENABLED__': JSON.stringify(process.env.CONSOLE_LOG_DEBUG_ENABLED === '1')
    },
    plugins: [react()],
    build: {
        // Output to a distinct directory to avoid cluttering root
        outDir: 'dist',
        // Generate manifest for backend to link correct hashed files
        manifest: true,
        rollupOptions: {
            // Main entry point for the React app
            input: path.resolve(__dirname, 'src/main.jsx'),
        },
    },
    server: {
        // Proxy API requests to the legacy backend (scripts/dev-server.js running on 3000)
        proxy: {
            '/api': 'http://localhost:3000',
            '/images': 'http://localhost:3000',
            '/css': 'http://localhost:3000'
        }
    }
});
