/**
 * Sesión del usuario. El access token vive **solo en memoria** (el refresh token viaja
 * en una cookie HttpOnly), así que un XSS no puede llevárselo de `localStorage`.
 * Al recargar la página, `bootstrap()` pide un token nuevo con la cookie.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { AppError, PLANS, entitlementsFor, type Entitlements, type PlanCode } from '@terracolombia/shared';
import * as authApi from '@/api/auth';
import { clearEtagCache, setAccessToken, setSessionExpiredHandler } from '@/api/client';
import type { AuthUser } from '@/api/types';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef<AuthUser | null>(null);
  const status = ref<AuthStatus>('unknown');
  const error = shallowRef<AppError | null>(null);
  const isSubmitting = ref(false);

  const isAuthenticated = computed(() => status.value === 'authenticated' && user.value !== null);
  const plan = computed<PlanCode>(() => user.value?.plan ?? 'free');
  const planName = computed(() => PLANS[plan.value].name);
  /** Sin sesión se aplican los permisos del plan Gratis: la UI no promete lo que no hay. */
  const entitlements = computed<Entitlements>(
    () => user.value?.entitlements ?? entitlementsFor('free'),
  );
  const isPlatformAdmin = computed(() => user.value?.isPlatformAdmin === true);

  function applySession(nextUser: AuthUser, accessToken: string | null): void {
    if (accessToken) setAccessToken(accessToken);
    user.value = nextUser;
    status.value = 'authenticated';
    error.value = null;
  }

  function clearSession(): void {
    setAccessToken(null);
    clearEtagCache();
    user.value = null;
    status.value = 'anonymous';
  }

  /** Se llama una vez al arrancar la app. No lanza: la app debe funcionar sin sesión. */
  async function bootstrap(): Promise<void> {
    if (status.value !== 'unknown') return;
    try {
      const { data } = await authApi.refresh();
      applySession(data.user, data.accessToken);
    } catch {
      clearSession();
    }
  }

  async function login(email: string, password: string): Promise<boolean> {
    isSubmitting.value = true;
    error.value = null;
    try {
      const { data } = await authApi.login(email, password);
      applySession(data.user, data.accessToken);
      return true;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos iniciar sesión');
      return false;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function register(payload: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }): Promise<boolean> {
    isSubmitting.value = true;
    error.value = null;
    try {
      const { data } = await authApi.register({ ...payload, acceptedTerms: true });
      applySession(data.user, data.accessToken);
      return true;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos crear la cuenta');
      return false;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // Cerrar sesión local aunque el backend no responda.
    } finally {
      clearSession();
    }
  }

  /** Vuelve a leer `/me`: se usa tras comprar un plan o consumir créditos. */
  async function refreshUser(): Promise<void> {
    if (!isAuthenticated.value) return;
    try {
      const { data } = await authApi.me();
      user.value = data;
    } catch {
      // Si `/me` falla no se cierra la sesión: puede ser un corte momentáneo.
    }
  }

  // El cliente HTTP avisa cuando el refresco falla definitivamente.
  setSessionExpiredHandler(clearSession);

  return {
    user,
    status,
    error,
    isSubmitting,
    isAuthenticated,
    plan,
    planName,
    entitlements,
    isPlatformAdmin,
    bootstrap,
    login,
    register,
    logout,
    refreshUser,
    clearSession,
  };
});
