import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AuthSession, AuthUser } from './types';

export function login(email: string, password: string): Promise<Envelope<AuthSession>> {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRetry: true,
  });
}

export function register(body: {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
  acceptedTerms: true;
}): Promise<Envelope<AuthSession>> {
  return request<AuthSession>('/auth/register', {
    method: 'POST',
    body,
    skipAuthRetry: true,
  });
}

export function logout(): Promise<Envelope<undefined>> {
  return request<undefined>('/auth/logout', { method: 'POST', skipAuthRetry: true });
}

/** Renueva el access token usando la cookie HttpOnly de refresco. */
export function refresh(): Promise<Envelope<AuthSession>> {
  return request<AuthSession>('/auth/refresh', { method: 'POST', skipAuthRetry: true });
}

/** Sesión actual: usuario, plan y entitlements. Fuente de las guardas del router. */
export function me(): Promise<Envelope<AuthUser>> {
  return request<AuthUser>('/me', { noCache: true, skipAuthRetry: true });
}

export function requestPasswordReset(email: string): Promise<Envelope<undefined>> {
  return request<undefined>('/auth/password-reset', {
    method: 'POST',
    body: { email },
    skipAuthRetry: true,
  });
}
