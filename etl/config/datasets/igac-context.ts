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
      description:
        'Se reporta la distribución de VTipo para construir la jerarquía del motor de accesibilidad.',
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

/**
 * Límites de entidades territoriales.
 *
 * Es el único dataset de este archivo que NO pasa por el pipeline genérico del worker: lo
 * carga `packages/db/src/cli/load-admin-boundaries.ts`, porque no inserta filas nuevas sino
 * que actualiza la geometría de municipios y departamentos que ya existen con su código
 * DIVIPOLA. Se declara aquí igualmente para que el catálogo diga de dónde sale el límite
 * que pinta el mapa (regla 4 de CLAUDE.md).
 */
const ADMIN_BOUNDARIES: DatasetDefinition = {
  id: 'igac-limites-entidades-territoriales',
  source: 'IGAC',
  name: 'Límites de entidades territoriales — departamentos y municipios',
  url: `${IGAC_REST}/catastro/direccionesterritorialesigac/MapServer`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license:
    'NO_DECLARADA por el servicio: `licenseInfo` viene vacío. Se ingiere bajo el régimen de datos abiertos del Estado (Ley 1712 de 2014) y queda pendiente confirmarlo con el IGAC.',
  attribution: 'Fuente: IGAC, Límites de entidades territoriales',
  fieldMapping: {
    MpCodigo: {
      target: 'core.municipality.code',
      sqlType: 'CHAR(5)',
      note: 'Capa 2 (`municipio`). Código DIVIPOLA de 5 dígitos. Es la llave del cruce: no se insertan municipios, se actualiza `geom` de los que ya existen.',
    },
    MpNombre: {
      target: 'NO_SE_USA',
      sqlType: 'TEXT',
      note: 'El nombre autoritativo es el de DIVIPOLA (DANE), que ya está cargado. Aquí solo sirve para contrastar.',
    },
    MpArea: {
      target: 'NO_SE_USA',
      sqlType: 'NUMERIC',
      note: 'Área en km² declarada por la fuente. El producto calcula la suya en EPSG:9377 (convención del proyecto) y usa esta solo para contrastar.',
    },
    Depto: {
      target: 'NO_SE_USA',
      sqlType: 'TEXT',
      note: 'ATENCIÓN: es el NOMBRE del departamento, no su código. El código sale de los dos primeros dígitos de MpCodigo.',
    },
    DeCodigo: {
      target: 'core.department.code',
      sqlType: 'CHAR(2)',
      note: 'Capa 1 (`departamento`). Código DIVIPOLA de 2 dígitos.',
    },
    DeNombre: { target: 'NO_SE_USA', sqlType: 'TEXT' },
    DeArea: {
      target: 'NO_SE_USA',
      sqlType: 'NUMERIC',
      note: 'Área en km² declarada por la fuente.',
    },
    DeNorma: {
      target: 'NO_SE_USA',
      sqlType: 'TEXT',
      note: 'Norma que fija el límite (Ley, Ordenanza, Decreto). Candidato a mostrarse en la ficha del municipio.',
    },
    SHAPE: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'core.clean_polygon(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326))',
      note: 'Se pide al servicio con `outSR=4326` y `geometryPrecision=7`; el servidor reproyecta desde EPSG:9377.',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.department.geom / core.municipality.geom',
  validations: [
    {
      id: 'no-new-rows',
      description:
        'El cargador solo hace UPDATE. Un código que llegue de la fuente y no exista en core.municipality se cuenta e informa, nunca se inserta.',
      severity: 'blocker',
    },
    {
      id: 'outside_colombia',
      description:
        'Ninguna geometría cargada puede caer fuera de la extensión de Colombia: si ocurre, el CRS se leyó al revés y el corte no se publica.',
      severity: 'blocker',
    },
    {
      id: 'orphan_record',
      description:
        'Se registra cuántos municipios y departamentos quedaron SIN límite, para que la UI pueda decirlo (regla 6).',
      severity: 'warning',
    },
    {
      id: 'derived_geometry',
      description:
        'Todo límite departamental obtenido por disolución de sus municipios se marca como DERIVADO: no es el límite oficial publicado.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M3', 'M4', 'M9', 'M10'],
  justification:
    'Sin límites municipales el mapa abre vacío y no hay ni «¿en qué municipio cae este punto?» ni recorte de análisis por municipio. El MGN del DANE sería la fuente natural, pero su geoportal no publica índice recorrible; el IGAC sí sirve el mismo dato por ArcGIS REST y además es quien produce el deslinde.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${IGAC_REST}/catastro/direccionesterritorialesigac/MapServer — capa 1 (departamento, 33 entidades) y capa 2 (municipio, 1 122 entidades)`,
    catalogFile: 'data-catalog/igac/manual__igac-limites-entidades-territoriales.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'La capa de departamentos trae `DeCodigo = "00"` (Área en Litigio Cauca - Huila), que no es entidad DIVIPOLA, y NO trae el código `11` (Bogotá, D.C.): ese límite se deriva disolviendo el municipio 11001 y se marca como derivado.',
    'La capa de municipios trae `MpCodigo = "00000"` (la misma área en litigio) y NO trae `27493` (Nuevo Belén de Bajirá), en disputa entre Chocó y Antioquia: ese municipio queda con `geom` NULL, no se inventa.',
    'El servidor devuelve 502/503 con frecuencia: hay que paginar de 25 en 25 y reintentar con espera creciente.',
    'Un WAF delante del servicio responde HTML con estado 200 ante cláusulas `where` con `LIKE`: se consulta con `where=1=1` y se pagina con `resultOffset`.',
    'PENDIENTE: el servicio no declara licencia (`licenseInfo` vacío) ni fecha de corte (`editingInfo` ausente). La fecha registrada en meta.snapshot es la de consulta.',
  ],
};

export const IGAC_CONTEXT_DATASETS: readonly DatasetDefinition[] = [
  ADMIN_BOUNDARIES,
  ROADS_100K,
  WATER_BODIES,
  CONTOURS,
];
