/**
 * Capas de contexto de demostración (ADR-006).
 *
 * **Nada de esto es un dato real.** Son polígonos y valores sintéticos, generados de forma
 * determinista, cuyo único propósito es que la aptitud de terreno, el mapa de oportunidad y
 * el informe territorial se puedan revisar de punta a punta antes de cargar las fuentes
 * verdaderas (que son descargas de gigabytes).
 *
 * Garantías:
 *  - Van en snapshots con `is_synthetic = true`, así que la API marca `meta.synthetic` y la
 *    interfaz muestra la banda roja de demostración.
 *  - `meta.publish_snapshot` impide que tapen un corte real del mismo dataset.
 *  - Los identificadores de dataset empiezan por `demo-`, nunca por el de una fuente real,
 *    para que nadie pueda confundirlos leyendo la procedencia.
 */

import { DEFAULT_DEMO } from './demo-cadastre.js';
import type { DemoOptions } from './demo-cadastre.js';

/** Generador congruencial lineal: la semilla fija hace la salida reproducible. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface DemoDatasetDeclaration {
  id: string;
  source: 'DEMO';
  name: string;
  license: 'NO_DISPONIBLE';
  attribution: string;
  frequency: 'eventual';
  connector: 'manual';
  format: 'synthetic';
  targetTable: string;
}

export const DEMO_CONTEXT_DATASETS: DemoDatasetDeclaration[] = [
  {
    id: 'demo-soils',
    source: 'DEMO',
    name: 'Suelos de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution:
      'DATOS DE DEMOSTRACIÓN generados por TerraColombia. No provienen del estudio agrológico del IGAC.',
    frequency: 'eventual',
    connector: 'manual',
    format: 'synthetic',
    targetTable: 'ctx.soil_unit',
  },
  {
    id: 'demo-hazards',
    source: 'DEMO',
    name: 'Amenazas de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution:
      'DATOS DE DEMOSTRACIÓN generados por TerraColombia. No provienen del SGC ni del IDEAM.',
    frequency: 'eventual',
    connector: 'manual',
    format: 'synthetic',
    targetTable: 'ctx.hazard',
  },
  {
    id: 'demo-census',
    source: 'DEMO',
    name: 'Manzanas censales de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution: 'DATOS DE DEMOSTRACIÓN generados por TerraColombia. No provienen del DANE.',
    frequency: 'eventual',
    connector: 'manual',
    format: 'synthetic',
    targetTable: 'ctx.census_block',
  },
  {
    id: 'demo-roads',
    source: 'DEMO',
    name: 'Vías de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution:
      'DATOS DE DEMOSTRACIÓN generados por TerraColombia. No provienen de OpenStreetMap.',
    frequency: 'eventual',
    connector: 'manual',
    format: 'synthetic',
    targetTable: 'ctx.road',
  },
  {
    id: 'demo-relief',
    source: 'DEMO',
    name: 'Relieve de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution:
      'DATOS DE DEMOSTRACIÓN generados por TerraColombia. No provienen del DEM de Copernicus.',
    frequency: 'eventual',
    connector: 'manual',
    format: 'synthetic',
    targetTable: 'ctx.elevation_cell',
  },
  {
    id: 'demo-urban-perimeter',
    source: 'DEMO',
    name: 'Perímetro urbano de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution: 'DATOS DE DEMOSTRACIÓN generados por TerraColombia.',
    frequency: 'eventual',
    connector: 'manual',
    format: 'synthetic',
    targetTable: 'core.urban_perimeter',
  },
  {
    id: 'demo-protected',
    source: 'DEMO',
    name: 'Área protegida de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution: 'DATOS DE DEMOSTRACIÓN generados por TerraColombia. No provienen del RUNAP.',
    frequency: 'eventual',
    connector: 'manual',
    format: 'synthetic',
    targetTable: 'ctx.protected_area',
  },
];

type Ring = Array<[number, number]>;

function rect(minLng: number, minLat: number, maxLng: number, maxLat: number): Ring {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

export interface DemoSoilUnit {
  symbol: string;
  description: string;
  slopeRange: string;
  climate: string;
  /** Clase agrológica 1–8. */
  capabilityClass: number;
  subclass: string;
  vocation: string;
  useClass: string;
  ring: Ring;
}

/**
 * Cuatro bandas de suelo que cruzan la zona de demostración de sur a norte, con clases
 * agrológicas que van de buena (3) a muy limitada (7). Así el semáforo de aptitud
 * agrícola cambia visiblemente según dónde caiga el predio.
 */
export function generateDemoSoils(opts: DemoOptions = DEFAULT_DEMO): DemoSoilUnit[] {
  const spanLng = opts.cols * opts.cellSize;
  const spanLat = opts.rows * opts.cellSize;
  const bandas: Array<Omit<DemoSoilUnit, 'ring'>> = [
    {
      symbol: 'DMO-1',
      description: 'Suelos profundos de planicie, bien drenados (demostración)',
      slopeRange: '0-3 %',
      climate: 'Cálido seco',
      capabilityClass: 3,
      subclass: '3s',
      vocation: 'agricola',
      useClass: 'Cultivos transitorios intensivos',
    },
    {
      symbol: 'DMO-2',
      description: 'Suelos moderadamente profundos con drenaje imperfecto (demostración)',
      slopeRange: '3-7 %',
      climate: 'Cálido seco',
      capabilityClass: 4,
      subclass: '4sh',
      vocation: 'agroforestal',
      useClass: 'Cultivos permanentes semi-intensivos',
    },
    {
      symbol: 'DMO-3',
      description: 'Suelos superficiales en lomerío, erosión ligera (demostración)',
      slopeRange: '7-12 %',
      climate: 'Cálido seco',
      capabilityClass: 6,
      subclass: '6pe',
      vocation: 'ganadera',
      useClass: 'Pastoreo extensivo',
    },
    {
      symbol: 'DMO-4',
      description: 'Suelos muy superficiales con pedregosidad, erosión severa (demostración)',
      slopeRange: '12-25 %',
      climate: 'Cálido seco',
      capabilityClass: 7,
      subclass: '7pes',
      vocation: 'forestal',
      useClass: 'Forestal de protección-producción',
    },
  ];

  return bandas.map((b, i) => {
    const minLat = opts.originLat + (spanLat * i) / bandas.length;
    const maxLat = opts.originLat + (spanLat * (i + 1)) / bandas.length;
    // Se extiende un poco más allá del área de predios para que los cubra por completo.
    return {
      ...b,
      ring: rect(
        opts.originLng - opts.cellSize * 2,
        minLat,
        opts.originLng + spanLng + opts.cellSize * 2,
        maxLat,
      ),
    };
  });
}

export interface DemoHazard {
  kind: string;
  level: string;
  levelRank: number;
  scale: string;
  ring: Ring;
}

/**
 * Una franja de amenaza alta por movimiento en masa en el borde norte (la zona de mayor
 * pendiente) y una de inundación media en el sur. Cubren parte del área, no toda, para que
 * se vea la diferencia entre predios.
 */
export function generateDemoHazards(opts: DemoOptions = DEFAULT_DEMO): DemoHazard[] {
  const spanLng = opts.cols * opts.cellSize;
  const spanLat = opts.rows * opts.cellSize;
  return [
    {
      kind: 'mass_movement',
      level: 'Alta',
      levelRank: 4,
      scale: '1:25.000 (demostración)',
      ring: rect(
        opts.originLng - opts.cellSize,
        opts.originLat + spanLat * 0.78,
        opts.originLng + spanLng + opts.cellSize,
        opts.originLat + spanLat + opts.cellSize * 2,
      ),
    },
    {
      kind: 'flood',
      level: 'Media',
      levelRank: 3,
      scale: '1:25.000 (demostración)',
      ring: rect(
        opts.originLng - opts.cellSize,
        opts.originLat - opts.cellSize,
        opts.originLng + spanLng + opts.cellSize,
        opts.originLat + spanLat * 0.22,
      ),
    },
    {
      kind: 'seismic',
      level: 'Media',
      levelRank: 3,
      scale: '1:100.000 (demostración)',
      ring: rect(
        opts.originLng - opts.cellSize * 3,
        opts.originLat - opts.cellSize * 3,
        opts.originLng + spanLng + opts.cellSize * 3,
        opts.originLat + spanLat + opts.cellSize * 3,
      ),
    },
  ];
}

export interface DemoCensusBlock {
  code: string;
  popTotal: number;
  households: number;
  dwellings: number;
  /** Bandas de edad del censo, con las claves que usa `ctx.census_block.age_bands`. */
  ageBands: Record<string, number>;
  ring: Ring;
}

/**
 * Rejilla de 6 × 6 manzanas censales sobre la zona urbana. La población baja de sur a norte,
 * como suele ocurrir al alejarse del centro, para que la densidad no sea plana.
 */
export function generateDemoCensusBlocks(opts: DemoOptions = DEFAULT_DEMO): DemoCensusBlock[] {
  const rand = makeRandom(opts.seed + 31);
  const out: DemoCensusBlock[] = [];
  const cols = 6;
  const rows = 6;
  const w = (opts.cols * opts.cellSize) / cols;
  const h = (opts.rows * opts.cellSize * 0.8) / rows; // solo la parte urbana

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const minLng = opts.originLng + c * w;
      const minLat = opts.originLat + r * h;
      // Más población en el sur (r bajo) y en el centro (c medio).
      const factorFila = 1 - r / (rows * 1.6);
      const factorColumna = 1 - Math.abs(c - (cols - 1) / 2) / cols;
      const pop = Math.round((140 + rand() * 260) * factorFila * (0.7 + factorColumna * 0.6));
      const households = Math.max(1, Math.round(pop / (3.2 + rand() * 0.8)));
      out.push({
        code: `DEMO-${String(r).padStart(2, '0')}${String(c).padStart(2, '0')}`,
        popTotal: pop,
        households,
        dwellings: households + Math.round(rand() * 6),
        ageBands: {
          '0_4': Math.round(pop * 0.08),
          '5_9': Math.round(pop * 0.085),
          '10_14': Math.round(pop * 0.088),
          '15_19': Math.round(pop * 0.086),
          '20_24': Math.round(pop * 0.09),
          '25_29': Math.round(pop * 0.085),
          '30_39': Math.round(pop * 0.15),
          '40_49': Math.round(pop * 0.13),
          '50_59': Math.round(pop * 0.1),
          '60_mas': Math.round(pop * 0.096),
        },
        ring: rect(minLng, minLat, minLng + w * 0.96, minLat + h * 0.96),
      });
    }
  }
  return out;
}

export interface DemoRoad {
  class: string;
  name: string;
  surface: string;
  isPaved: boolean;
  lanes: number;
  maxspeedKmh: number;
  /** Línea, no anillo. */
  line: Array<[number, number]>;
}

/**
 * Una vía primaria pavimentada que bordea el sur, una secundaria que cruza en el medio y dos
 * locales. Así la accesibilidad varía de verdad entre predios cercanos y lejanos.
 */
export function generateDemoRoads(opts: DemoOptions = DEFAULT_DEMO): DemoRoad[] {
  const spanLng = opts.cols * opts.cellSize;
  const spanLat = opts.rows * opts.cellSize;
  const x0 = opts.originLng - opts.cellSize;
  const x1 = opts.originLng + spanLng + opts.cellSize;
  return [
    {
      class: 'primary',
      name: 'Vía Primaria de Demostración',
      surface: 'asphalt',
      isPaved: true,
      lanes: 4,
      maxspeedKmh: 80,
      line: [
        [x0, opts.originLat - opts.cellSize * 0.5],
        [x1, opts.originLat - opts.cellSize * 0.5],
      ],
    },
    {
      class: 'secondary',
      name: 'Vía Secundaria de Demostración',
      surface: 'asphalt',
      isPaved: true,
      lanes: 2,
      maxspeedKmh: 50,
      line: [
        [x0, opts.originLat + spanLat * 0.45],
        [x1, opts.originLat + spanLat * 0.45],
      ],
    },
    {
      class: 'residential',
      name: 'Calle Local de Demostración 1',
      surface: 'concrete',
      isPaved: true,
      lanes: 2,
      maxspeedKmh: 30,
      line: [
        [opts.originLng + spanLng * 0.25, opts.originLat],
        [opts.originLng + spanLng * 0.25, opts.originLat + spanLat],
      ],
    },
    {
      class: 'track',
      name: 'Camino Rural de Demostración',
      surface: 'unpaved',
      isPaved: false,
      lanes: 1,
      maxspeedKmh: 20,
      line: [
        [opts.originLng + spanLng * 0.75, opts.originLat + spanLat * 0.8],
        [opts.originLng + spanLng * 0.75, opts.originLat + spanLat + opts.cellSize],
      ],
    },
  ];
}

/**
 * Perímetro urbano: cubre el 80 % sur del área, que es donde los predios tienen zona 01.
 * Sin esta capa, la aptitud no puede decidir si un predio es urbano o rural más allá del NPN.
 */
export function generateDemoUrbanPerimeter(opts: DemoOptions = DEFAULT_DEMO): Ring {
  const spanLng = opts.cols * opts.cellSize;
  const spanLat = opts.rows * opts.cellSize;
  return rect(
    opts.originLng - opts.cellSize * 0.5,
    opts.originLat - opts.cellSize * 0.5,
    opts.originLng + spanLng + opts.cellSize * 0.5,
    opts.originLat + spanLat * 0.82,
  );
}

/**
 * Un área protegida pequeña en la esquina nororiental, que se solapa con unos pocos predios.
 * Permite ver el bloqueante duro de la aptitud sin invalidar toda la zona.
 */
export function generateDemoProtectedArea(opts: DemoOptions = DEFAULT_DEMO): {
  name: string;
  category: string;
  authority: string;
  ring: Ring;
} {
  const spanLng = opts.cols * opts.cellSize;
  const spanLat = opts.rows * opts.cellSize;
  return {
    name: 'Reserva de Demostración El Ejemplo',
    category: 'Reserva Natural de la Sociedad Civil (demostración)',
    authority: 'Autoridad de demostración',
    ring: rect(
      opts.originLng + spanLng * 0.82,
      opts.originLat + spanLat * 0.85,
      opts.originLng + spanLng + opts.cellSize,
      opts.originLat + spanLat + opts.cellSize,
    ),
  };
}

export interface DemoReliefCell {
  /** Se resuelve en SQL con h3_lat_lng_to_cell sobre este punto. */
  lng: number;
  lat: number;
  res: number;
  elevationMinM: number;
  elevationMeanM: number;
  elevationMaxM: number;
  slopeMeanPct: number;
  slopeMaxPct: number;
}

/**
 * Relieve por celda H3: plano en el sur (2 % de pendiente) y más quebrado en el norte
 * (hasta 32 %), con la altitud subiendo en la misma dirección. Cubre las resoluciones 8 y 9,
 * que son las que consultan el motor y los agregados.
 */
export function generateDemoRelief(opts: DemoOptions = DEFAULT_DEMO): DemoReliefCell[] {
  const out: DemoReliefCell[] = [];
  const cols = 14;
  const rows = 14;
  const spanLng = opts.cols * opts.cellSize;
  const spanLat = opts.rows * opts.cellSize;

  for (const res of [8, 9]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lng = opts.originLng + (spanLng * (c + 0.5)) / cols;
        const lat = opts.originLat + (spanLat * (r + 0.5)) / rows;
        const norte = r / (rows - 1); // 0 en el sur, 1 en el norte
        const slope = 2 + norte * 30;
        const elev = 8 + norte * 120;
        out.push({
          lng,
          lat,
          res,
          elevationMinM: Math.round(elev - 4),
          elevationMeanM: Math.round(elev),
          elevationMaxM: Math.round(elev + 6),
          slopeMeanPct: Number(slope.toFixed(1)),
          slopeMaxPct: Number((slope * 1.5).toFixed(1)),
        });
      }
    }
  }
  return out;
}

export function ringToWkt(ring: Ring): string {
  return `MULTIPOLYGON(((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(',')})))`;
}

export function lineToWkt(line: Array<[number, number]>): string {
  return `MULTILINESTRING((${line.map(([lng, lat]) => `${lng} ${lat}`).join(',')}))`;
}
