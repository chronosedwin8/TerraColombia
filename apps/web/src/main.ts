/**
 * Arranque de la SPA.
 *
 * Orden importante: Pinia antes del router, porque la guarda de navegación usa el store de
 * sesión; y TanStack Query con reintentos conservadores, porque muchas consultas son costosas
 * en el backend (análisis espaciales) y reintentarlas a ciegas empeora las cosas.
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query';
import { AppError } from '@terracolombia/shared';
import App from './App.vue';
import router from './router';
import './style.css';

const queryOptions: VueQueryPluginOptions = {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        // Los cortes catastrales son mensuales: no hace falta refrescar al volver a la pestaña.
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: (failureCount, error) => {
          // Un error de dominio (plan, cuota, no encontrado) no se arregla reintentando.
          if (error instanceof AppError) {
            const retriable = error.code === 'UPSTREAM_UNAVAILABLE' || error.code === 'RATE_LIMITED';
            return retriable && failureCount < 2;
          }
          return failureCount < 1;
        },
      },
      mutations: { retry: 0 },
    },
  },
};

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin, queryOptions);

// Último recurso: cualquier error no capturado queda en consola con contexto, sin PII.
app.config.errorHandler = (error, _instance, info) => {
  console.error('[TerraColombia] error no capturado', { info, error });
};

app.mount('#app');
