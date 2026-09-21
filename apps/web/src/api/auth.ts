import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AuthSession, MeResponse, OkResponse } from './types';

/**
 * OJO: las rutas de `/auth/*` devuelven `{ data }` SIN `meta` (verificado en vivo).
 * `normalizeEnvelope` en `client.ts` lo compensa rellenando un `meta` vacío, así que
 * aquí se puede tratar como un sobre normal.
 */
export function login(email: string, password: string): Promise<Envelope<AuthSession>> {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRetry: true,
  });
}

/** Verificado: solo `email` y `password` son obligatorios. */
export function register(body: {
  email: string;
  password: string;
  name?: string;
  organizationName?: string;
  acceptedTerms?: true;
}): Promise<Envelope<AuthSession>> {
  return request<AuthSession>('/auth/register', {
    method: 'POST',
    body,
    skipAuthRetry: true,
  });
}

export function logout(): Promise<Envelope<OkResponse>> {
  return request<OkResponse>('/auth/logout', { method: 'POST', skipAuthRetry: true });
}

/** Renueva el access token usando la cookie HttpOnly de refresco. */
export function refresh(): Promise<Envelope<AuthSession>> {
  return request<AuthSession>('/auth/refresh', { method: 'POST', skipAuthRetry: true });
}

/**
 * Sesión actual: usuario, plan y entitlements. Fuente de las guardas del router.
 *
 * Verificado: `/me` devuelve MÁS que el `user` del login — añade `emailVerified`,
 * `locale`, `organizations`, `planDetail` y `usage`.
 */
export function me(): Promise<Envelope<MeResponse>> {
  return request<MeResponse>('/me', { noCache: true, skipAuthRetry: true });
}

export function requestPasswordReset(email: string): Promise<Envelope<OkResponse>> {
  return request<OkResponse>('/auth/password-reset', {
    method: 'POST',
    body: { email },
    skipAuthRetry: true,
  });
}
