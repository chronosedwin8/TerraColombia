/**
 * Municipio de demostración (ADR-006).
 *
 * **Estos predios NO son reales.** Se generan de forma determinista para que existan
 * pruebas, demostración y desarrollo sin depender de una descarga de gigabytes del IGAC.
 * El snapshot que los contiene lleva `is_synthetic = true`, la API marca toda respuesta
 * que los toque con `meta.synthetic = true`, la UI muestra una banda roja, y
 * `meta.publish_snapshot` impide que tapen un corte real.
 *
 * Se usa una rejilla regular sobre un rectángulo pequeño, con NPN bien formados según la
 * estructura real de 30 dígitos. Nada de esto se presenta como dato del IGAC.
 */

export interface DemoParcel {
  npn: string;
  muniCode: string;
  deptCode: string;
  zone: '01' | '02';
  sector: string;
  commune: string;
  neighborhood: string;
  blockOrVereda: string;
  terrain: string;
  areaReportedM2: number;
  builtAreaM2: number | null;
  economicUse: string;
  address: string;
  cadastralValue: number | null;
  valuationYear: number | null;
  /** Anillo exterior del polígono, [lng, lat], cerrado. */
  ring: Array<[number, number]>;
  buildings: Array<{ ref: string; floors: number; builtAreaM2: number; use: string }>;
}

/** Generador congruencial lineal: la semilla fija hace la salida reproducible. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const ECONOMIC_USES = [
  'Habitacional',
  'Comercial',
  'Lote urbanizable no urbanizado',
  'Institucional',
  'Industrial',
  'Agropecuario',
] as const;

const WAY_TYPES = ['CALLE', 'CARRERA'] as const;

export interface DemoOptions {
  muniCode: string;
  /** Esquina suroccidental del área de demostración. */
  originLng: number;
  originLat: number;
  cols: number;
  rows: number;
  /** Tamaño de cada predio en grados. ~0.00025° ≈ 28 m en latitud. */
  cellSize: number;
  seed: number;
}

export const DEFAULT_DEMO: DemoOptions = {
  // Soledad, Atlántico (08758): municipio de tamaño medio bajo jurisdicción del IGAC.
  muniCode: '08758',
  originLng: -74.7745,
  originLat: 10.9095,
  cols: 24,
  rows: 22,
  cellSize: 0.00035,
  seed: 20260921,
};

export function generateDemoParcels(opts: DemoOptions = DEFAULT_DEMO): DemoParcel[] {
  const rand = makeRandom(opts.seed);
  const deptCode = opts.muniCode.slice(0, 2);
  const muniPart = opts.muniCode.slice(2, 5);
  const out: DemoParcel[] = [];

  for (let row = 0; row < opts.rows; row++) {
    for (let col = 0; col < opts.cols; col++) {
      const minLng = opts.originLng + col * opts.cellSize;
      const minLat = opts.originLat + row * opts.cellSize;
      // Se deja un pequeño margen entre predios para que no compartan aristas exactas.
      const margin = opts.cellSize * 0.08;
      const maxLng = minLng + opts.cellSize - margin;
      const maxLat = minLat + opts.cellSize - margin;

      const blockIndex = Math.floor(row / 4) * 10 + Math.floor(col / 6) + 1;
      const terrainIndex = ((row % 4) * 6 + (col % 6)) + 1;

      const zone: '01' | '02' = row < opts.rows - 4 ? '01' : '02';
      const sector = '01';
      const commune = zone === '01' ? '01' : '00';
      const neighborhood = zone === '01' ? String(1 + (blockIndex % 9)).padStart(2, '0') : '00';
      const blockOrVereda = String(blockIndex).padStart(4, '0');
      const terrain = String(terrainIndex).padStart(4, '0');

      const npn =
        deptCode +
        muniPart +
        zone +
        sector +
        commune +
        neighborhood +
        blockOrVereda +
        terrain +
        '0' + // condición: predio completo
        '00' + // edificio
        '00' + // piso
        '0000'; // unidad

      const r = rand();
      const useIndex =
        zone === '02'
          ? 5
          : r < 0.62
            ? 0
            : r < 0.78
              ? 1
              : r < 0.9
                ? 2
                : r < 0.96
                  ? 3
                  : 4;
      const economicUse = ECONOMIC_USES[useIndex]!;

      // Área aproximada de la celda en m² (1° lat ≈ 110.574 m, 1° lng ≈ 111.320·cos(lat) m).
      const latRad = (minLat * Math.PI) / 180;
      const widthM = (maxLng - minLng) * 111_320 * Math.cos(latRad);
      const heightM = (maxLat - minLat) * 110_574;
      const areaM2 = Math.round(widthM * heightM * (0.85 + rand() * 0.3));

      const isLot = economicUse === 'Lote urbanizable no urbanizado';
      const floors = isLot ? 0 : 1 + Math.floor(rand() * (zone === '01' ? 4 : 2));
      const footprint = isLot ? 0 : Math.round(areaM2 * (0.35 + rand() * 0.35));
      const builtAreaM2 = isLot ? null : footprint * Math.max(1, floors);

      const wayType = WAY_TYPES[col % 2]!;
      const wayNumber = 10 + row;
      const crossNumber = 20 + col;
      const plate = 10 + ((row * 7 + col * 3) % 80);

      out.push({
        npn,
        muniCode: opts.muniCode,
        deptCode,
        zone,
        sector,
        commune,
        neighborhood,
        blockOrVereda,
        terrain,
        areaReportedM2: areaM2,
        builtAreaM2,
        economicUse,
        address:
          zone === '01'
            ? `${wayType} ${wayNumber} # ${crossNumber}-${plate}`
            : `VEREDA DEMOSTRACION PREDIO ${terrain}`,
        // Valor CATASTRAL ficticio, coherente en orden de magnitud pero sin ningún
        // respaldo real. Nunca debe presentarse como avalúo del IGAC.
        cadastralValue: isLot
          ? Math.round(areaM2 * (90_000 + rand() * 60_000))
          : Math.round(areaM2 * (180_000 + rand() * 220_000)),
        valuationYear: 2025,
        ring: [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
        buildings:
          isLot || builtAreaM2 === null
            ? []
            : [
                {
                  ref: '01',
                  floors,
                  builtAreaM2,
                  use: economicUse === 'Habitacional' ? 'Vivienda' : economicUse,
                },
              ],
      });
    }
  }

  return out;
}

/** Huella de construcción: rectángulo centrado dentro del predio, al 60 % de su ancho. */
export function buildingRing(parcel: DemoParcel): Array<[number, number]> {
  const ring = parcel.ring;
  const p0 = ring[0]!;
  const p2 = ring[2]!;
  const minLng = p0[0];
  const minLat = p0[1];
  const maxLng = p2[0];
  const maxLat = p2[1];
  const insetX = (maxLng - minLng) * 0.2;
  const insetY = (maxLat - minLat) * 0.2;
  return [
    [minLng + insetX, minLat + insetY],
    [maxLng - insetX, minLat + insetY],
    [maxLng - insetX, maxLat - insetY],
    [minLng + insetX, maxLat - insetY],
    [minLng + insetX, minLat + insetY],
  ];
}

export function centroidOf(ring: Array<[number, number]>): [number, number] {
  const p0 = ring[0]!;
  const p2 = ring[2]!;
  return [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
}

/**
 * Colegios y prestadores de salud de demostración, para que el contexto de la ficha
 * tenga algo que mostrar. Igual que los predios: sintéticos y marcados como tales.
 */
export function generateDemoFacilities(opts: DemoOptions = DEFAULT_DEMO) {
  const rand = makeRandom(opts.seed + 7);
  const spanLng = opts.cols * opts.cellSize;
  const spanLat = opts.rows * opts.cellSize;
  const schools = Array.from({ length: 6 }, (_, i) => ({
    name: `Institución Educativa de Demostración ${i + 1}`,
    sector: i % 3 === 0 ? 'no_oficial' : 'oficial',
    levels: ['Preescolar', 'Básica primaria', 'Básica secundaria'],
    enrollment: 200 + Math.floor(rand() * 900),
    lng: opts.originLng + rand() * spanLng,
    lat: opts.originLat + rand() * spanLat,
  }));
  const health = Array.from({ length: 3 }, (_, i) => ({
    name: `IPS de Demostración ${i + 1}`,
    level: i === 0 ? 'Nivel 2' : 'Nivel 1',
    nature: i === 0 ? 'publico' : 'privado',
    services: ['Consulta externa', 'Urgencias'],
    lng: opts.originLng + rand() * spanLng,
    lat: opts.originLat + rand() * spanLat,
  }));
  const pois = Array.from({ length: 40 }, (_, i) => {
    const categories = ['comercio', 'alimentacion', 'financiero', 'ocio', 'servicios'];
    return {
      category: categories[i % categories.length]!,
      subcategory: null as string | null,
      name: `Establecimiento de demostración ${i + 1}`,
      lng: opts.originLng + rand() * spanLng,
      lat: opts.originLat + rand() * spanLat,
    };
  });
  return { schools, health, pois };
}
