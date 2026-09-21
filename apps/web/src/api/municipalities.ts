import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { MunicipalityDetail, MunicipalityListItem } from './types';

/**
 * Ficha del municipio.
 *
 * Verificado: el gestor catastral y el estado de cobertura (regla 6) NO vienen en `data`,
 * llegan en `meta.coverage` del sobre. Por eso este envoltorio devuelve el sobre completo.
 *
 * `areaKm2`, `population` y `populationYear` son `Maybe<number>`: traen el número cuando
 * existe y la cadena `'NO_DISPONIBLE'` cuando no. No se convierten aquí a propósito —
 * convertir el centinela a `null` borraría la diferencia entre «no lo tenemos» y «es cero»,
 * y la UI debe poder decir explícitamente que el dato falta.
 */
export function getMunicipality(
  code: string,
  options: { geometry?: boolean } = {},
): Promise<Envelope<MunicipalityDetail>> {
  return request<MunicipalityDetail>(`/municipalities/${encodeURIComponent(code)}`, {
    query: { geometry: options.geometry },
  });
}

/** Municipios, opcionalmente filtrados por departamento. Arreglo pelado. */
export function listMunicipalities(deptCode?: string): Promise<Envelope<MunicipalityListItem[]>> {
  return request<MunicipalityListItem[]>('/municipalities', { query: { deptCode } });
}
