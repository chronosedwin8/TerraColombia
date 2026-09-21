import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { MunicipalIndicators } from './types';

/**
 * Observatorio municipal (M9).
 *
 * Verificado: devuelve `{ municipality, summary, indicators, emptyReason }`. El bloque
 * `summary` va en snake_case (sale directo de SQL). Hoy `indicators` suele venir vacío
 * con su `emptyReason`: los calcula el paso de agregación del ETL.
 */
export function getIndicators(muniCode: string): Promise<Envelope<MunicipalIndicators>> {
  return request<MunicipalIndicators>(`/indicators/${encodeURIComponent(muniCode)}`);
}
