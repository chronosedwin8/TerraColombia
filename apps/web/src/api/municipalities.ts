import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { MunicipalityDetail } from './types';

/** Ficha del municipio: incluye gestor catastral y estado de cobertura (regla 6). */
export function getMunicipality(code: string): Promise<Envelope<MunicipalityDetail>> {
  return request<MunicipalityDetail>(`/municipalities/${encodeURIComponent(code)}`);
}
