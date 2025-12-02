import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // WICHTIG: API-Keys werden NICHT über define exponiert!
      // Sie müssen über das Settings-Modal (localStorage) konfiguriert werden.
      // Environment-Variablen sind nur für Server-Side Code gedacht.
      define: {
        // Nur nicht-sensitive Konfiguration hier
        'process.env.NODE_ENV': JSON.stringify(mode),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
