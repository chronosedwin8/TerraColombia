import type { Envelope, LocationIntel } from '@terracolombia/shared';
import { request } from './client';
import type { JobHandle, LocationIntelResult, LocationIntelTemplatesResponse } from './types';

/**
 * Plantillas de localización de negocio.
 *
 * Verificado: devuelve `{ templates, note }`, no un arreglo. Cada indicador de la plantilla
 * es `{ indicator, weight, rationale }`: la etiqueta, la unidad, la fórmula y las fuentes
 * NO están aquí, llegan por celda en `factors` al ejecutar el análisis.
 */
export function getIntelTemplates(): Promise<Envelope<LocationIntelTemplatesResponse>> {
  return request<LocationIntelTemplatesResponse>('/location-intel/templates');
}

/**
 * Localización de negocio (M6). Recalcular con pesos distintos es una petición nueva:
 * TanStack Query la cachea por `[templateId, scope, weights, resolution]`.
 *
 * Verificado: el desglose de cada celda se llama `factors` (no `breakdown`) y los pesos
 * finalmente aplicados llegan en `weightsApplied` (no `indicators`).
 */
export function runLocationIntel(
  body: LocationIntel,
  signal?: AbortSignal,
): Promise<Envelope<LocationIntelResult | JobHandle>> {
  return request<LocationIntelResult | JobHandle>('/location-intel', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
