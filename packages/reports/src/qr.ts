/**
 * Generador de códigos QR en SVG, implementado aquí y sin dependencias externas.
 *
 * Alcance deliberadamente acotado a lo que necesita el informe:
 * - **Modo byte** (los datos son una URL de verificación en UTF-8).
 * - **Corrección de errores nivel M** (~15 %), que es el equilibrio habitual para impresión.
 * - **Versiones 1 a 10** (21×21 a 57×57 módulos): la versión 10 admite 213 bytes, de sobra
 *   para `https://terracolombia.co/verificar/<uuid>`.
 *
 * Referencia: ISO/IEC 18004. Las tablas de bloques, de patrones de alineación y de
 * información de formato/versión son las del estándar; los tests las comprueban contra los
 * vectores publicados en el propio estándar (Anexo C y D) y verifican, además, que el
 * polinomio de corrección sea divisible por el generador, que es la condición que define
 * un código Reed-Solomon correcto.
 */

// ─── Campo de Galois GF(256), polinomio primitivo 0x11D ───────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255] as number;
})();

export function gfExp(i: number): number {
  return GF_EXP[i] as number;
}

export function gfLog(i: number): number {
  return GF_LOG[i] as number;
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] as number) + (GF_LOG[b] as number)] as number;
}

/**
 * Polinomio generador de grado `degree`, con coeficientes **del término mayor al menor**:
 * el producto (x − α⁰)(x − α¹)…(x − α^(degree−1)) en GF(256).
 * Con esta convención `poly[0]` siempre vale 1 y los exponentes α de los coeficientes
 * coinciden con la tabla del Anexo A del estándar.
 */
export function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = Uint8Array.from([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      const c = poly[j] as number;
      next[j] = (next[j] as number) ^ c;
      next[j + 1] = (next[j + 1] as number) ^ gfMul(c, GF_EXP[i] as number);
    }
    poly = next;
  }
  return poly;
}

/** Codewords de corrección de errores para un bloque de datos. */
export function rsEncode(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLength);
  const result = new Uint8Array(ecLength);
  for (let i = 0; i < data.length; i += 1) {
    const factor = ((data[i] as number) ^ (result[0] as number)) & 0xff;
    result.copyWithin(0, 1);
    result[ecLength - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLength; j += 1) {
        result[j] = (result[j] as number) ^ gfMul(gen[j + 1] as number, factor);
      }
    }
  }
  return result;
}

// ─── Tablas del estándar (versiones 1–10, nivel M) ────────────────────────────

/** Codewords totales por versión (datos + corrección), independiente del nivel. */
export const TOTAL_CODEWORDS: readonly number[] = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

export interface BlockSpec {
  /** Codewords de corrección por bloque. */
  ecPerBlock: number;
  group1Blocks: number;
  group1DataCodewords: number;
  group2Blocks: number;
  group2DataCodewords: number;
}

/** Estructura de bloques para el nivel de corrección M, versiones 1 a 10. */
export const BLOCKS_M: readonly BlockSpec[] = [
  { ecPerBlock: 10, group1Blocks: 1, group1DataCodewords: 16, group2Blocks: 0, group2DataCodewords: 0 },
  { ecPerBlock: 16, group1Blocks: 1, group1DataCodewords: 28, group2Blocks: 0, group2DataCodewords: 0 },
  { ecPerBlock: 26, group1Blocks: 1, group1DataCodewords: 44, group2Blocks: 0, group2DataCodewords: 0 },
  { ecPerBlock: 18, group1Blocks: 2, group1DataCodewords: 32, group2Blocks: 0, group2DataCodewords: 0 },
  { ecPerBlock: 24, group1Blocks: 2, group1DataCodewords: 43, group2Blocks: 0, group2DataCodewords: 0 },
  { ecPerBlock: 16, group1Blocks: 4, group1DataCodewords: 27, group2Blocks: 0, group2DataCodewords: 0 },
  { ecPerBlock: 18, group1Blocks: 4, group1DataCodewords: 31, group2Blocks: 0, group2DataCodewords: 0 },
  { ecPerBlock: 22, group1Blocks: 2, group1DataCodewords: 38, group2Blocks: 2, group2DataCodewords: 39 },
  { ecPerBlock: 22, group1Blocks: 3, group1DataCodewords: 36, group2Blocks: 2, group2DataCodewords: 37 },
  { ecPerBlock: 26, group1Blocks: 4, group1DataCodewords: 43, group2Blocks: 1, group2DataCodewords: 44 },
];

/** Centros de los patrones de alineación por versión (1 = sin patrones). */
export const ALIGNMENT_CENTERS: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export const MAX_VERSION = 10;

export function blockSpec(version: number): BlockSpec {
  const spec = BLOCKS_M[version - 1];
  if (!spec) throw new QrError(`Versión de QR no soportada: ${version} (se admiten 1 a ${MAX_VERSION})`);
  return spec;
}

export function dataCodewordsFor(version: number): number {
  const s = blockSpec(version);
  return s.group1Blocks * s.group1DataCodewords + s.group2Blocks * s.group2DataCodewords;
}

/** Bytes que caben en modo byte, nivel M, en esa versión. */
export function byteCapacity(version: number): number {
  const headerBits = 4 + charCountBits(version);
  return Math.floor((dataCodewordsFor(version) * 8 - headerBits) / 8);
}

/** Longitud del contador de caracteres en modo byte: 8 bits hasta la versión 9, 16 desde la 10. */
export function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

export class QrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrError';
  }
}

// ─── Información de formato y de versión (BCH) ────────────────────────────────

/** Indicador de nivel de corrección en la información de formato. */
export const ECC_INDICATOR = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 } as const;
export type EccLevel = keyof typeof ECC_INDICATOR;

/**
 * Información de formato: 5 bits de datos (2 de nivel + 3 de máscara), BCH(15,5) con
 * generador `0b10100110111`, y XOR final con `0b101010000010010`.
 */
export function formatInfoBits(level: EccLevel, mask: number): number {
  const data = (ECC_INDICATOR[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0b10100110111);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

/** Información de versión (solo versiones ≥ 7): BCH(18,6) con generador `0b1111100100101`. */
export function versionInfoBits(version: number): number {
  if (version < 7) throw new QrError('La información de versión solo existe desde la versión 7');
  let rem = version;
  for (let i = 0; i < 12; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0b1111100100101);
  }
  return (version << 12) | rem;
}

// ─── Codificación de datos ────────────────────────────────────────────────────

class BitBuffer {
  private readonly bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((b, i) => {
      if (b) out[i >>> 3] = (out[i >>> 3] as number) | (0x80 >>> (i & 7));
    });
    return out;
  }
}

/** Versión mínima en la que caben `byteLength` bytes con nivel M. */
export function pickVersion(byteLength: number): number {
  for (let v = 1; v <= MAX_VERSION; v += 1) {
    if (byteLength <= byteCapacity(v)) return v;
  }
  throw new QrError(
    `El contenido del QR ocupa ${byteLength} bytes y no cabe en una versión ${MAX_VERSION} con corrección M (máximo ${byteCapacity(MAX_VERSION)} bytes). Acorte la URL de verificación.`,
  );
}

/**
 * Convierte los bytes de entrada en la secuencia final de codewords ya intercalada
 * (datos + corrección), lista para colocarse en la matriz.
 */
export function encodeToCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const spec = blockSpec(version);
  const totalData = dataCodewordsFor(version);
  if (bytes.length > byteCapacity(version)) {
    throw new QrError(`No caben ${bytes.length} bytes en la versión ${version}`);
  }

  const buf = new BitBuffer();
  buf.push(0b0100, 4); // modo byte
  buf.push(bytes.length, charCountBits(version));
  for (const b of bytes) buf.push(b, 8);

  // Terminador de hasta 4 ceros y relleno hasta completar el byte.
  const capacityBits = totalData * 8;
  buf.push(0, Math.min(4, capacityBits - buf.length));
  if (buf.length % 8 !== 0) buf.push(0, 8 - (buf.length % 8));

  const data = new Uint8Array(totalData);
  data.set(buf.toBytes().subarray(0, totalData));
  // Bytes de relleno alternos 0xEC / 0x11 definidos por el estándar.
  for (let i = Math.ceil(buf.length / 8); i < totalData; i += 1) {
    data[i] = (i - Math.ceil(buf.length / 8)) % 2 === 0 ? 0xec : 0x11;
  }

  // Partición en bloques.
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  const push = (count: number, size: number) => {
    for (let i = 0; i < count; i += 1) {
      const block = data.subarray(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, spec.ecPerBlock));
    }
  };
  push(spec.group1Blocks, spec.group1DataCodewords);
  push(spec.group2Blocks, spec.group2DataCodewords);

  // Intercalado: primero los datos columna a columna, después la corrección.
  const out = new Uint8Array(TOTAL_CODEWORDS[version - 1] as number);
  let k = 0;
  const maxData = Math.max(spec.group1DataCodewords, spec.group2DataCodewords);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) out[k++] = block[i] as number;
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) out[k++] = block[i] as number;
  }
  return out;
}

// ─── Matriz ───────────────────────────────────────────────────────────────────

export interface QrMatrix {
  version: number;
  size: number;
  mask: number;
  /** 1 = módulo oscuro, 0 = claro. Índice = row * size + col. */
  modules: Uint8Array;
  /** 1 = módulo de función (patrones, sincronismo, formato), no portador de datos. */
  functions: Uint8Array;
}

function makeMatrix(version: number): { size: number; modules: Uint8Array; functions: Uint8Array } {
  const size = version * 4 + 17;
  return { size, modules: new Uint8Array(size * size), functions: new Uint8Array(size * size) };
}

function setModule(m: QrMatrix, row: number, col: number, dark: boolean, isFunction: boolean): void {
  if (row < 0 || col < 0 || row >= m.size || col >= m.size) return;
  m.modules[row * m.size + col] = dark ? 1 : 0;
  if (isFunction) m.functions[row * m.size + col] = 1;
}

function getModule(m: QrMatrix, row: number, col: number): number {
  if (row < 0 || col < 0 || row >= m.size || col >= m.size) return 0;
  return m.modules[row * m.size + col] as number;
}

function isFunction(m: QrMatrix, row: number, col: number): boolean {
  return (m.functions[row * m.size + col] as number) === 1;
}

function drawFinder(m: QrMatrix, row: number, col: number): void {
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= m.size || c >= m.size) continue;
      const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      setModule(m, r, c, dist !== 2 && dist <= 3, true);
    }
  }
}

function drawAlignment(m: QrMatrix, row: number, col: number): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      setModule(m, row + dr, col + dc, dist !== 1, true);
    }
  }
}

function drawFunctionPatterns(m: QrMatrix): void {
  const size = m.size;

  // Sincronismo.
  for (let i = 0; i < size; i += 1) {
    setModule(m, 6, i, i % 2 === 0, true);
    setModule(m, i, 6, i % 2 === 0, true);
  }

  // Detectores de posición y sus separadores.
  drawFinder(m, 0, 0);
  drawFinder(m, 0, size - 7);
  drawFinder(m, size - 7, 0);

  // Patrones de alineación, salvo donde chocarían con los detectores de posición.
  const centers = ALIGNMENT_CENTERS[m.version - 1] ?? [];
  for (const r of centers) {
    for (const c of centers) {
      const corner =
        (r === 6 && c === 6) ||
        (r === 6 && c === size - 7) ||
        (r === size - 7 && c === 6);
      if (!corner) drawAlignment(m, r, c);
    }
  }

  // Información de formato con una máscara provisional: lo que importa aquí es **marcar**
  // esos módulos como de función para que la colocación de datos los salte. Los valores
  // definitivos se escriben en `buildMatrix`, una vez elegida la máscara.
  // Ojo: las posiciones (8,6) y (6,8) NO son de formato, son sincronismo, y por eso se
  // escriben una a una y no con un rectángulo de reserva.
  drawFormatBits(m, 0);

  // Información de versión (v ≥ 7).
  if (m.version >= 7) {
    const bits = versionInfoBits(m.version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setModule(m, b, a, bit, true);
      setModule(m, a, b, bit, true);
    }
  }
}

function drawFormatBits(m: QrMatrix, mask: number): void {
  const bits = formatInfoBits('M', mask);
  const size = m.size;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) setModule(m, i, 8, bit(i), true);
  setModule(m, 7, 8, bit(6), true);
  setModule(m, 8, 8, bit(7), true);
  setModule(m, 8, 7, bit(8), true);
  for (let i = 9; i < 15; i += 1) setModule(m, 8, 14 - i, bit(i), true);

  for (let i = 0; i < 8; i += 1) setModule(m, 8, size - 1 - i, bit(i), true);
  for (let i = 8; i < 15; i += 1) setModule(m, size - 15 + i, 8, bit(i), true);
  setModule(m, size - 8, 8, true, true);
}

/**
 * Recorrido de colocación: columnas de dos módulos de ancho, de derecha a izquierda,
 * saltando la columna 6 (sincronismo vertical), alternando sentido ascendente y descendente.
 */
export function placementOrder(size: number, functions: Uint8Array): Array<[number, number]> {
  const order: Array<[number, number]> = [];
  let right = size - 1;
  while (right >= 1) {
    // La columna 6 es sincronismo vertical: el par de columnas salta a 5–4.
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if ((functions[row * size + col] as number) === 0) order.push([row, col]);
      }
    }
    right -= 2;
  }
  return order;
}

export function maskAt(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      throw new QrError(`Máscara inválida: ${mask}`);
  }
}

/**
 * Penalización de la máscara (reglas N1 a N4 del estándar). Se usa solo para elegir la
 * máscara más legible; cualquier máscara produce un QR válido, así que un empate o una
 * diferencia de criterio no afecta a la decodificación.
 */
export function penaltyScore(m: QrMatrix): number {
  const size = m.size;
  const N1 = 3;
  const N2 = 3;
  const N3 = 40;
  const N4 = 10;
  let score = 0;

  const runPenalty = (line: number[]): number => {
    let total = 0;
    let runLength = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === line[i - 1]) {
        runLength += 1;
      } else {
        if (runLength >= 5) total += N1 + (runLength - 5);
        runLength = 1;
      }
    }
    if (runLength >= 5) total += N1 + (runLength - 5);
    return total;
  };

  const FINDER = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const FINDER_REV = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const finderPenalty = (line: number[]): number => {
    let total = 0;
    for (let i = 0; i + 11 <= line.length; i += 1) {
      const window = line.slice(i, i + 11);
      if (window.every((v, j) => v === FINDER[j])) total += N3;
      else if (window.every((v, j) => v === FINDER_REV[j])) total += N3;
    }
    return total;
  };

  for (let r = 0; r < size; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < size; c += 1) row.push(getModule(m, r, c));
    score += runPenalty(row) + finderPenalty(row);
  }
  for (let c = 0; c < size; c += 1) {
    const col: number[] = [];
    for (let r = 0; r < size; r += 1) col.push(getModule(m, r, c));
    score += runPenalty(col) + finderPenalty(col);
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = getModule(m, r, c);
      if (
        v === getModule(m, r, c + 1) &&
        v === getModule(m, r + 1, c) &&
        v === getModule(m, r + 1, c + 1)
      ) {
        score += N2;
      }
    }
  }

  let dark = 0;
  for (let i = 0; i < m.modules.length; i += 1) dark += m.modules[i] as number;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += Math.max(0, k) * N4;

  return score;
}

/** Construye la matriz completa con la máscara indicada (o la de menor penalización). */
export function buildMatrix(codewords: Uint8Array, version: number, forcedMask?: number): QrMatrix {
  const { size, modules, functions } = makeMatrix(version);
  const base: QrMatrix = { version, size, mask: 0, modules, functions };
  drawFunctionPatterns(base);

  const order = placementOrder(size, base.functions);
  const bitCount = codewords.length * 8;
  order.forEach(([row, col], i) => {
    if (i >= bitCount) return; // módulos remanentes: quedan claros
    const bit = (((codewords[i >>> 3] as number) >>> (7 - (i & 7))) & 1) === 1;
    base.modules[row * size + col] = bit ? 1 : 0;
  });

  const rawData = Uint8Array.from(base.modules);

  let best: QrMatrix | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const masks = forcedMask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [forcedMask];

  for (const mask of masks) {
    const candidate: QrMatrix = {
      version,
      size,
      mask,
      modules: Uint8Array.from(rawData),
      functions: base.functions,
    };
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (isFunction(candidate, row, col)) continue;
        if (maskAt(mask, row, col)) {
          candidate.modules[row * size + col] = (candidate.modules[row * size + col] as number) ^ 1;
        }
      }
    }
    drawFormatBits(candidate, mask);
    const score = penaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (!best) throw new QrError('No se pudo construir la matriz del QR');
  return best;
}

// ─── API pública ──────────────────────────────────────────────────────────────

export interface QrOptions {
  /** Módulos de zona tranquila alrededor del código. El estándar exige 4. */
  quietZone?: number;
  /** Tamaño del lado en píxeles del `viewBox`; el SVG escala al contenedor. */
  sizePx?: number;
  /** Color de los módulos oscuros. */
  dark?: string;
  /** Color del fondo. */
  light?: string;
  /** Texto alternativo del SVG. */
  ariaLabel?: string;
  /** Fuerza una máscara concreta (solo para pruebas). */
  mask?: number;
}

export interface QrResult {
  svg: string;
  version: number;
  size: number;
  mask: number;
  matrix: QrMatrix;
  codewords: Uint8Array;
}

/**
 * Codifica `text` (UTF-8) y devuelve la matriz y su SVG.
 *
 * El estándar define el modo byte sobre ISO-8859-1, pero todos los lectores actuales
 * interpretan UTF-8; la URL de verificación es ASCII, así que la diferencia no aplica aquí.
 */
export function encodeQr(text: string, options: QrOptions = {}): QrResult {
  const bytes = new Uint8Array(Buffer.from(text, 'utf8'));
  const version = pickVersion(bytes.length);
  const codewords = encodeToCodewords(bytes, version);
  const matrix = buildMatrix(codewords, version, options.mask);
  return {
    svg: renderMatrixSvg(matrix, options),
    version,
    size: matrix.size,
    mask: matrix.mask,
    matrix,
    codewords,
  };
}

export function renderMatrixSvg(matrix: QrMatrix, options: QrOptions = {}): string {
  const quiet = options.quietZone ?? 4;
  const dark = sanitizeColor(options.dark, '#0b0b0b');
  const light = sanitizeColor(options.light, '#ffffff');
  const side = matrix.size + quiet * 2;
  const label = (options.ariaLabel ?? 'Código QR de verificación del informe').replace(
    /[<>&"']/g,
    '',
  );

  // Un único `path` con un subtrazo por módulo oscuro: archivo pequeño y sin antialiasing.
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    let col = 0;
    while (col < matrix.size) {
      if (getModule(matrix, row, col) === 1) {
        let run = 1;
        while (col + run < matrix.size && getModule(matrix, row, col + run) === 1) run += 1;
        parts.push(`M${col + quiet} ${row + quiet}h${run}v1h-${run}z`);
        col += run;
      } else {
        col += 1;
      }
    }
  }

  const sizeAttr = options.sizePx ? ` width="${options.sizePx}" height="${options.sizePx}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"${sizeAttr} shape-rendering="crispEdges" role="img" aria-label="${label}"><title>${label}</title><rect width="${side}" height="${side}" fill="${light}"/><path d="${parts.join('')}" fill="${dark}"/></svg>`;
}

function sanitizeColor(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
    ? value
    : fallback;
}

/** Atajo usado por los informes: devuelve solo el SVG. */
export function qrSvg(text: string, options: QrOptions = {}): string {
  return encodeQr(text, options).svg;
}

/** `data:` URI del QR, por si hace falta insertarlo como `<img>`. */
export function qrDataUri(text: string, options: QrOptions = {}): string {
  return `data:image/svg+xml;base64,${Buffer.from(qrSvg(text, options), 'utf8').toString('base64')}`;
}
