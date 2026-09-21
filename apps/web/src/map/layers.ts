/**
 * Catálogo declarativo de capas propias.
 *
 * Cada capa declara: etiqueta, grupo, leyenda, unidad, término de glosario, zooms,
 * fuente y licencia, y el permiso de plan que exige. `MapView` y `LayerPanel` no contienen
 * ninguna decisión de estilo: todo sale de aquí, y `GET /layers` puede sobrescribir
 * etiquetas y leyendas sin tocar el frontend.
 *
 * SUPUESTOS DEL CONTRATO:
 * - `GET /tiles/:layer/{z}/{x}/{y}.mvt` sirve una capa MVT cuyo nombre interno coincide
 *   con el id de la capa (`parcel`, `h3`, `school`…).
 * - Las teselas aceptan `?cut=AAAA-MM-DD` para el selector de corte temporal.
 * - Los predios solo se sirven desde zoom 14 (`PARCEL_MIN_ZOOM`); por debajo se usan
 *   los agregados H3, que el backend calcula en `analytics.h3_cell`.
 */
import {
  LAYER_RULES,
  PARCEL_MIN_ZOOM,
  TILE_LAYERS,
  type PlanCode,
  type TileLayer,
} from '@terracolombia/shared';
import { CELL_AREA_KM2 } from '@terracolombia/geo';
import type { LayerSpecification } from 'maplibre-gl';

export interface LegendItem {
  label: string;
  color: string;
  /** Valor o umbral que representa el color, cuando la leyenda es graduada. */
  value?: string | number;
}

export type LayerGroupId = 'catastro' | 'contexto' | 'riesgos' | 'ordenamiento' | 'agregados';

export const LAYER_GROUPS: Record<LayerGroupId, string> = {
  catastro: 'Catastro',
  contexto: 'Contexto y equipamientos',
  riesgos: 'Amenazas y restricciones',
  ordenamiento: 'Ordenamiento territorial',
  agregados: 'Agregados por celda',
};

export interface LayerDefinition {
  id: TileLayer;
  label: string;
  group: LayerGroupId;
  /** Una línea que explica qué se está viendo. */
  description: string;
  /** Entrada de glosario que define el concepto de la capa. */
  glossaryId: string | null;
  /** Unidad de la magnitud que pinta la capa, si aplica. */
  unit: string | null;
  /**
   * Zoom mínimo y máximo, y plan mínimo. No se declaran capa por capa: se inyectan desde
   * `LAYER_RULES` de `packages/shared`, que es de donde los lee también el servidor. Cuando
   * cada lado tenía su copia discrepaban sin que nada lo delatara: el panel ofrecía
   * `soil_unit` como gratuita y la tesela respondía 403 en silencio, y anunciaba `hazard`
   * desde el zoom 5 cuando el servidor no sirve nada por debajo del 7.
   */
  minZoom: number;
  maxZoom: number;
  minPlan: PlanCode;
  visibleByDefault: boolean;
  defaultOpacity: number;
  legend: LegendItem[];
  /** Entidad responsable, para el pie de procedencia del mapa. */
  sourceLabel: string;
  license: string;
  /** Si responde a hover y clic mediante `feature-state`. */
  interactive: boolean;
  /** Construye las capas MapLibre de esta capa lógica. */
  build: (ctx: LayerBuildContext) => LayerSpecification[];
}

export interface LayerBuildContext {
  sourceId: string;
  /** Nombre de la capa dentro del MVT. */
  sourceLayer: string;
  opacity: number;
}

const TILES_BASE = (import.meta.env.VITE_TILES_BASE_URL ?? '/api/v1/tiles').replace(/\/$/, '');

/** Plantilla de teselas para MapLibre. El corte temporal viaja como query. */
export function tileUrlTemplate(layer: TileLayer, cutDate: string | null): string {
  const suffix = cutDate ? `?cut=${encodeURIComponent(cutDate)}` : '';
  return `${TILES_BASE}/${layer}/{z}/{x}/{y}.mvt${suffix}`;
}

export function sourceIdFor(layer: TileLayer): string {
  return `tc-src-${layer}`;
}

/** Ids de las capas MapLibre generadas por una capa lógica (para quitarlas al apagarla). */
export function layerIdsFor(layer: TileLayer): string[] {
  const def = LAYER_BY_ID[layer];
  if (!def) return [];
  return def
    .build({ sourceId: sourceIdFor(layer), sourceLayer: layer, opacity: def.defaultOpacity })
    .map((l) => l.id);
}

// ─── Paleta de datos ──────────────────────────────────────────────────────────

const C = {
  parcelLine: '#1c4f42',
  parcelFill: '#2d7d67',
  parcelSelected: '#b45309',
  parcelHover: '#0f766e',
  building: '#6b4f3a',
  boundary: '#334155',
  school: '#1d4ed8',
  health: '#be123c',
  protected: '#15803d',
  hazardLow: '#fde68a',
  hazardMed: '#fb923c',
  hazardHigh: '#b91c1c',
  soil: '#a16207',
  pot: '#7c3aed',
  roadPrimary: '#ea580c',
  roadSecondary: '#f59e0b',
  roadLocal: '#a1a1aa',
  roadUnpaved: '#92400e',
  h3Low: '#f1f5f9',
  h3Mid: '#7dd3c0',
  h3High: '#134e4a',
} as const;

// ─── Definiciones ─────────────────────────────────────────────────────────────

/** Lo propio del cliente: etiqueta, grupo, leyenda y pintado. Los zooms y el plan no. */
type LayerStyle = Omit<LayerDefinition, 'minZoom' | 'maxZoom' | 'minPlan'>;

const LAYER_STYLES: readonly LayerStyle[] = [
  {
    id: 'parcel',
    label: 'Predios',
    group: 'catastro',
    description:
      'Terrenos de la base catastral. Aparecen a partir del zoom 14; más lejos se muestran los agregados por celda.',
    glossaryId: 'npn',
    unit: null,
    visibleByDefault: true,
    defaultOpacity: 0.55,
    legend: [
      { label: 'Predio', color: C.parcelFill },
      { label: 'Predio seleccionado', color: C.parcelSelected },
    ],
    sourceLabel: 'IGAC · Base Catastral Pública',
    license: 'CC BY-SA 4.0',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-parcel-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: PARCEL_MIN_ZOOM,
        paint: {
          // `feature-state` para hover y selección: no se re-consulta la tesela.
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            C.parcelSelected,
            ['boolean', ['feature-state', 'hover'], false],
            C.parcelHover,
            C.parcelFill,
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            Math.min(0.85, opacity + 0.25),
            opacity,
          ],
        },
      },
      {
        id: 'tc-parcel-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: PARCEL_MIN_ZOOM,
        paint: {
          'line-color': C.parcelLine,
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 1.6],
          ],
        },
      },
    ],
  },
  {
    id: 'building',
    label: 'Construcciones',
    group: 'catastro',
    description: 'Huellas de construcción registradas por el catastro.',
    glossaryId: null,
    unit: 'm² construidos',
    visibleByDefault: false,
    defaultOpacity: 0.7,
    legend: [{ label: 'Construcción', color: C.building }],
    sourceLabel: 'IGAC · Base Catastral Pública',
    license: 'CC BY-SA 4.0',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-building-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 15,
        paint: { 'fill-color': C.building, 'fill-opacity': opacity },
      },
    ],
  },
  {
    id: 'block',
    label: 'Manzanas',
    group: 'catastro',
    description: 'Manzanas catastrales urbanas.',
    glossaryId: null,
    unit: null,
    visibleByDefault: false,
    defaultOpacity: 0.9,
    legend: [{ label: 'Manzana', color: C.boundary }],
    sourceLabel: 'IGAC · Base Catastral Pública',
    license: 'CC BY-SA 4.0',
    interactive: false,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-block-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 12,
        paint: { 'line-color': C.boundary, 'line-width': 0.8, 'line-opacity': opacity },
      },
    ],
  },
  {
    id: 'sector',
    label: 'Sectores catastrales',
    group: 'catastro',
    description: 'Sectores en que el catastro divide el municipio.',
    glossaryId: null,
    unit: null,
    visibleByDefault: false,
    defaultOpacity: 0.9,
    legend: [{ label: 'Sector', color: C.boundary }],
    sourceLabel: 'IGAC · Base Catastral Pública',
    license: 'CC BY-SA 4.0',
    interactive: false,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-sector-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 10,
        paint: {
          'line-color': C.boundary,
          'line-width': 1.2,
          'line-dasharray': [2, 2],
          'line-opacity': opacity,
        },
      },
    ],
  },
  {
    id: 'municipality',
    label: 'Municipios',
    group: 'catastro',
    description: 'Límites municipales oficiales y su estado de cobertura catastral.',
    glossaryId: 'divipola',
    unit: null,
    visibleByDefault: true,
    defaultOpacity: 1,
    legend: [{ label: 'Límite municipal', color: C.boundary }],
    sourceLabel: 'IGAC · Límites oficiales / DANE · MGN',
    license: 'CC BY 4.0',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-municipality-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        paint: {
          'line-color': C.boundary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.6],
          'line-opacity': opacity,
        },
      },
      {
        id: 'tc-municipality-hover',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        paint: {
          'fill-color': C.parcelHover,
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.22,
            ['boolean', ['feature-state', 'hover'], false],
            0.12,
            0,
          ],
        },
      },
    ],
  },
  {
    id: 'department',
    label: 'Departamentos',
    group: 'catastro',
    description: 'Límites departamentales oficiales.',
    glossaryId: 'divipola',
    unit: null,
    visibleByDefault: true,
    defaultOpacity: 1,
    legend: [{ label: 'Límite departamental', color: C.boundary }],
    sourceLabel: 'IGAC · Límites oficiales',
    license: 'CC BY 4.0',
    interactive: false,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-department-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        maxzoom: 12,
        paint: { 'line-color': C.boundary, 'line-width': 1.6, 'line-opacity': opacity },
      },
    ],
  },
  {
    id: 'h3',
    label: 'Agregados por celda (H3)',
    group: 'agregados',
    description:
      'Indicadores calculados por hexágono de tamaño igual: permite comparar zonas de forma justa y ver el país completo sin cargar predios.',
    glossaryId: 'h3',
    unit: 'predios por km²',
    visibleByDefault: true,
    defaultOpacity: 0.65,
    legend: [
      { label: 'Hasta 100 predios/km²', color: C.h3Low, value: 100 },
      { label: '1 000 predios/km²', color: C.h3Mid, value: 1000 },
      { label: '4 000 predios/km² o más', color: C.h3High, value: 4000 },
    ],
    sourceLabel: 'TerraColombia · agregados propios sobre IGAC y DANE',
    license: 'Indicador propio (derivado)',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-h3-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        maxzoom: PARCEL_MIN_ZOOM,
        paint: {
          /*
           * Se pinta la densidad de predios por km², no el conteo en bruto.
           *
           * Antes se interpolaba sobre `['get', 'value']`, una propiedad que la tesela nunca
           * ha emitido: `analytics.h3_cell` no tiene esa columna. El `coalesce` la convertía
           * en 0 siempre, así que TODOS los hexágonos salían del mismo color pálido mientras
           * la leyenda prometía tres niveles de densidad.
           *
           * Se divide por el área de la celda porque el servidor sirve resolución 8 o 9
           * según el zoom, y una celda de res 8 es siete veces mayor que una de res 9: sin
           * normalizar, el mapa cambiaría de color al acercarse sin que el territorio haya
           * cambiado. Las áreas son las de `CELL_AREA_KM2`, y los cortes de la rampa son los
           * que declara la leyenda, para que el color se pueda leer.
           */
          'fill-color': [
            'interpolate',
            ['linear'],
            [
              '/',
              ['coalesce', ['get', 'n_parcels'], 0],
              ['case', ['==', ['get', 'res'], 9], CELL_AREA_KM2[9]!, CELL_AREA_KM2[8]!],
            ],
            100,
            C.h3Low,
            1000,
            C.h3Mid,
            4000,
            C.h3High,
          ],
          // Una celda sin predios no es una celda de densidad baja: es una celda sin dato.
          // Se deja transparente en vez de pintarla del color del extremo inferior.
          'fill-opacity': [
            'case',
            ['==', ['coalesce', ['get', 'n_parcels'], 0], 0],
            0,
            opacity,
          ],
        },
      },
      {
        id: 'tc-h3-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        maxzoom: PARCEL_MIN_ZOOM,
        paint: {
          'line-color': '#ffffff',
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0.3],
        },
      },
    ],
  },
  {
    id: 'school',
    label: 'Colegios y sedes educativas',
    group: 'contexto',
    description: 'Establecimientos y sedes reportados por el Ministerio de Educación.',
    glossaryId: null,
    unit: null,
    visibleByDefault: false,
    defaultOpacity: 1,
    legend: [{ label: 'Sede educativa', color: C.school }],
    sourceLabel: 'MEN · Directorio de establecimientos educativos',
    license: 'Datos Abiertos del Estado colombiano',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-school-circle',
        type: 'circle',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 10,
        paint: {
          'circle-color': C.school,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
          'circle-opacity': opacity,
        },
      },
    ],
  },
  {
    id: 'health_facility',
    label: 'Prestadores de salud',
    group: 'contexto',
    description: 'IPS y sedes registradas en el REPS del Ministerio de Salud.',
    glossaryId: null,
    unit: null,
    visibleByDefault: false,
    defaultOpacity: 1,
    legend: [{ label: 'Sede de salud', color: C.health }],
    sourceLabel: 'MinSalud · REPS',
    license: 'Datos Abiertos del Estado colombiano',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-health-circle',
        type: 'circle',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 10,
        paint: {
          'circle-color': C.health,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
          'circle-opacity': opacity,
        },
      },
    ],
  },
  {
    id: 'road',
    label: 'Vías',
    group: 'contexto',
    description:
      'Red vial de OpenStreetMap. La jerarquía y la superficie explican buena parte de la accesibilidad que puntúa el análisis de aptitud.',
    glossaryId: null,
    unit: null,
    visibleByDefault: false,
    defaultOpacity: 0.9,
    legend: [
      { label: 'Principal', color: C.roadPrimary },
      { label: 'Secundaria', color: C.roadSecondary },
      { label: 'Local o terciaria', color: C.roadLocal },
      { label: 'Sin pavimentar', color: C.roadUnpaved },
    ],
    sourceLabel: 'OpenStreetMap',
    license: 'ODbL 1.0',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-road-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 10,
        paint: {
          // La tesela publica `class` y `is_paved`; el color sigue la jerarquía y el trazo
          // discontinuo lo reserva el destacado de vía sin pavimentar, más abajo.
          'line-color': [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary'],
            C.roadPrimary,
            ['secondary', 'tertiary'],
            C.roadSecondary,
            C.roadLocal,
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 1.4, 0.5],
            16,
            ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 4, 1.6],
          ],
          'line-opacity': opacity,
        },
      },
      {
        // Las vías sin pavimentar van aparte y punteadas: para decidir un acceso, que la vía
        // exista no es lo mismo que que se pueda usar en invierno.
        id: 'tc-road-unpaved',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 12,
        filter: ['==', ['get', 'is_paved'], false],
        paint: {
          'line-color': C.roadUnpaved,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 2],
          'line-dasharray': [2, 2],
          'line-opacity': opacity,
        },
      },
    ],
  },
  {
    id: 'protected_area',
    label: 'Áreas protegidas',
    group: 'riesgos',
    description: 'Áreas con protección legal ambiental inscritas en el RUNAP.',
    glossaryId: 'area_protegida',
    unit: null,
    visibleByDefault: false,
    defaultOpacity: 0.35,
    legend: [{ label: 'Área protegida (RUNAP)', color: C.protected }],
    sourceLabel: 'Parques Nacionales Naturales · RUNAP',
    license: 'Datos Abiertos del Estado colombiano',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-protected-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 5,
        paint: { 'fill-color': C.protected, 'fill-opacity': opacity },
      },
      {
        id: 'tc-protected-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 5,
        paint: { 'line-color': C.protected, 'line-width': 1.2 },
      },
    ],
  },
  {
    id: 'hazard',
    label: 'Amenazas',
    group: 'riesgos',
    description:
      'Amenaza por movimientos en masa, inundación y sismicidad a escala regional. Orienta, no reemplaza estudios de detalle.',
    glossaryId: 'amenaza',
    unit: 'nivel',
    visibleByDefault: false,
    defaultOpacity: 0.45,
    legend: [
      { label: 'Baja', color: C.hazardLow, value: 'baja' },
      { label: 'Media', color: C.hazardMed, value: 'media' },
      { label: 'Alta', color: C.hazardHigh, value: 'alta' },
    ],
    sourceLabel: 'SGC · IDEAM',
    license: 'Datos Abiertos del Estado colombiano',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-hazard-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 5,
        paint: {
          'fill-color': [
            'match',
            ['downcase', ['coalesce', ['get', 'level'], '']],
            'alta',
            C.hazardHigh,
            'muy alta',
            C.hazardHigh,
            'media',
            C.hazardMed,
            'baja',
            C.hazardLow,
            '#cbd5e1',
          ],
          'fill-opacity': opacity,
        },
      },
    ],
  },
  {
    id: 'soil_unit',
    label: 'Unidades de suelo',
    group: 'ordenamiento',
    description: 'Unidades cartográficas de suelos, capacidad de uso y vocación (agrología).',
    glossaryId: 'capacidad_uso',
    unit: 'clase agrológica',
    visibleByDefault: false,
    defaultOpacity: 0.4,
    legend: [{ label: 'Unidad de suelo', color: C.soil }],
    sourceLabel: 'IGAC · Subdirección de Agrología',
    license: 'CC BY 4.0',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-soil-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 8,
        paint: { 'fill-color': C.soil, 'fill-opacity': opacity },
      },
    ],
  },
  {
    id: 'pot_zone',
    label: 'Zonificación del POT',
    group: 'ordenamiento',
    description:
      'Clasificación del suelo y usos del Plan de Ordenamiento. Solo existe para los municipios que publican su POT.',
    glossaryId: 'pot',
    unit: null,
    visibleByDefault: false,
    defaultOpacity: 0.4,
    legend: [{ label: 'Zona del POT', color: C.pot }],
    sourceLabel: 'Municipio · ColombiaOT / IGAC',
    license: 'Licencia no declarada por la fuente',
    interactive: true,
    build: ({ sourceId, sourceLayer, opacity }) => [
      {
        id: 'tc-pot-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 10,
        paint: { 'fill-color': C.pot, 'fill-opacity': opacity },
      },
      {
        id: 'tc-pot-line',
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        minzoom: 10,
        paint: { 'line-color': C.pot, 'line-width': 0.8 },
      },
    ],
  },
] as const;

/**
 * El catálogo que consume la interfaz: el estilo de cada capa más las reglas de servicio
 * que declara `packages/shared`. Al componerlo aquí, el panel no puede ofrecer una capa en
 * un zoom donde el servidor no sirve nada, ni presentarla como gratuita si exige plan.
 */
export const LAYER_DEFINITIONS: readonly LayerDefinition[] = LAYER_STYLES.map((style) => ({
  ...style,
  ...LAYER_RULES[style.id],
}));

export const LAYER_BY_ID: Readonly<Partial<Record<TileLayer, LayerDefinition>>> =
  Object.fromEntries(LAYER_DEFINITIONS.map((l) => [l.id, l]));

/** Capas agrupadas para el panel, respetando el orden de `LAYER_GROUPS`. */
export function layersByGroup(): Array<{ group: LayerGroupId; label: string; layers: LayerDefinition[] }> {
  return (Object.keys(LAYER_GROUPS) as LayerGroupId[]).map((group) => ({
    group,
    label: LAYER_GROUPS[group],
    layers: LAYER_DEFINITIONS.filter((l) => l.group === group),
  }));
}

export const DEFAULT_VISIBLE_LAYERS: TileLayer[] = LAYER_DEFINITIONS.filter(
  (l) => l.visibleByDefault,
).map((l) => l.id);

/** Valida ids que llegan de la URL: nadie inyecta nombres de capa arbitrarios. */
export function isTileLayer(value: string): value is TileLayer {
  return (TILE_LAYERS as readonly string[]).includes(value);
}

/** Capas con las que el usuario puede interactuar (hover y clic). */
export const INTERACTIVE_LAYER_IDS: string[] = LAYER_DEFINITIONS.filter((l) => l.interactive)
  .flatMap((l) =>
    l.build({ sourceId: sourceIdFor(l.id), sourceLayer: l.id, opacity: l.defaultOpacity }),
  )
  .filter((l) => l.type === 'fill' || l.type === 'circle')
  .map((l) => l.id);

/**
 * Propiedad de cada capa que hace de identificador estable de entidad.
 *
 * MapLibre necesita `promoteId` para poder usar `feature-state` sobre teselas vectoriales:
 * sin él, el hover y la selección se pierden al cruzar el borde de una tesela.
 *
 * SUPUESTO DEL CONTRATO: estas propiedades vienen en el MVT con estos nombres.
 */
export const FEATURE_ID_PROPERTY: Partial<Record<TileLayer, string>> = {
  parcel: 'npn',
  building: 'id',
  block: 'code',
  sector: 'code',
  municipality: 'code',
  department: 'code',
  h3: 'h3',
  school: 'id',
  health_facility: 'id',
  protected_area: 'id',
  hazard: 'id',
  soil_unit: 'id',
  pot_zone: 'id',
};

/** Propiedad que la ventana emergente usa como título de la entidad. */
export const FEATURE_LABEL_PROPERTY: Partial<Record<TileLayer, string>> = {
  parcel: 'npn',
  municipality: 'name',
  department: 'name',
  school: 'name',
  health_facility: 'name',
  protected_area: 'name',
  hazard: 'level',
  soil_unit: 'label',
  pot_zone: 'classification',
  h3: 'h3',
};
