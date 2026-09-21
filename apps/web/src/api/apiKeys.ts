import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { ApiKey, ApiKeyCreated, ApiUsagePoint, Page } from './types';

export function listApiKeys(): Promise<Envelope<Page<ApiKey>>> {
  return request<Page<ApiKey>>('/api-keys');
}

/** La llave en claro llega una única vez: la UI obliga a copiarla antes de cerrar. */
export function createApiKey(body: {
  name: string;
  scopes: string[];
}): Promise<Envelope<ApiKeyCreated>> {
  return request<ApiKeyCreated>('/api-keys', { method: 'POST', body });
}

export function revokeApiKey(id: string): Promise<Envelope<ApiKey>> {
  return request<ApiKey>(`/api-keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
}

export function getApiUsage(days = 30): Promise<Envelope<ApiUsagePoint[]>> {
  return request<ApiUsagePoint[]>('/api-keys/usage', { query: { days } });
}
