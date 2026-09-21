import { LAYER_RULES } from '@terracolombia/shared';
import type { TileLayer } from '@terracolombia/shared';

/**
 * Catálogo de capas publicables (`GET /layers`). Define el contenido editorial: nombre en
 * español, descripción, leyenda y términos de glosario. La UI no inventa leyendas: las lee
 * de aquí.
 *
 * Los rangos de zoom y el plan mínimo NO se declaran aquí: salen de `LAYER_RULES`, en
 * `packages/shared`. Estuvieron duplicados entre esta semilla y el cliente del mapa y
 * divergieron, con el resultado de que la interfaz ofrecía como gratuitas capas que el
 * servidor negaba con un 403 mudo.
 */
export interface LayerContent {
  id: TileLayer;
  datasetId: string | null;
  name: string;
  description: string;
  geometryType: 'point' | 'line' | 'polygon' | 'h3';
  legend: Array<{ value: string; label: string; color: string }>;
  glossaryIds: string[];
  sortOrder: number;
}

export type LayerSeed = LayerContent & {
  minZoom: number;
  maxZoom: number;
  minPlan: string;
};

const LAYER_CONTENT: LayerContent[] = [
  {
    id: 'department',
    datasetId: null,
    name: 'Departamentos',
    description: 'División departamental oficial del país.',
    geometryType: 'polygon',
    legend: [{ value: 'default', label: 'Límite departamental', color: '#64748b' }],
    glossaryIds: ['divipola'],
    sortOrder: 10,
  },
  {
    id: 'municipality',
    datasetId: null,
    name: 'Municipios',
    description: 'División municipal oficial (DIVIPOLA) con geometría del Marco Geoestadístico Nacional.',
    geometryType: 'polygon',
    legend: [{ value: 'default', label: 'Límite municipal', color: '#475569' }],
    glossaryIds: ['divipola', 'mgn'],
    sortOrder: 20,
  },
  {
    id: 'parcel',
    datasetId: null,
    name: 'Predios',
    description:
      'Predios catastrales. Se muestran a partir del zoom 14 porque a escalas menores no son legibles ni útiles.',
    geometryType: 'polygon',
    legend: [
      { value: '01', label: 'Urbano', color: '#2563eb' },
      { value: '02', label: 'Rural', color: '#16a34a' },
    ],
    glossaryIds: ['npn', 'destino_economico', 'avaluo_catastral'],
    sortOrder: 30,
  },
  {
    id: 'building',
    datasetId: null,
    name: 'Construcciones',
    description: 'Huellas de construcción registradas por el catastro.',
    geometryType: 'polygon',
    legend: [{ value: 'default', label: 'Construcción', color: '#7c3aed' }],
    glossaryIds: [],
    sortOrder: 40,
  },
  {
    id: 'block',
    datasetId: null,
    name: 'Manzanas',
    description: 'Manzanas catastrales urbanas.',
    geometryType: 'polygon',
    legend: [{ value: 'default', label: 'Manzana', color: '#94a3b8' }],
    glossaryIds: [],
    sortOrder: 50,
  },
  {
    id: 'sector',
    datasetId: null,
    name: 'Sectores catastrales',
    description: 'Sectores en que el catastro divide el municipio.',
    geometryType: 'polygon',
    legend: [{ value: 'default', label: 'Sector', color: '#cbd5e1' }],
    glossaryIds: ['npn'],
    sortOrder: 60,
  },
  {
    id: 'h3',
    datasetId: null,
    name: 'Rejilla de análisis (hexágonos)',
    description:
      'Agregados por celda hexagonal. Permite comparar zonas del mismo tamaño: población, comercio, accesibilidad y predios.',
    geometryType: 'h3',
    legend: [
      { value: 'low', label: 'Valor bajo', color: '#fef3c7' },
      { value: 'mid', label: 'Valor medio', color: '#fb923c' },
      { value: 'high', label: 'Valor alto', color: '#b91c1c' },
    ],
    glossaryIds: ['h3'],
    sortOrder: 70,
  },
  {
    id: 'school',
    datasetId: null,
    name: 'Establecimientos educativos',
    description: 'Sedes educativas reportadas por el Ministerio de Educación.',
    geometryType: 'point',
    legend: [
      { value: 'oficial', label: 'Oficial', color: '#0891b2' },
      { value: 'no_oficial', label: 'No oficial', color: '#c026d3' },
    ],
    glossaryIds: [],
    sortOrder: 80,
  },
  {
    id: 'health_facility',
    datasetId: null,
    name: 'Prestadores de salud',
    description: 'IPS y sedes inscritas en el Registro Especial de Prestadores de Servicios de Salud.',
    geometryType: 'point',
    legend: [{ value: 'default', label: 'Prestador de salud', color: '#dc2626' }],
    glossaryIds: [],
    sortOrder: 90,
  },
  {
    id: 'road',
    datasetId: null,
    name: 'Vías',
    description: 'Red vial de OpenStreetMap, clasificada por jerarquía y superficie.',
    geometryType: 'line',
    legend: [
      { value: 'primary', label: 'Vía principal', color: '#ea580c' },
      { value: 'secondary', label: 'Vía secundaria', color: '#f59e0b' },
      { value: 'residential', label: 'Vía local', color: '#a1a1aa' },
    ],
    glossaryIds: [],
    sortOrder: 100,
  },
  {
    id: 'protected_area',
    datasetId: null,
    name: 'Áreas protegidas',
    description:
      'Áreas del Registro Único Nacional de Áreas Protegidas. Su presencia restringe los usos del suelo.',
    geometryType: 'polygon',
    legend: [
      { value: 'restrictive', label: 'Protección estricta', color: '#166534' },
      { value: 'other', label: 'Otra categoría de manejo', color: '#65a30d' },
    ],
    glossaryIds: ['area_protegida'],
    sortOrder: 110,
  },
  {
    id: 'hazard',
    datasetId: null,
    name: 'Amenazas naturales',
    description:
      'Amenaza por movimientos en masa, sismos e inundación, a escala regional. Orienta, no sustituye estudios de detalle.',
    geometryType: 'polygon',
    legend: [
      { value: '5', label: 'Muy alta', color: '#7f1d1d' },
      { value: '4', label: 'Alta', color: '#dc2626' },
      { value: '3', label: 'Media', color: '#f59e0b' },
      { value: '2', label: 'Baja', color: '#fde047' },
      { value: '1', label: 'Muy baja', color: '#bbf7d0' },
    ],
    glossaryIds: ['amenaza'],
    sortOrder: 120,
  },
  {
    id: 'soil_unit',
    datasetId: null,
    name: 'Unidades de suelo',
    description: 'Unidades cartográficas de suelos del estudio agrológico del IGAC.',
    geometryType: 'polygon',
    legend: [{ value: 'default', label: 'Unidad de suelo', color: '#a16207' }],
    glossaryIds: ['capacidad_uso', 'vocacion_uso', 'conflicto_uso'],
    sortOrder: 130,
  },
  {
    id: 'pot_zone',
    datasetId: null,
    name: 'Ordenamiento territorial (POT)',
    description:
      'Clasificación del suelo y usos según el POT, solo en municipios con fuente disponible.',
    geometryType: 'polygon',
    legend: [
      { value: 'urbano', label: 'Suelo urbano', color: '#dc2626' },
      { value: 'expansion', label: 'Suelo de expansión', color: '#f97316' },
      { value: 'suburbano', label: 'Suelo suburbano', color: '#facc15' },
      { value: 'rural', label: 'Suelo rural', color: '#84cc16' },
      { value: 'proteccion', label: 'Suelo de protección', color: '#15803d' },
    ],
    glossaryIds: ['pot'],
    sortOrder: 140,
  },
];

/**
 * El catálogo completo: contenido editorial + reglas de servicio. Es lo que se escribe en
 * `meta.layer` y lo que devuelve `GET /layers`.
 */
export const LAYERS: LayerSeed[] = LAYER_CONTENT.map((c) => ({
  ...c,
  ...LAYER_RULES[c.id],
}));
