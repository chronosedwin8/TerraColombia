import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * Configuración de Vite para la SPA de TerraColombia.
 *
 * - `@` apunta a `src`.
 * - `/api` se proxea al API de Fastify en desarrollo (puerto 3001, ver `.env.example` raíz).
 * - Los paquetes del monorepo (`@terracolombia/*`) se excluyen del pre-bundling porque
 *   se publican como código fuente TypeScript y Vite debe transpilarlos, no prebundlearlos.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@terracolombia/shared', '@terracolombia/geo'],
  },
  define: {
    /**
     * `@terracolombia/shared` incluye un envoltorio de logger que lee `process.env.LOG_LEVEL`.
     * El navegador no tiene `process`, así que se reemplaza en tiempo de compilación para que
     * ninguna ruta de código lance `ReferenceError`. La web no registra por ese logger.
     */
    'process.env.LOG_LEVEL': JSON.stringify('warn'),
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Los streams SSE de /jobs/:id/stream requieren no bufferizar.
        ws: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Fragmentos separados para las librerías pesadas: el mapa y los gráficos
        // no deben bloquear el primer render de la home.
        manualChunks: {
          maplibre: ['maplibre-gl'],
          echarts: ['echarts', 'vue-echarts'],
          turf: ['@turf/turf'],
        },
      },
    },
  },
});
