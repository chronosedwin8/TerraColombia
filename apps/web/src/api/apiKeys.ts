import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { ApiKey, ApiKeyCreated, ApiUsagePoint, Page } from './types';

/** Verificado: `Page<ApiKey>`. Lo visible de la llave es `prefix`, no un `maskedKey`. */
export function listApiKeys(): Promise<Envelope<Page<ApiKey>>> {
  return request<Page<ApiKey>>('/api-keys');
}

/**
 * Crear llave. La llave en claro llega una única vez: la UI obliga a copiarla antes de cerrar.
 *
 * Verificado: el cuerpo NO acepta `scopes`. Acepta `{ name, environment?, allowedOrigins?,
 * expiresInDays? }`, y el entorno `live` exige un plan con API (si no, PLAN_REQUIRED).
 * La respuesta 201 trae `{ id, name, prefix, environment, secret, warning, usage }`:
 * sin `scopes`, sin `createdAt` y sin `maskedKey`.
 */
export function createApiKey(body: {
  name: string;
  environment?: 'sandbox' | 'live';
  allowedOrigins?: string[];
  expiresInDays?: number;
}): Promise<Envelope<ApiKeyCreated>> {
  return request<ApiKeyCreated>('/api-keys', { method: 'POST', body });
}

/** Revoca la llave y devuelve su fila ya marcada como inactiva. */
export function revokeApiKey(id: string): Promise<Envelope<ApiKey>> {
  return request<ApiKey>(`/api-keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
}

/** Serie diaria de consumo. Arreglo pelado, ya sembrado con todos los días del rango. */
export function getApiUsage(days = 30): Promise<Envelope<ApiUsagePoint[]>> {
  return request<ApiUsagePoint[]>('/api-keys/usage', { query: { days } });
}
