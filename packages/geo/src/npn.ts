import { NPN_LENGTH_20, NPN_LENGTH_30, ZONE } from '@terracolombia/shared';
import type { NpnParts } from '@terracolombia/shared';

/**
 * Número Predial Nacional (NPN) de 30 dígitos.
 *
 * Descomposición (PLAN.md §7):
 *   depto(2) municipio(3) zona(2) sector(2) comuna(2) barrio(2)
 *   manzana/vereda(4) terreno(4) condición(1) edificio(2) piso(2) unidad(4)
 *   2+3+2+2+2+2+4+4+1+2+2+4 = 30
 *
 * **Sobre el código anterior de 20 dígitos:** el producto lo acepta como entrada de
 * búsqueda, pero NO existe una conversión aritmética a 30 dígitos. El tramo del NPN de 30
 * que identifica el terreno ya ocupa 21 dígitos, así que el código de 20 no es un prefijo
 * del de 30, y su estructura interna no está documentada de forma verificable en las
 * fuentes que inspeccionamos.
 *
 * Por la regla 2 de CLAUDE.md (no inventar), aquí no se implementa ninguna conversión:
 * un código de 20 dígitos se resuelve **buscándolo en la columna `core.parcel.npn_old`**,
 * que es la que trae la propia fuente cuando la publica. Si la fuente no lo trae, el
 * producto lo dice en vez de adivinar.
 */

export const NPN_SEGMENTS = [
  ['department', 2],
  ['municipality', 3],
  ['zone', 2],
  ['sector', 2],
  ['commune', 2],
  ['neighborhood', 2],
  ['blockOrVereda', 4],
  ['parcel', 4],
  ['condition', 1],
  ['building', 2],
  ['floor', 2],
  ['unit', 4],
] as const satisfies ReadonlyArray<readonly [keyof NpnParts, number]>;

/** Valores neutros que indican "el predio completo", no una unidad de propiedad horizontal. */
const NEUTRAL = { condition: '0', building: '00', floor: '00', unit: '0000' } as const;

/** Longitud del tramo que identifica el terreno, sin la parte de propiedad horizontal. */
export const NPN_TERRAIN_PREFIX_LENGTH = 21;

export class NpnError extends Error {
  constructor(
    message: string,
    readonly input: string,
  ) {
    super(message);
    this.name = 'NpnError';
  }
}

/** Quita separadores y espacios; no valida longitud. */
export function normalizeNpnInput(raw: string): string {
  return raw.replace(/[\s.\-_/]/g, '');
}

export function isNpnCandidate(raw: string): boolean {
  const s = normalizeNpnInput(raw);
  return /^\d+$/.test(s) && (s.length === NPN_LENGTH_30 || s.length === NPN_LENGTH_20);
}

/** true si la entrada tiene la forma del código anterior de 20 dígitos. */
export function isLegacyNpn(raw: string): boolean {
  return /^\d{20}$/.test(normalizeNpnInput(raw));
}

/**
 * Un código de 20 dígitos no se puede convertir a 30 sin consultar la fuente. Esta función
 * existe para que quien lo intente reciba un error claro en vez de un resultado inventado.
 */
export function npn20to30(npn20: string): never {
  throw new NpnError(
    'El código predial de 20 dígitos no se puede convertir al de 30 con una regla aritmética: ' +
      'no es un prefijo del código nuevo. Búscalo en la columna `npn_old` del predio.',
    npn20,
  );
}

/** Los 21 dígitos que identifican el terreno, sin la parte de propiedad horizontal. */
export function terrainPrefix(npn30: string): string {
  const s = normalizeNpnInput(npn30);
  if (!/^\d{30}$/.test(s)) throw new NpnError('El NPN debe tener 30 dígitos', npn30);
  return s.slice(0, NPN_TERRAIN_PREFIX_LENGTH);
}

export function parseNpn(raw: string): NpnParts {
  const s = normalizeNpnInput(raw);
  if (/^\d{20}$/.test(s)) {
    throw new NpnError(
      'Este es un código predial del formato anterior (20 dígitos). No se puede descomponer con la ' +
        'estructura del código nacional de 30 dígitos: hay que buscarlo en la base por `npn_old`.',
      raw,
    );
  }
  if (!/^\d{30}$/.test(s)) {
    throw new NpnError(
      `El código predial debe tener 30 dígitos (o 20 en el formato anterior); recibimos ${s.length}`,
      raw,
    );
  }
  const parts = {} as Record<keyof NpnParts, string>;
  let i = 0;
  for (const [key, len] of NPN_SEGMENTS) {
    parts[key] = s.slice(i, i + len);
    i += len;
  }
  return parts as NpnParts;
}

export function formatNpn(raw: string): string {
  const p = parseNpn(raw);
  return NPN_SEGMENTS.map(([k]) => p[k]).join('');
}

/** Formato legible con separadores por tramo, para mostrar en la ficha. */
export function formatNpnPretty(raw: string): string {
  const p = parseNpn(raw);
  return [
    p.department,
    p.municipality,
    p.zone,
    p.sector,
    p.commune,
    p.neighborhood,
    p.blockOrVereda,
    p.parcel,
    p.condition,
    p.building,
    p.floor,
    p.unit,
  ].join('-');
}

export function muniCodeOf(raw: string): string {
  const p = parseNpn(raw);
  return p.department + p.municipality;
}

export function deptCodeOf(raw: string): string {
  return parseNpn(raw).department;
}

export function isUrban(raw: string): boolean {
  return parseNpn(raw).zone === ZONE.URBAN;
}

export function isRural(raw: string): boolean {
  return parseNpn(raw).zone === ZONE.RURAL;
}

/** true si el NPN identifica una unidad de propiedad horizontal, no el predio completo. */
export function isHorizontalProperty(raw: string): boolean {
  const p = parseNpn(raw);
  return (
    p.condition !== NEUTRAL.condition ||
    p.building !== NEUTRAL.building ||
    p.floor !== NEUTRAL.floor ||
    p.unit !== NEUTRAL.unit
  );
}

/** NPN del predio matriz (mismo terreno, sin la parte de propiedad horizontal). */
export function matrixNpn(raw: string): string {
  const p = parseNpn(raw);
  return (
    p.department +
    p.municipality +
    p.zone +
    p.sector +
    p.commune +
    p.neighborhood +
    p.blockOrVereda +
    p.parcel +
    NEUTRAL.condition +
    NEUTRAL.building +
    NEUTRAL.floor +
    NEUTRAL.unit
  );
}

/**
 * Validación estructural. No comprueba existencia en la base: eso lo hace la consulta.
 * `department` debe estar en el rango de códigos DIVIPOLA (01–99, sin 00) y `zone` en {01,02}.
 */
export function validateNpn(
  raw: string,
): { ok: true; parts: NpnParts } | { ok: false; reason: string; isLegacy?: boolean } {
  if (isLegacyNpn(raw)) {
    return {
      ok: false,
      isLegacy: true,
      reason:
        'Es un código predial del formato anterior (20 dígitos). Lo buscamos por `npn_old`, no lo convertimos.',
    };
  }
  try {
    const parts = parseNpn(raw);
    if (parts.department === '00') return { ok: false, reason: 'Código de departamento inválido (00)' };
    if (parts.municipality === '000')
      return { ok: false, reason: 'Código de municipio inválido (000)' };
    if (parts.zone !== ZONE.URBAN && parts.zone !== ZONE.RURAL) {
      return {
        ok: false,
        reason: `Zona inválida: se espera 01 (urbano) o 02 (rural), llegó ${parts.zone}`,
      };
    }
    return { ok: true, parts };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'NPN inválido' };
  }
}

/** Describe el NPN en lenguaje claro, para el botón "Explícame esto". */
export function explainNpn(raw: string): string {
  const p = parseNpn(raw);
  const zone = p.zone === ZONE.URBAN ? 'urbano' : p.zone === ZONE.RURAL ? 'rural' : 'de zona no estándar';
  const base = `Este código identifica un predio ${zone} en el municipio ${p.department}${p.municipality}. Dentro del municipio está en el sector ${p.sector}, comuna ${p.commune}, barrio ${p.neighborhood}, ${
    p.zone === ZONE.RURAL ? 'vereda' : 'manzana'
  } ${p.blockOrVereda}, y es el terreno ${p.parcel}.`;
  if (!isHorizontalProperty(raw)) {
    return `${base} Los últimos dígitos están en ceros, lo que significa que se refiere al predio completo y no a una unidad dentro de un edificio.`;
  }
  return `${base} Además corresponde a una unidad de propiedad horizontal: edificio ${p.building}, piso ${p.floor}, unidad ${p.unit}.`;
}
