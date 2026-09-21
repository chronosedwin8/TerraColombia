/**
 * Suelos, agrología y amenazas — el insumo de M5 (aptitud de terreno).
 *
 * Hallazgo estructural de la Fase 0: el IGAC **no publica una capa nacional de
 * capacidad de uso de las tierras**. Lo que publica son cientos de estudios
 * regionales y municipales, uno por servicio ArcGIS, con esquemas parecidos pero
 * no idénticos (`capacidaddeusodelastierrascvc2023`,
 * `capacidaddeusodelastierrasbordenortebogota2011`,
 * `areashomogeneasdetierra05360itagui`…). En la carpeta `agrologia` hay 382
 * servicios y 370 familias de nombre distintas.
 *
 * Consecuencia para el MVP: M5 no puede prometer cobertura nacional. Se declara
 * un dataset por familia de esquema inspeccionada y se documenta que la cobertura
 * es por estudio, no por país.
 */

import { NOT_INSPECTED, type DatasetDefinition } from '../types.js';

const IGAC_REST = 'https://mapas.igac.gov.co/server/rest/services';
const INSPECTED_AT = '2026-09-21';
const IGAC_LICENSE = 'CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText)';

const SOIL_CAPABILITY: DatasetDefinition = {
  id: 'igac-capacidad-uso-tierras',
  source: 'IGAC',
  name: 'Capacidad de uso de las tierras (estudios regionales)',
  url: `${IGAC_REST}/agrologia/capacidaddeusodelastierrascvc2023/MapServer/0`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Capacidad de uso de las tierras (estudio CVC 2023)',
  fieldMapping: {
    UCP: {
      target: 'code',
      sqlType: 'TEXT',
      note: 'Unidad de capacidad productiva: el símbolo del polígono.',
    },
    CLASE: {
      target: 'capability_class',
      sqlType: 'TEXT',
      note: 'Clase agrológica (I a VIII). Es el semáforo de fondo de M5: I–III apta para agricultura intensiva, VII–VIII solo conservación.',
    },
    SUBCLASE: {
      target: 'capability_subclass',
      sqlType: 'TEXT',
      note: 'Subclase con los limitantes (e = erosión, s = suelo, h = humedad, c = clima).',
    },
    GRUPO_MANEJO: { target: 'management_group', sqlType: 'TEXT' },
    UCS: {
      target: 'soil_unit_code',
      sqlType: 'TEXT',
      note: 'Unidad cartográfica de suelos. Llave a los estudios de suelos.',
    },
    CARACTERISTICAS: {
      target: 'attrs.caracteristicas',
      sqlType: 'TEXT',
      note: 'Texto descriptivo. Es lo que alimenta la explicación en lenguaje claro de M5.',
    },
    LIMITANTES_USO: {
      target: 'attrs.limitantes_uso',
      sqlType: 'TEXT',
      note: 'Limitantes del uso, en texto. Insumo directo del factor "condicionado" del semáforo.',
    },
    USOS_RECOMENDADOS: {
      target: 'attrs.usos_recomendados',
      sqlType: 'TEXT',
      note: 'Usos recomendados por el IGAC. Es la respuesta más honesta que puede dar M5: la del propio instituto, no un modelo propio.',
    },
    PRACTICAS_MANEJO: { target: 'attrs.practicas_manejo', sqlType: 'TEXT' },
    AREA_ha: { target: 'attrs.area_ha', sqlType: 'NUMERIC' },
    SHAPE: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
      note: 'Polígonos grandes: aplicar ST_Subdivide antes de indexar (PLAN.md §7).',
    },
  },
  piiBlocklist: [],
  targetTable: 'ctx.land_capability',
  validations: [
    {
      id: 'capability-class-domain',
      description:
        'CLASE debe estar en I..VIII (números romanos). Cualquier otro valor se reporta y no se usa en el semáforo.',
      severity: 'blocker',
    },
    {
      id: 'coverage-extent-declared',
      description:
        'Se registra la extensión real del estudio. Todo predio fuera de ella recibe `capability_class: NO_DISPONIBLE`, nunca un valor por defecto (regla 6).',
      severity: 'blocker',
    },
    {
      id: 'geom-subdivide',
      description: 'Los polígonos con más de 10 000 vértices se subdividen con ST_Subdivide.',
      severity: 'warning',
    },
  ],
  modules: ['M5', 'M7'],
  justification:
    'Es el dato que convierte a M5 de una promesa en un producto: la clase agrológica, los limitantes y los usos recomendados vienen del propio IGAC, así que el semáforo de aptitud no es un modelo nuestro sino la lectura del criterio oficial. El esquema (UCP, CLASE, SUBCLASE, GRUPO_MANEJO, UCS, CARACTERISTICAS, LIMITANTES_USO, USOS_RECOMENDADOS, PRACTICAS_MANEJO) se verificó en dos estudios distintos y es estable.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom:
      'agrologia/capacidaddeusodelastierrascvc2023/MapServer/0 (CUT_CVC_2023_25K) y agrologia/capacidaddeusodelastierrasbordenortebogota2011/MapServer/0 (CUT_BordeNorte_2011_10K)',
    catalogFile: 'data-catalog/igac/agrologia__capacidaddeusodelastierrascvc2023__MapServer.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 4,
  notes: [
    'RIESGO ALTO DE ALCANCE: no hay capa nacional. Cada estudio es un servicio distinto y cubre una región (CVC = Valle del Cauca, Borde Norte de Bogotá, distritos de Boyacá, Santander, Nariño-Putumayo, Perijá, Macizo…). La carpeta `agrologia` tiene 382 servicios.',
    'El estudio del Borde Norte de Bogotá añade `ESTUDIO`, `ESCALA` y `AÑO`; el de la CVC no. El esquema es parecido pero no idéntico: la ingesta debe tolerar campos ausentes.',
    'Las escalas varían (1:10 000 a 1:100 000) y los años van de 2011 a 2023: dos polígonos vecinos pueden venir de estudios incomparables. Hay que guardar el estudio de origen en cada fila y mostrarlo (regla 4).',
    'Ningún estudio inspeccionado respondió a `returnCountOnly`: el número de polígonos queda desconocido.',
    'DECISIÓN PENDIENTE: si el departamento piloto no tiene estudio de capacidad de uso, M5 no puede entrar en el MVP con ese piloto. Verificar antes de comprometer la Fase 8.',
  ],
};

const HOMOGENEOUS_LAND_AREAS: DatasetDefinition = {
  id: 'igac-areas-homogeneas-tierra',
  source: 'IGAC',
  name: 'Áreas homogéneas de tierra (por municipio)',
  url: `${IGAC_REST}/agrologia/areashomogeneasdetierra05360itagui/MapServer/0`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Áreas homogéneas de tierra',
  fieldMapping: {
    Divipola: {
      target: 'muni_code',
      sqlType: 'CHAR(5)',
      note: 'Código del municipio del estudio.',
    },
    SIMBOLO: { target: 'code', sqlType: 'TEXT', note: 'Símbolo del área homogénea.' },
    UCSuelo: { target: 'soil_unit_code', sqlType: 'TEXT' },
    CLASE: { target: 'capability_class', sqlType: 'TEXT' },
    UClimatica: { target: 'attrs.unidad_climatica', sqlType: 'TEXT' },
    PENDIENTE: {
      target: 'slope_class',
      sqlType: 'TEXT',
      note: 'Clase de pendiente. Evita depender del DEM para el factor de pendiente de M5.',
    },
    FPendiente: { target: 'attrs.factor_pendiente', sqlType: 'TEXT' },
    EHidrica: { target: 'attrs.erosion_hidrica', sqlType: 'TEXT' },
    EEolica: { target: 'attrs.erosion_eolica', sqlType: 'TEXT' },
    ERemosion: {
      target: 'attrs.erosion_remocion',
      sqlType: 'TEXT',
      note: 'Remoción en masa: es un factor de amenaza, no solo agrológico.',
    },
    INUNDACION: {
      target: 'attrs.inundacion',
      sqlType: 'TEXT',
      note: 'Susceptibilidad a inundación declarada por el IGAC. Complementa al IDEAM.',
    },
    Encharcami: { target: 'attrs.encharcamiento', sqlType: 'TEXT' },
    FNFreatico: { target: 'attrs.nivel_freatico', sqlType: 'TEXT' },
    PEfectiva: { target: 'attrs.profundidad_efectiva', sqlType: 'TEXT' },
    HDensicos: { target: 'attrs.horizontes_densicos', sqlType: 'TEXT' },
    FGPerfil: { target: 'attrs.fragmentos_perfil', sqlType: 'TEXT' },
    PSuperfici: { target: 'attrs.pedregosidad_superficial', sqlType: 'TEXT' },
    LRocosidad: { target: 'attrs.limitante_rocosidad', sqlType: 'TEXT' },
    LSodicidad: { target: 'attrs.limitante_sodicidad', sqlType: 'TEXT' },
    LSalinidad: { target: 'attrs.limitante_salinidad', sqlType: 'TEXT' },
    CYeso: { target: 'attrs.contenido_yeso', sqlType: 'TEXT' },
    DArtificia: { target: 'attrs.drenaje_artificial', sqlType: 'TEXT' },
    AIntercamb: { target: 'attrs.aluminio_intercambiable', sqlType: 'TEXT' },
    Miscelaneo: { target: 'attrs.misceláneo', sqlType: 'TEXT' },
    VPotencial: { target: 'attrs.vocacion_potencial', sqlType: 'TEXT' },
    TRelieve: { target: 'attrs.tipo_relieve', sqlType: 'TEXT' },
    MParental: { target: 'attrs.material_parental', sqlType: 'TEXT' },
    CSimbolo: { target: 'attrs.simbolo_clase', sqlType: 'TEXT' },
    Observacio: { target: 'attrs.observaciones', sqlType: 'TEXT' },
    Fecha: { target: 'attrs.fecha_estudio', sqlType: 'DATE' },
    AREA_HA: { target: 'attrs.area_ha', sqlType: 'NUMERIC' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'ctx.land_capability',
  validations: [
    {
      id: 'muni-code-matches-service',
      description: 'El Divipola de las filas debe coincidir con el municipio que anuncia el nombre del servicio.',
      severity: 'warning',
    },
    {
      id: 'coverage-per-municipality',
      description:
        'Se registra qué municipios tienen estudio. Fuera de ellos, los factores agrológicos van NO_DISPONIBLE.',
      severity: 'blocker',
    },
  ],
  modules: ['M5', 'M7'],
  justification:
    'Es el dataset agrológico más rico que publica el IGAC: 34 atributos por polígono, con pendiente, erosión, inundación, encharcamiento, nivel freático, profundidad efectiva, salinidad y vocación potencial. Un solo cruce espacial llena casi todos los factores del semáforo de M5 y las secciones 5 y 6 del informe de M7, sin necesidad de DEM ni de modelos propios.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'agrologia/areashomogeneasdetierra05360itagui/MapServer/0 (AREA_HOMOGENEA_TIERRA)',
    catalogFile: 'data-catalog/igac/agrologia__areashomogeneasdetierra05360itagui__MapServer.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 4,
  notes: [
    'RIESGO ALTO DE COBERTURA: hay un servicio por municipio. En la raíz del servidor se ven 7 (Girardota, Olaya, El Peñol, San Jacinto, Betéitiva, Covarachía, La Celia) y en `agrologia` más; son decenas, no 1 122 municipios.',
    'Los nombres de campo están truncados a 10 caracteres: la fuente pasó por Shapefile.',
    'El servicio no respondió a `returnCountOnly`.',
    'DECISIÓN PENDIENTE: si el municipio del piloto no tiene áreas homogéneas, M5 arranca sin este insumo. Verificar la lista completa de municipios cubiertos antes de la Fase 8.',
  ],
};

const NATIONAL_SOIL_ACTIVITY: DatasetDefinition = {
  id: 'igac-actividad-quimica-suelos',
  source: 'IGAC',
  name: 'Actividad química de los suelos (nacional)',
  url: `${IGAC_REST}/agrologia/actividadquimicanacional/MapServer/0`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Actividad química de los suelos',
  fieldMapping: {
    UCSuelo: {
      target: 'soil_unit_code',
      sqlType: 'TEXT',
      note: 'Unidad cartográfica de suelos. Es la llave que comparte con los estudios regionales.',
    },
    UCS: { target: 'attrs.ucs', sqlType: 'TEXT' },
    CLIMA_1: { target: 'attrs.clima', sqlType: 'TEXT' },
    PAISAJE: { target: 'attrs.paisaje', sqlType: 'TEXT' },
    TIPO_RELIE: { target: 'attrs.tipo_relieve', sqlType: 'TEXT' },
    MATERIAL_P: { target: 'attrs.material_parental', sqlType: 'TEXT' },
    SUBGRUPO: {
      target: 'attrs.subgrupo_taxonomico',
      sqlType: 'TEXT',
      note: 'Subgrupo taxonómico del suelo (Soil Taxonomy).',
    },
    PERFILES: { target: 'attrs.perfiles', sqlType: 'TEXT' },
    PORCENTAJE: { target: 'attrs.porcentaje', sqlType: 'NUMERIC' },
    ACTIVIDAD: {
      target: 'chemical_activity',
      sqlType: 'TEXT',
      note: 'Actividad química (alta/baja): determina la fertilidad potencial.',
    },
    AREA_HA: { target: 'attrs.area_ha', sqlType: 'NUMERIC' },
    DEPARTAMEN: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    COD: { target: 'attrs.cod', sqlType: 'TEXT' },
    COD_1: { target: 'attrs.cod_1', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'ctx.soil_unit',
  validations: [
    {
      id: 'national-coverage',
      description:
        'Debe cubrir los 32 departamentos: se cuenta cuántos aparecen en DEPARTAMEN y se compara con la DIVIPOLA.',
      severity: 'warning',
    },
    { id: 'geom-subdivide', description: 'ST_Subdivide en polígonos grandes.', severity: 'warning' },
  ],
  modules: ['M5', 'M7'],
  justification:
    'Es el **único** dataset agrológico del IGAC que la Fase 0 encontró con alcance nacional declarado ("nacional" en el nombre del servicio, con campo `DEPARTAMEN`). Da clima, paisaje, tipo de relieve, material parental y subgrupo taxonómico para todo el país, lo que permite que M5 diga algo en cualquier predio en vez de callar donde no hay estudio regional.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'agrologia/actividadquimicanacional/MapServer/0 (capa "Actividad")',
    catalogFile: 'data-catalog/igac/agrologia__actividadquimicanacional__MapServer.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 4,
  notes: [
    'El alcance nacional está inferido del nombre del servicio y de la presencia del campo DEPARTAMEN; el servicio no respondió a `returnCountOnly` ni a la muestra, así que **no se verificó fila a fila**. Confirmar antes de prometer cobertura nacional.',
    'Nombres truncados a 10 caracteres (`TIPO_RELIE`, `MATERIAL_P`, `DEPARTAMEN`).',
  ],
};

const SOIL_LAB_RESULTS: DatasetDefinition = {
  id: 'agrosavia-analisis-suelos',
  source: 'AGROSAVIA',
  name: 'Resultados de análisis de laboratorio de suelos en Colombia',
  url: 'https://www.datos.gov.co/resource/ch4u-f3i5.json',
  connector: 'socrata',
  format: 'json',
  crs: null,
  frequency: 'anual',
  license: 'CC BY-SA 4.0',
  attribution:
    'Fuente: Corporación Colombiana de Investigación Agropecuaria (AGROSAVIA), corte 2025-10, CC BY-SA 4.0',
  fieldMapping: {
    secuencial: { target: 'id', sqlType: 'TEXT' },
    fecha_de_an_lisis: {
      target: 'analyzed_at',
      sqlType: 'DATE',
      note: 'Formato observado "7/01/2014" (d/mm/aaaa): parsear explícitamente, no con el parser por defecto.',
    },
    departamento: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    municipio: {
      target: 'attrs.municipio_nombre',
      sqlType: 'TEXT',
      note: 'Solo nombre, sin código DIVIPOLA: hay que resolverlo por nombre normalizado. Observado "SAN ANDRÉS DE TUMACO".',
    },
    cultivo: { target: 'attrs.cultivo', sqlType: 'TEXT', note: 'Con "No Indica" como valor faltante.' },
    topografia: { target: 'attrs.topografia', sqlType: 'TEXT' },
    drenaje: { target: 'attrs.drenaje', sqlType: 'TEXT' },
    riego: { target: 'attrs.riego', sqlType: 'TEXT' },
    ph_agua_suelo: { target: 'ph', sqlType: 'NUMERIC' },
    materia_organica: { target: 'organic_matter_pct', sqlType: 'NUMERIC' },
    fosforo_bray_ii: { target: 'attrs.fosforo', sqlType: 'NUMERIC' },
    capacidad_de_intercambio_cationico: { target: 'attrs.cic', sqlType: 'NUMERIC' },
    conductividad_electrica: { target: 'attrs.conductividad_electrica', sqlType: 'NUMERIC' },
    aluminio_intercambiable: { target: 'attrs.aluminio', sqlType: 'NUMERIC' },
    calcio_intercambiable: { target: 'attrs.calcio', sqlType: 'NUMERIC' },
    magnesio_intercambiable: { target: 'attrs.magnesio', sqlType: 'NUMERIC' },
    potasio_intercambiable: { target: 'attrs.potasio', sqlType: 'NUMERIC' },
    sodio_intercambiable: { target: 'attrs.sodio', sqlType: 'NUMERIC' },
  },
  piiBlocklist: [],
  targetTable: 'ctx.soil_lab_result',
  validations: [
    {
      id: 'nd-as-null',
      description: 'Los valores "ND" y "No indica" se cargan como NULL, nunca como 0.',
      severity: 'blocker',
    },
    {
      id: 'municipality-resolvable',
      description: 'El nombre de municipio debe resolverse a DIVIPOLA; los no resueltos se reportan.',
      severity: 'warning',
    },
    {
      id: 'ph-range',
      description: 'El pH debe estar entre 3 y 10; fuera de rango se marca para revisión.',
      severity: 'warning',
    },
  ],
  modules: ['M5'],
  justification:
    '92 738 análisis de laboratorio reales con pH, materia orgánica y bases intercambiables. No sustituye a la capacidad de uso, pero da un indicador de fertilidad allí donde no hay estudio agrológico, y es un dato que un comprador de finca entiende de inmediato.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'https://www.datos.gov.co/resource/ch4u-f3i5.json (32 columnas, 92 738 filas)',
    catalogFile: 'data-catalog/igac/socrata__ch4u-f3i5.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 3,
  phase: 8,
  notes: [
    'El publicador es AGROSAVIA, no el IGAC, aunque la búsqueda lo encontró con la consulta de suelos del IGAC.',
    'Solo tiene municipio, no coordenada: sirve para caracterizar un municipio, NO para decir nada de un predio concreto. La UI debe dejarlo clarísimo.',
    'Usa "ND" y "No indica" como faltantes: cargarlos como 0 falsearía cualquier promedio.',
  ],
};

const IRRIGATION_POTENTIAL: DatasetDefinition = {
  id: 'igac-areas-potenciales-irrigacion',
  source: 'IGAC',
  name: 'Áreas potenciales para adecuación de tierras con fines de irrigación',
  url: 'https://www.datos.gov.co/resource/wmwx-9aap.json',
  connector: 'socrata',
  format: 'json',
  crs: null,
  frequency: 'eventual',
  license: 'CC BY-SA 4.0',
  attribution: 'Fuente: IGAC, Áreas potenciales para irrigación, CC BY-SA 4.0',
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [],
  targetTable: 'ctx.land_vocation',
  validations: [
    {
      id: 'geometry-present',
      description: 'Debe traer geometría utilizable; si no, el dataset se descarta del MVP.',
      severity: 'blocker',
    },
  ],
  modules: ['M5'],
  justification:
    'El potencial de riego es determinante para el valor de una finca y es una de las primeras preguntas de quien compra tierra agrícola. 32 307 filas con licencia CC BY-SA 4.0.',
  inspection: 'url-verificada',
  evidence: {
    inspectedFrom: 'catálogo de datos.gov.co (11 columnas declaradas, 32 307 filas)',
    catalogFile: 'data-catalog/igac/socrata__wmwx-9aap.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 3,
  phase: 8,
  notes: [
    'fieldMapping: NO_INSPECCIONADO. Se conocen el conteo y la licencia del catálogo, pero no se bajó la muestra de filas: quedó fuera del `inspectTop` de la corrida.',
    'Reinspeccionar con `pnpm catalog:crawl -- --source igac-socrata` subiendo `inspectTop`.',
  ],
};

const HAZARDS: DatasetDefinition = {
  id: 'sgc-ideam-amenazas',
  source: 'SGC / IDEAM',
  name: 'Amenaza por movimientos en masa, sísmica e inundación',
  url: 'https://www.datos.gov.co/',
  connector: 'manual',
  format: 'geojson',
  crs: null,
  frequency: 'eventual',
  license: 'NO_VERIFICADO',
  attribution: 'Fuente: Servicio Geológico Colombiano / IDEAM',
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [],
  targetTable: 'ctx.hazard',
  validations: [
    {
      id: 'hazard-level-domain',
      description:
        'El nivel de amenaza debe mapear a una escala ordinal declarada; sin ella no se puede pintar un semáforo.',
      severity: 'blocker',
    },
    {
      id: 'no-legal-advice',
      description:
        'Toda salida debe llevar la advertencia de que no es un estudio de riesgo ni un concepto técnico (PLAN.md §2).',
      severity: 'blocker',
    },
  ],
  modules: ['M5', 'M7'],
  justification:
    'La sección 6 del Informe Territorial (amenazas y restricciones) es una de las diez que PLAN.md §11 declara obligatorias, y es lo que más valor percibido tiene para quien compra. Sin amenazas el informe está incompleto.',
  inspection: 'no-inspeccionado',
  evidence: { inspectedFrom: null, catalogFile: null, inspectedAt: INSPECTED_AT },
  priority: 2,
  phase: 4,
  notes: [
    'fieldMapping: NO_INSPECCIONADO. La Fase 0 NO inspeccionó los servicios del SGC ni del IDEAM: no están en `mapas.igac.gov.co` y no se añadieron al registro de fuentes.',
    'Lo que sí se encontró como sustituto parcial: el campo `INUNDACION` y `ERemosion` de las áreas homogéneas de tierra del IGAC, que dan susceptibilidad a inundación y remoción en masa donde hay estudio.',
    'TAREA PENDIENTE DE FASE 0: añadir los servicios ArcGIS del SGC (`srvags.sgc.gov.co`) y del IDEAM al registro `ARCGIS_SOURCES` y volver a correr el crawler.',
  ],
};

const PROTECTED_AREAS: DatasetDefinition = {
  id: 'runap-areas-protegidas',
  source: 'PNN — RUNAP',
  name: 'Registro Único Nacional de Áreas Protegidas',
  url: 'https://runap.parquesnacionales.gov.co/',
  connector: 'manual',
  format: 'geojson',
  crs: null,
  frequency: 'eventual',
  license: 'NO_VERIFICADO',
  attribution: 'Fuente: Parques Nacionales Naturales de Colombia, RUNAP',
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [],
  targetTable: 'ctx.protected_area',
  validations: [
    {
      id: 'category-domain',
      description: 'La categoría de manejo debe mapear al catálogo del RUNAP.',
      severity: 'blocker',
    },
  ],
  modules: ['M5', 'M7'],
  justification:
    'Un predio dentro de un área protegida tiene restricciones de uso que cambian por completo la respuesta de M5, y omitirlo sería el error más caro que puede cometer el producto. Es un "blocker" del semáforo, no un matiz.',
  inspection: 'no-inspeccionado',
  evidence: { inspectedFrom: null, catalogFile: null, inspectedAt: INSPECTED_AT },
  priority: 2,
  phase: 4,
  notes: [
    'fieldMapping: NO_INSPECCIONADO. No se inspeccionó en la Fase 0.',
    'La carpeta `ambiente` del IGAC sí tiene `reservasforestalesley` y `reservasnaturalesdelasociedadcivil`, que cubren parte del problema y sí están en el catálogo.',
    'TAREA PENDIENTE DE FASE 0: verificar si el RUNAP expone un servicio OGC y añadirlo al registro de fuentes.',
  ],
};

export const ENVIRONMENT_DATASETS: readonly DatasetDefinition[] = [
  SOIL_CAPABILITY,
  HOMOGENEOUS_LAND_AREAS,
  NATIONAL_SOIL_ACTIVITY,
  SOIL_LAB_RESULTS,
  IRRIGATION_POTENTIAL,
  HAZARDS,
  PROTECTED_AREAS,
];
