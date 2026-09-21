/**
 * Cartografía básica del IGAC: transporte, hidrografía y relieve.
 *
 * Son los "Datos Fundamentales" del IGAC, todos en EPSG:9377 y con nombres de
 * campo truncados a 10 caracteres. Sirven de contexto geográfico nacional (la
 * sección 4 del Informe Territorial, PLAN.md §11) y de respaldo a OSM, que es más
 * detallado pero de cobertura desigual.
 *
 * Evidencia: `data-catalog/igac/*.json` de la corrida del 2026-09-21.
 */

import { type DatasetDefinition } from '../types.js';

const IGAC_REST = 'https://mapas.igac.gov.co/server/rest/services';
const INSPECTED_AT = '2026-09-21';
const IGAC_LICENSE =
  'CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText)';

/**
 * Nota sobre los conteos: ninguno de estos servicios respondió a
 * `returnCountOnly` dentro del presupuesto de 25 s, salvo los indicados. El
 * número de registros queda desconocido y hay que medirlo al ingerir.
 */

const ROADS_100K: DatasetDefinition = {
  id: 'igac-transporte-100k',
  source: 'IGAC',
  name: 'Datos Fundamentales de Transporte 1:100 000',
  url: `${IGAC_REST}/Datos_Fundamentales_Transporte_100k/MapServer`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Datos Fundamentales de Transporte 1:100 000',
  fieldMapping: {
    VIdentifi: {
      target: 'code',
      sqlType: 'TEXT',
      note: 'Identificador de la vía (capa `Via_100k`, id 6). Nombre truncado a 10 caracteres.',
    },
    VTipo: {
      target: 'class',
      sqlType: 'TEXT',
      note: 'Tipo de vía. Es el campo que da la jerarquía vial oficial, frente a `highway=*` de OSM.',
    },
    VEstado: {
      target: 'attrs.estado',
      sqlType: 'TEXT',
      note: 'Estado de la vía (pavimentada, sin pavimentar…): dato que OSM casi nunca tiene y que decide el acceso real a un predio rural.',
    },
    VCarril: { target: 'attrs.carriles', sqlType: 'TEXT' },
    VAcceso: { target: 'attrs.acceso', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiLineString,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'ctx.road',
  validations: [
    {
      id: 'road-class-domain',
      description: 'Se reporta la distribución de VTipo para construir la jerarquía del motor de accesibilidad.',
      severity: 'warning',
    },
    {
      id: 'scale-disclosure',
      description:
        'Toda distancia calculada con esta capa debe advertir la escala 1:100 000: el error posicional puede superar los 50 m.',
      severity: 'blocker',
    },
  ],
  modules: ['M2', 'M4', 'M5', 'M7'],
  justification:
    'Es la jerarquía vial oficial del país y trae `VEstado` (estado de la vía), que OSM casi nunca tiene y que es exactamente lo que decide si una finca es accesible en invierno. Complementa a OSM, no lo sustituye: OSM gana en detalle urbano, el IGAC gana en autoridad y en atributos de estado.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${IGAC_REST}/Datos_Fundamentales_Transporte_100k/MapServer — 7 capas: Limite_Via_100k, Puente_L_100k, Puente_P_100k, Separador_Vial_100k, Tunel_100k, "Via Ferrea_100k", Via_100k`,
    catalogFile: 'data-catalog/igac/Datos_Fundamentales_Transporte_100k__MapServer.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 4,
  notes: [
    'Escala 1:100 000: sirve para contexto regional y accesibilidad rural, NO para saber a qué calle da un lote urbano. Para eso está OSM.',
    'El servicio trae 7 capas; el mapeo de arriba es de `Via_100k` (id 6). Los puentes (`Puente_P_100k`, id 2) y las vías férreas (id 5) se ingieren como `ctx.poi` y `ctx.road` respectivamente.',
    'El nombre de la capa 5 es literalmente `Via Ferrea_100k ` con espacios: hay que escaparlo en las URL.',
    'No respondió a `returnCountOnly`: el número de vías queda desconocido.',
  ],
};

const WATER_BODIES: DatasetDefinition = {
  id: 'igac-cuerpos-agua-500k',
  source: 'IGAC',
  name: 'Datos Fundamentales de Cuerpos de Agua 1:500 000',
  url: `${IGAC_REST}/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Datos Fundamentales de Cuerpos de Agua 1:500 000',
  fieldMapping: {
    DIdentif: {
      target: 'code',
      sqlType: 'TEXT',
      note: 'Identificador del drenaje (capas `Drenaj_L` id 2 y `Drenaj_R` id 3).',
    },
    DTipo: { target: 'kind', sqlType: 'TEXT', note: 'Tipo de drenaje.' },
    DEstado: { target: 'attrs.estado', sqlType: 'TEXT', note: 'Permanente / intermitente.' },
    DDisperso: { target: 'attrs.disperso', sqlType: 'TEXT' },
    DAIdentif: {
      target: 'attrs.deposito_id',
      sqlType: 'TEXT',
      note: 'Capa `Deposito de Agua` (id 1): embalses y lagunas.',
    },
    DATipo: { target: 'attrs.deposito_tipo', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(Geometry,4326)',
      transform: 'ST_MakeValid(ST_Transform(shape, 4326))',
      note: 'Mezcla de MultiLineString (drenajes lineales) y MultiPolygon (depósitos, islas, manglares).',
    },
  },
  piiBlocklist: [],
  targetTable: 'ctx.water_body',
  validations: [
    {
      id: 'scale-disclosure',
      description:
        'Escala 1:500 000: la distancia a un cuerpo de agua tiene error de cientos de metros. La UI debe decirlo y NO usarse para rondas hídricas.',
      severity: 'blocker',
    },
    {
      id: 'no-ronda-hidrica-claim',
      description:
        'Prohibido derivar la ronda hídrica legal (30 m) de esta capa: la escala no lo permite y sería un concepto jurídico (PLAN.md §2).',
      severity: 'blocker',
    },
  ],
  modules: ['M2', 'M5', 'M7'],
  justification:
    'La sección 4 del Informe Territorial exige hidrografía, y la proximidad a un cauce es un factor de amenaza que el usuario espera ver. Con conteos verificados (935 bancos de arena, 271 drenajes en polígono, 11 manglares, 0 humedales) queda claro que es una capa de contexto regional, no de detalle.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${IGAC_REST}/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer — 7 capas`,
    catalogFile: 'data-catalog/igac/Dato_Fundamental_Cuerpos_de_Agua_500k__MapServer.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 3,
  phase: 4,
  notes: [
    'Conteos verificados: `Banco de Arena` 935, `Drenaj_R` 271, `Manglar` 11, `Humedal` **0** (capa vacía).',
    'A escala 1:500 000 esta capa NO sirve para rondas hídricas ni para amenaza de inundación a nivel de predio. Para eso hacen falta el IDEAM y las áreas homogéneas de tierra.',
    'Todas las capas llevan un campo `RuleID` que es metadato de simbología, no dato: no se ingiere.',
  ],
};

const CONTOURS: DatasetDefinition = {
  id: 'igac-curvas-nivel-500k',
  source: 'IGAC',
  name: 'Datos Fundamentales de Curvas de Nivel 1:500 000',
  url: `${IGAC_REST}/Dato_Fundamental_Curvas_de_nivel_500k/MapServer/0`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Datos Fundamentales de Curvas de Nivel 1:500 000',
  fieldMapping: {
    CNIdentif: { target: 'code', sqlType: 'TEXT' },
    CNAltura: {
      target: 'elevation_m',
      sqlType: 'NUMERIC',
      note: 'Altura de la curva, en metros.',
    },
    CNTipo: { target: 'attrs.tipo', sqlType: 'TEXT', note: 'Curva maestra o intermedia.' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiLineString,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'ctx.contour',
  validations: [
    {
      id: 'elevation-range',
      description: 'La altura debe estar entre −5 y 5 800 m (Pico Cristóbal Colón).',
      severity: 'warning',
    },
    {
      id: 'prefer-dem',
      description:
        'Si el DEM Copernicus 30 m está cargado, la pendiente se calcula con él y NO con estas curvas: a 1:500 000 la interpolación es inservible.',
      severity: 'blocker',
    },
  ],
  modules: ['M2', 'M7'],
  justification:
    'Da altitud de contexto sin necesidad de raster, útil mientras el DEM Copernicus no esté cargado. Entra con prioridad baja precisamente porque el DEM lo sustituye.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${IGAC_REST}/Dato_Fundamental_Curvas_de_nivel_500k/MapServer/0 (Elevacion_500k)`,
    catalogFile: 'data-catalog/igac/Dato_Fundamental_Curvas_de_nivel_500k__MapServer.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 3,
  phase: 4,
  notes: [
    'A escala 1:500 000 la equidistancia es de cientos de metros: NO sirve para calcular pendiente de un predio. El plan ya prevé el DEM Copernicus 30 m para eso (PLAN.md §5.2).',
    'No respondió a `returnCountOnly` ni devolvió muestra dentro del presupuesto: el esquema se conoce por los metadatos de la capa, no por filas.',
  ],
};

export const IGAC_CONTEXT_DATASETS: readonly DatasetDefinition[] = [
  ROADS_100K,
  WATER_BODIES,
  CONTOURS,
];
