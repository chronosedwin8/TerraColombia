/**
 * Normalizador de nomenclatura vial colombiana.
 *
 * Objetivo: que "Cra 45 # 12-34 Sur", "KR 45 No 12 - 34 sur" y "carrera 45 numero 12-34 sur"
 * produzcan la misma forma canónica, para buscar con `pg_trgm` + `unaccent` sobre una
 * columna normalizada. No geocodifica: solo normaliza y descompone.
 */

export interface ParsedAddress {
  /** Forma canónica: "CARRERA 45 # 12-34 SUR". */
  canonical: string;
  /** Tipo de vía principal normalizado (CALLE, CARRERA, …) o null si no se reconoce. */
  wayType: string | null;
  /** Número de la vía principal, incluidos sufijos (45A, 45 BIS). */
  wayNumber: string | null;
  /** Número de la vía secundaria (la que sigue al #). */
  crossNumber: string | null;
  /** Placa o número de puerta. */
  plate: string | null;
  /** Cuadrante: SUR, NORTE, ESTE, OESTE. */
  quadrant: string | null;
  /** Complemento: apto, interior, torre, bloque, manzana… tal como venía. */
  complement: string | null;
}

/** Abreviaturas de tipo de vía observadas en fuentes colombianas → forma canónica. */
const WAY_TYPES: Array<[RegExp, string]> = [
  [/^(cl|cll|clle|calle|ca)$/i, 'CALLE'],
  [/^(cr|cra|kr|kra|krr|carrera|car|k)$/i, 'CARRERA'],
  [/^(av|ave|avda|avenida)$/i, 'AVENIDA'],
  [/^(ak|avk|av\.?\s?cra|avenida\s?carrera)$/i, 'AVENIDA CARRERA'],
  [/^(ac|av\.?\s?cl|avenida\s?calle)$/i, 'AVENIDA CALLE'],
  [/^(dg|dag|diag|diagonal)$/i, 'DIAGONAL'],
  [/^(tv|tr|trv|trans|transv|transversal)$/i, 'TRANSVERSAL'],
  [/^(cq|circ|circular)$/i, 'CIRCULAR'],
  [/^(cv|circunvalar)$/i, 'CIRCUNVALAR'],
  [/^(ps|psj|pasaje)$/i, 'PASAJE'],
  [/^(pt|peatonal)$/i, 'PEATONAL'],
  [/^(vda|vereda)$/i, 'VEREDA'],
  [/^(km|kmt|kilometro|kilómetro)$/i, 'KILOMETRO'],
  [/^(mz|mnz|manz|manzana)$/i, 'MANZANA'],
  [/^(lt|lte|lot|lote)$/i, 'LOTE'],
  [/^(bl|blq|bloque)$/i, 'BLOQUE'],
  [/^(tor|torre)$/i, 'TORRE'],
  [/^(via|vía)$/i, 'VIA'],
  [/^(anillo)$/i, 'ANILLO VIAL'],
  [/^(aut|autop|autopista)$/i, 'AUTOPISTA'],
];

const QUADRANTS: Array<[RegExp, string]> = [
  [/^(s|sur)$/i, 'SUR'],
  [/^(n|nte|norte)$/i, 'NORTE'],
  [/^(e|est|este)$/i, 'ESTE'],
  [/^(o|w|oeste|occidente)$/i, 'OESTE'],
];

const COMPLEMENT_MARKERS =
  /\b(apto|apartamento|apt|int|interior|of|oficina|local|casa|torre|bloque|bl|etapa|conjunto|urbanizacion|urbanización|barrio|br|manzana|mz|lote|lt|piso|sotano|sótano|parqueadero|bodega)\b/i;

/** Quita tildes y diéresis, deja mayúsculas y colapsa espacios. */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s#°ºª.\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function canonicalWayType(token: string): string | null {
  for (const [re, out] of WAY_TYPES) if (re.test(token)) return out;
  return null;
}

function canonicalQuadrant(token: string): string | null {
  for (const [re, out] of QUADRANTS) if (re.test(token)) return out;
  return null;
}

/** Normaliza los marcadores de "número": No, N°, Nro, numero, # → '#'. */
function normalizeNumberMarkers(s: string): string {
  return s
    .replace(/\b(n(?:o|ro|um(?:ero)?)?\.?)\s*[°ºª]?\s*(?=\d)/gi, '# ')
    .replace(/\bn[°ºª]\s*(?=\d)/gi, '# ')
    .replace(/#+/g, '#')
    .replace(/\s*#\s*/g, ' # ');
}

/** Une sufijos alfabéticos al número: "45 A" → "45A", y normaliza BIS. */
function joinNumberSuffix(s: string): string {
  return s
    .replace(/\b(\d+)\s+([A-Z])\b(?!\s*(?:SUR|NORTE|ESTE|OESTE)\b)/g, '$1$2')
    .replace(/\b(\d+[A-Z]?)\s*BIS\b/g, '$1 BIS');
}

/**
 * Pega el guion entre el número de la vía secundaria y la placa.
 * En Colombia se escribe indistintamente "12-34", "12 - 34" y "12 -34".
 */
function tightenPlateSeparator(s: string): string {
  return s.replace(/(\d[A-Z]?)\s*-\s*(\d)/g, '$1-$2');
}

export function normalizeAddress(raw: string): string {
  if (!raw) return '';
  let s = foldText(raw);
  s = normalizeNumberMarkers(s);
  s = joinNumberSuffix(s);
  s = tightenPlateSeparator(s);
  // Expande el tipo de vía en las dos posiciones donde puede aparecer.
  const tokens = s.split(' ');
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const clean = t.replace(/[.]/g, '');
    const wt = canonicalWayType(clean);
    // Solo se expande si va seguido de algo que parece número de vía.
    const next = tokens[i + 1];
    if (wt && next && /^\d/.test(next)) {
      out.push(wt);
      continue;
    }
    const q = canonicalQuadrant(clean);
    if (q && i === tokens.length - 1) {
      out.push(q);
      continue;
    }
    out.push(clean);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export function parseAddress(raw: string): ParsedAddress {
  const canonical = normalizeAddress(raw);
  const empty: ParsedAddress = {
    canonical,
    wayType: null,
    wayNumber: null,
    crossNumber: null,
    plate: null,
    quadrant: null,
    complement: null,
  };
  if (!canonical) return empty;

  // Patrón principal: <TIPO> <NUM> # <NUM2> - <PLACA> [CUADRANTE] [resto]
  const re =
    /^(CALLE|CARRERA|AVENIDA CARRERA|AVENIDA CALLE|AVENIDA|DIAGONAL|TRANSVERSAL|CIRCULAR|CIRCUNVALAR|PASAJE|PEATONAL|AUTOPISTA|ANILLO VIAL|VIA|KILOMETRO)\s+([0-9]+[A-Z]?(?:\s?BIS)?(?:\s?[A-Z])?)\s*(?:#\s*([0-9]+[A-Z]?(?:\s?BIS)?)\s*(?:-\s*([0-9]+[A-Z]?))?)?\s*(SUR|NORTE|ESTE|OESTE)?\s*(.*)$/;
  const m = canonical.match(re);
  if (!m) {
    const qm = canonical.match(/\b(SUR|NORTE|ESTE|OESTE)\b\s*$/);
    return { ...empty, quadrant: qm?.[1] ?? null };
  }
  const rest = (m[6] ?? '').trim();
  return {
    canonical,
    wayType: m[1] ?? null,
    wayNumber: m[2]?.trim() ?? null,
    crossNumber: m[3]?.trim() ?? null,
    plate: m[4]?.trim() ?? null,
    quadrant: m[5] ?? null,
    complement: rest.length > 0 ? rest : null,
  };
}

/**
 * Variantes de la dirección para ampliar la búsqueda difusa (se indexan todas).
 * Ejemplo: "CARRERA 45 # 12-34" también se indexa como "CR 45 12 34" y "45 12 34".
 */
export function addressSearchVariants(raw: string): string[] {
  const p = parseAddress(raw);
  const variants = new Set<string>();
  if (p.canonical) variants.add(p.canonical);
  const nums = [p.wayNumber, p.crossNumber, p.plate].filter(Boolean).join(' ');
  if (p.wayType && nums) {
    variants.add(`${p.wayType} ${nums}`);
    const abbrev: Record<string, string> = {
      CALLE: 'CL',
      CARRERA: 'CR',
      AVENIDA: 'AV',
      DIAGONAL: 'DG',
      TRANSVERSAL: 'TV',
      'AVENIDA CARRERA': 'AK',
      'AVENIDA CALLE': 'AC',
    };
    const ab = abbrev[p.wayType];
    if (ab) variants.add(`${ab} ${nums}`);
  }
  if (nums) variants.add(nums);
  return [...variants];
}

export function looksLikeAddress(raw: string): boolean {
  const s = normalizeAddress(raw);
  if (/#/.test(s)) return true;
  return WAY_TYPES.some(([, canon]) => s.startsWith(canon + ' '));
}

export function hasComplement(raw: string): boolean {
  return COMPLEMENT_MARKERS.test(raw);
}
