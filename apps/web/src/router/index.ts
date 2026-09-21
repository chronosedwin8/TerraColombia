/**
 * Rutas de la SPA.
 *
 * Tres reglas de diseño:
 *  1. **Carga diferida** de todas las vistas (`import()`): la home no arrastra ECharts,
 *     terra-draw ni las pantallas de administración.
 *  2. **Guardas de sesión y de plan**: `requiresAuth` y `requiresEntitlement` viven en `meta`,
 *     y la comprobación es la misma que usa la interfaz, no una copia.
 *  3. **Estado en la URL**: las rutas no llevan filtros en el path; los llevan en la query,
 *     con `useUrlState`, para que toda vista sea compartible (PLAN.md §10.3).
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { EntitlementFlag } from '@/composables/useEntitlements';

declare module 'vue-router' {
  interface RouteMeta {
    /** Título de la pestaña; se le añade el nombre del producto. */
    title?: string;
    requiresAuth?: boolean;
    /** Permiso de plan necesario para entrar. */
    requiresEntitlement?: EntitlementFlag;
    /** Solo administradores de plataforma. */
    requiresPlatformAdmin?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Explorar el territorio' },
  },
  {
    path: '/predio/:npn',
    name: 'parcel',
    component: () => import('@/views/ParcelView.vue'),
    meta: { title: 'Ficha de predio' },
    props: true,
  },
  {
    path: '/buscar',
    name: 'advanced-search',
    component: () => import('@/views/AdvancedSearchView.vue'),
    meta: {
      title: 'Buscador avanzado de predios',
      requiresAuth: true,
      requiresEntitlement: 'canUseAdvancedSearch',
    },
  },
  {
    path: '/zona',
    name: 'area-analysis',
    component: () => import('@/views/AreaAnalysisView.vue'),
    meta: {
      title: 'Analizar una zona',
      requiresAuth: true,
      requiresEntitlement: 'canUseAreaAnalysis',
    },
  },
  {
    path: '/aptitud',
    name: 'suitability',
    component: () => import('@/views/SuitabilityView.vue'),
    meta: {
      title: 'Aptitud de terreno',
      requiresAuth: true,
      requiresEntitlement: 'canUseSuitability',
    },
  },
  {
    path: '/localizacion',
    name: 'location-intel',
    component: () => import('@/views/LocationIntelView.vue'),
    meta: {
      title: '¿Dónde abro mi negocio?',
      requiresAuth: true,
      requiresEntitlement: 'canUseLocationIntel',
    },
  },
  {
    path: '/cambios',
    name: 'changes',
    component: () => import('@/views/ChangeView.vue'),
    meta: {
      title: 'Cambio territorial',
      requiresAuth: true,
      requiresEntitlement: 'canUseChangeDetection',
    },
  },
  {
    path: '/observatorio/:muniCode?',
    name: 'observatory',
    component: () => import('@/views/ObservatoryView.vue'),
    meta: { title: 'Observatorio municipal' },
    props: true,
  },
  {
    path: '/proyectos',
    name: 'projects',
    component: () => import('@/views/ProjectsView.vue'),
    meta: { title: 'Mis proyectos, informes y alertas', requiresAuth: true },
  },
  {
    path: '/cuenta/plan',
    name: 'billing',
    component: () => import('@/views/BillingView.vue'),
    meta: { title: 'Plan, pagos y equipo', requiresAuth: true },
  },
  {
    path: '/cuenta/llaves',
    name: 'api-keys',
    component: () => import('@/views/ApiKeysView.vue'),
    meta: { title: 'Llaves de API y consumo', requiresAuth: true, requiresEntitlement: 'canUseApi' },
  },
  {
    path: '/desarrolladores',
    name: 'developers',
    component: () => import('@/views/DeveloperPortalView.vue'),
    meta: { title: 'Portal de desarrolladores' },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { title: 'Administración', requiresAuth: true, requiresPlatformAdmin: true },
  },
  {
    path: '/glosario',
    name: 'glossary',
    component: () => import('@/views/GlossaryView.vue'),
    meta: { title: 'Glosario' },
  },
  {
    path: '/ingresar',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Ingresar' },
  },
  {
    path: '/registro',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { title: 'Crear cuenta' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Página no encontrada' },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  /**
   * Al volver atrás se restaura la posición; al navegar a una vista nueva se va arriba.
   * El mapa conserva su estado porque vive en la query, no en el scroll.
   */
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
});

/**
 * Guarda única. Orden de comprobación: sesión → permiso de plan → administrador.
 * Cuando falta el plan **no** se expulsa al usuario: se lo lleva a la página de planes con
 * el motivo, para que entienda qué le falta y pueda volver.
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // La sesión se resuelve una sola vez por carga de página.
  if (auth.status === 'unknown') await auth.bootstrap();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    };
  }

  if (to.meta.requiresPlatformAdmin && !auth.isPlatformAdmin) {
    return { name: 'not-found' };
  }

  const needed = to.meta.requiresEntitlement;
  if (needed && auth.entitlements[needed] !== true) {
    return {
      name: 'billing',
      query: { motivo: needed, volver: to.fullPath },
    };
  }

  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : null;
  document.title = title ? `${title} · TerraColombia` : 'TerraColombia — Pregúntale al territorio';
});

export default router;
