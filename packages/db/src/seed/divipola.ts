import { getLogger } from '@terracolombia/shared';

/**
 * DIVIPOLA: códigos de departamento y municipio del DANE.
 *
 * Fuente verificada el 2026-09-21: conjunto `gdxc-w37w` del portal de datos abiertos
 * (`https://www.datos.gov.co/resource/gdxc-w37w.json`), con los campos reales
 * `cod_dpto`, `dpto`, `cod_mpio`, `nom_mpio`, `tipo_municipio`, `longitud`, `latitud`.
 *
 * Las coordenadas vienen como texto con **coma decimal** ("-75,581775"): hay que
 * normalizarlas antes de usarlas.
 */

const log = getLogger({ mod: 'seed:divipola' });

export const DIVIPOLA_DATASET = {
  id: 'dane-divipola',
  source: 'DANE',
  name: 'DIVIPOLA — Códigos de municipios',
  url: 'https://www.datos.gov.co/resource/gdxc-w37w.json',
  license: 'datos-abiertos-co',
  attribution: 'Fuente: DANE, DIVIPOLA (datos.gov.co, conjunto gdxc-w37w)',
  frequency: 'yearly',
  connector: 'socrata',
  format: 'json',
} as const;

export interface DivipolaRow {
  cod_dpto: string;
  dpto: string;
  cod_mpio: string;
  nom_mpio: string;
  tipo_municipio?: string;
  longitud?: string;
  latitud?: string;
}

export interface MunicipalitySeed {
  code: string;
  deptCode: string;
  name: string;
  deptName: string;
  kind: string | null;
  lng: number | null;
  lat: number | null;
}

/** Convierte "-75,581775" a -75.581775. Devuelve null si no es un número válido. */
export function parseCoordinate(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Pasa a mayúsculas iniciales conservando los acentos y las partículas en minúscula.
 * DIVIPOLA entrega los nombres en mayúsculas ("MEDELLÍN"), y la UI los muestra en
 * capitalización normal ("Medellín").
 */
export function titleCaseName(raw: string): string {
  const lower = raw.toLocaleLowerCase('es-CO');
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el', 'en']);
  return lower
    .split(/(\s+|-)/)
    .map((token, i) => {
      if (/^\s+$/.test(token) || token === '-') return token;
      if (i > 0 && particles.has(token)) return token;
      return token.charAt(0).toLocaleUpperCase('es-CO') + token.slice(1);
    })
    .join('')
    .replace(/\bD\.c\.\b/i, 'D.C.');
}

/** Descarga DIVIPOLA completo, paginando por si el portal limita el tamaño de página. */
export async function fetchDivipola(
  opts: { baseUrl?: string; pageSize?: number; timeoutMs?: number } = {},
): Promise<MunicipalitySeed[]> {
  const baseUrl = opts.baseUrl ?? DIVIPOLA_DATASET.url;
  const pageSize = opts.pageSize ?? 1000;
  const out: MunicipalitySeed[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < 20_000; offset += pageSize) {
    const url = `${baseUrl}?$limit=${pageSize}&$offset=${offset}&$order=cod_mpio`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
    let batch: DivipolaRow[];
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': process.env.ETL_USER_AGENT ?? 'TerraColombia/0.1',
          Accept: 'application/json',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} al pedir DIVIPOLA`);
      batch = (await res.json()) as DivipolaRow[];
    } finally {
      clearTimeout(timer);
    }

    if (batch.length === 0) break;

    for (const r of batch) {
      if (!r.cod_mpio || !r.cod_dpto || seen.has(r.cod_mpio)) continue;
      seen.add(r.cod_mpio);
      out.push({
        code: r.cod_mpio.padStart(5, '0'),
        deptCode: r.cod_dpto.padStart(2, '0'),
        name: titleCaseName(r.nom_mpio ?? ''),
        deptName: titleCaseName(r.dpto ?? ''),
        kind: r.tipo_municipio ?? null,
        lng: parseCoordinate(r.longitud),
        lat: parseCoordinate(r.latitud),
      });
    }

    if (batch.length < pageSize) break;
  }

  log.info({ count: out.length }, 'DIVIPOLA descargado');
  return out;
}
