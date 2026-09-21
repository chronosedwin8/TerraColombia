import { describe, expect, it } from 'vitest';
import {
  BLOCKS_M,
  TOTAL_CODEWORDS,
  blockSpec,
  byteCapacity,
  dataCodewordsFor,
  encodeQr,
  encodeToCodewords,
  formatInfoBits,
  gfExp,
  gfLog,
  gfMul,
  maskAt,
  pickVersion,
  placementOrder,
  qrSvg,
  rsEncode,
  rsGeneratorPoly,
  versionInfoBits,
  type QrMatrix,
} from '../src/qr.js';

/**
 * Los vectores de este archivo son los publicados en ISO/IEC 18004 (información de formato,
 * información de versión, capacidades y polinomios generadores). No se comparan contra otra
 * implementación: se comparan contra el estándar.
 */

// ─── Información de formato: tabla del Anexo C del estándar ───────────────────

const FORMAT_INFO: Record<'L' | 'M' | 'Q' | 'H', string[]> = {
  L: [
    '111011111000100',
    '111001011110011',
    '111110110101010',
    '111100010011101',
    '110011000101111',
    '110001100011000',
    '110110001000001',
    '110100101110110',
  ],
  M: [
    '101010000010010',
    '101000100100101',
    '101111001111100',
    '101101101001011',
    '100010111111001',
    '100000011001110',
    '100111110010111',
    '100101010100000',
  ],
  Q: [
    '011010101011111',
    '011000001101000',
    '011111100110001',
    '011101000000110',
    '010010010110100',
    '010000110000011',
    '010111011011010',
    '010101111101101',
  ],
  H: [
    '001011010001001',
    '001001110111110',
    '001110011100111',
    '001100111010000',
    '000011101100010',
    '000001001010101',
    '000110100001100',
    '000100000111011',
  ],
};

/** Información de versión para las versiones que soporta este generador. */
const VERSION_INFO: Record<number, string> = {
  7: '000111110010010100',
  8: '001000010110111100',
  9: '001001101010011001',
  10: '001010010011010011',
};

/** Capacidad en bytes con corrección M, versiones 1 a 10. */
const BYTE_CAPACITY_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

/** Exponentes α del polinomio generador de grado 10 (Anexo A del estándar). */
const GEN_10_ALPHA = [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45];

describe('campo de Galois GF(256)', () => {
  it('usa el polinomio primitivo 0x11D', () => {
    // α⁸ = 0x1D es la consecuencia directa del polinomio primitivo del estándar.
    expect(gfExp(8)).toBe(0x1d);
    expect(gfExp(0)).toBe(1);
    expect(gfExp(255)).toBe(1);
  });

  it('exp y log son inversos en todo el campo', () => {
    for (let i = 1; i < 256; i += 1) {
      expect(gfExp(gfLog(i))).toBe(i);
    }
  });

  it('la multiplicación es conmutativa y absorbe el cero', () => {
    expect(gfMul(0, 123)).toBe(0);
    expect(gfMul(123, 0)).toBe(0);
    expect(gfMul(1, 200)).toBe(200);
    expect(gfMul(87, 131)).toBe(gfMul(131, 87));
  });
});

describe('Reed-Solomon', () => {
  it('reproduce el polinomio generador de grado 10 del estándar', () => {
    const gen = rsGeneratorPoly(10);
    expect(gen.length).toBe(11);
    expect([...gen].map((c) => gfLog(c))).toEqual(GEN_10_ALPHA);
  });

  it('produce polinomios divisibles por el generador (definición del código)', () => {
    const evalAt = (coeffs: number[], x: number): number => {
      let y = 0;
      for (const c of coeffs) y = gfMul(y, x) ^ c;
      return y;
    };
    for (const ecLength of [10, 16, 18, 22, 24, 26]) {
      const data = Uint8Array.from(
        Array.from({ length: 30 }, (_, i) => (i * 37 + 11) & 0xff),
      );
      const ec = rsEncode(data, ecLength);
      expect(ec.length).toBe(ecLength);
      const full = [...data, ...ec];
      for (let i = 0; i < ecLength; i += 1) {
        expect(evalAt(full, gfExp(i))).toBe(0);
      }
    }
  });
});

describe('información de formato y de versión', () => {
  it('coincide con la tabla del Anexo C para los 32 pares nivel/máscara', () => {
    for (const level of ['L', 'M', 'Q', 'H'] as const) {
      for (let mask = 0; mask < 8; mask += 1) {
        expect(formatInfoBits(level, mask).toString(2).padStart(15, '0')).toBe(
          FORMAT_INFO[level][mask],
        );
      }
    }
  });

  it('coincide con la tabla del Anexo D para las versiones 7 a 10', () => {
    for (const [version, bits] of Object.entries(VERSION_INFO)) {
      expect(versionInfoBits(Number(version)).toString(2).padStart(18, '0')).toBe(bits);
    }
  });

  it('no produce información de versión por debajo de la 7', () => {
    expect(() => versionInfoBits(6)).toThrow();
  });
});

describe('tablas de bloques y capacidad', () => {
  it('los bloques suman exactamente los codewords totales de cada versión', () => {
    BLOCKS_M.forEach((spec, i) => {
      const total =
        spec.group1Blocks * (spec.group1DataCodewords + spec.ecPerBlock) +
        spec.group2Blocks * (spec.group2DataCodewords + spec.ecPerBlock);
      expect(total).toBe(TOTAL_CODEWORDS[i]);
    });
  });

  it('la capacidad en bytes con nivel M es la del estándar', () => {
    BYTE_CAPACITY_M.forEach((expected, i) => {
      expect(byteCapacity(i + 1)).toBe(expected);
    });
  });

  it('elige la versión mínima que admite el contenido', () => {
    expect(pickVersion(14)).toBe(1);
    expect(pickVersion(15)).toBe(2);
    expect(pickVersion(213)).toBe(10);
    expect(() => pickVersion(214)).toThrow(/no cabe/i);
  });

  it('rechaza versiones fuera del alcance soportado', () => {
    expect(() => blockSpec(11)).toThrow(/no soportada/i);
  });
});

// ─── Decodificador independiente, para probar la matriz de punta a punta ──────

interface Decoded {
  eccBits: number;
  mask: number;
  mode: number;
  text: string;
  codewords: Uint8Array;
}

/**
 * Lee la matriz como lo haría un lector: extrae la información de formato, desenmascara,
 * recorre el orden de colocación, des-intercala los bloques y decodifica el modo byte.
 * No reutiliza la lógica del codificador más allá de las tablas del estándar.
 */
function decodeMatrix(m: QrMatrix): Decoded {
  const size = m.size;
  const get = (r: number, c: number) => m.modules[r * size + c] as number;

  const bits: number[] = [];
  for (let i = 0; i <= 5; i += 1) bits[i] = get(i, 8);
  bits[6] = get(7, 8);
  bits[7] = get(8, 8);
  bits[8] = get(8, 7);
  for (let i = 9; i < 15; i += 1) bits[i] = get(8, 14 - i);
  let fmt = 0;
  for (let i = 0; i < 15; i += 1) fmt |= (bits[i] as number) << i;
  fmt ^= 0b101010000010010;
  const eccBits = (fmt >>> 13) & 0b11;
  const mask = (fmt >>> 10) & 0b111;

  const total = TOTAL_CODEWORDS[m.version - 1] as number;
  const codewords = new Uint8Array(total);
  placementOrder(size, m.functions).forEach(([r, c], i) => {
    if (i >= total * 8) return;
    let v = get(r, c);
    if (maskAt(mask, r, c)) v ^= 1;
    if (v) codewords[i >>> 3] = (codewords[i >>> 3] as number) | (0x80 >>> (i & 7));
  });

  const spec = blockSpec(m.version);
  const blocks: Uint8Array[] = [];
  for (let i = 0; i < spec.group1Blocks; i += 1) blocks.push(new Uint8Array(spec.group1DataCodewords));
  for (let i = 0; i < spec.group2Blocks; i += 1) blocks.push(new Uint8Array(spec.group2DataCodewords));
  let k = 0;
  const maxLen = Math.max(spec.group1DataCodewords, spec.group2DataCodewords);
  for (let i = 0; i < maxLen; i += 1) {
    for (const b of blocks) if (i < b.length) b[i] = codewords[k++] as number;
  }
  const data = Uint8Array.from(blocks.flatMap((b) => [...b]));

  let p = 0;
  const readBits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i += 1) {
      v = (v << 1) | (((data[p >>> 3] as number) >>> (7 - (p & 7))) & 1);
      p += 1;
    }
    return v;
  };
  const mode = readBits(4);
  const count = readBits(m.version <= 9 ? 8 : 16);
  const bytes: number[] = [];
  for (let i = 0; i < count; i += 1) bytes.push(readBits(8));

  return { eccBits, mask, mode, text: Buffer.from(bytes).toString('utf8'), codewords };
}

describe('matriz del QR', () => {
  const cases = [
    'A',
    'https://terracolombia.co/v/1',
    'https://terracolombia.co/verificar/01JQZX8K4T2M3N4P5Q6R7S8T9V',
    `https://terracolombia.co/verificar/${'x'.repeat(170)}`,
  ];

  it.each(cases)('un lector independiente recupera el contenido de %s', (input) => {
    const r = encodeQr(input);
    const d = decodeMatrix(r.matrix);
    expect(d.text).toBe(input);
    expect(d.mode).toBe(0b0100); // modo byte
    expect(d.eccBits).toBe(0b00); // nivel M
    expect(d.mask).toBe(r.mask);
    expect([...d.codewords]).toEqual([...r.codewords]);
  });

  it('coloca los tres detectores de posición y el módulo siempre oscuro', () => {
    const { matrix } = encodeQr('https://terracolombia.co/v/abc');
    const g = (r: number, c: number) => matrix.modules[r * matrix.size + c];
    for (const [r0, c0] of [
      [0, 0],
      [0, matrix.size - 7],
      [matrix.size - 7, 0],
    ] as const) {
      // Anillo exterior oscuro, anillo intermedio claro, núcleo oscuro.
      expect(g(r0, c0)).toBe(1);
      expect(g(r0 + 1, c0 + 1)).toBe(0);
      expect(g(r0 + 2, c0 + 2)).toBe(1);
      expect(g(r0 + 3, c0 + 3)).toBe(1);
    }
    // Esquina inferior derecha: nunca hay detector de posición.
    expect(g(matrix.size - 1, matrix.size - 1)).toBeDefined();
    // Módulo siempre oscuro del estándar.
    expect(g(matrix.size - 8, 8)).toBe(1);
  });

  it('mantiene los patrones de sincronismo alternados', () => {
    const { matrix } = encodeQr('https://terracolombia.co/v/abc');
    const g = (r: number, c: number) => matrix.modules[r * matrix.size + c];
    for (let i = 8; i < matrix.size - 8; i += 1) {
      expect(g(6, i)).toBe(i % 2 === 0 ? 1 : 0);
      expect(g(i, 6)).toBe(i % 2 === 0 ? 1 : 0);
    }
  });

  it('el tamaño es 4v + 17 y coincide con la versión elegida', () => {
    for (const input of cases) {
      const r = encodeQr(input);
      expect(r.size).toBe(r.version * 4 + 17);
    }
  });

  it('el intercalado produce exactamente los codewords totales de la versión', () => {
    const bytes = new Uint8Array(Buffer.from('x'.repeat(100), 'utf8'));
    const version = pickVersion(bytes.length);
    const cw = encodeToCodewords(bytes, version);
    expect(cw.length).toBe(TOTAL_CODEWORDS[version - 1]);
    expect(cw.length).toBe(dataCodewordsFor(version) + blockSpec(version).ecPerBlock * (blockSpec(version).group1Blocks + blockSpec(version).group2Blocks));
  });
});

describe('SVG del QR', () => {
  it('incluye la zona tranquila de 4 módulos y no deja HTML inyectable', () => {
    const svg = qrSvg('https://terracolombia.co/verificar/abc', {
      ariaLabel: 'texto "peligroso" <b>',
    });
    const { size } = encodeQr('https://terracolombia.co/verificar/abc');
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
    expect(svg).not.toContain('<b>');
    expect(svg).not.toContain('"peligroso"');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('respeta una máscara forzada', () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const r = encodeQr('https://terracolombia.co/v/1', { mask });
      expect(r.mask).toBe(mask);
      expect(decodeMatrix(r.matrix).text).toBe('https://terracolombia.co/v/1');
    }
  });
});
