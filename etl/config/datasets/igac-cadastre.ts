/**
 * Datasets catastrales del IGAC.
 *
 * Los `fieldMapping` de los cuatro primeros salen de la inspección real hecha en
 * la Fase 0 sobre `Dato_Fundamental_Catastro/MapServer` (evidencia en
 * `data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json`, 2026-09-21).
 * El quinto —la base catastral descargable con los Registros 1 y 2— está
 * declarado `NOT_INSPECTED` porque no se pudo obtener una URL de descarga
 * estable: es el bloqueante principal del MVP (regla 2 de CLAUDE.md).
 */

import { NOT_INSPECTED, type DatasetDefinition } from '../types.js';

const IGAC_REST = 'https://mapas.igac.gov.co/server/rest/services';
const CATASTRO_SERVICE = `${IGAC_REST}/Dato_Fundamental_Catastro/MapServer`;
const CATALOG_FILE = 'data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json';
const INSPECTED_AT = '2026-09-21';

/**
 * El servicio no declara licencia (`copyrightText` vacío). La licencia y la
 * atribución se sostienen con el portal de datos abiertos del IGAC, no con el
 * servicio. Pendiente de concepto jurídico (PLAN.md §2).
 */
const IGAC_LICENSE = 'CC BY-SA 4.0 (declarada por el portal de datos abiertos del IGAC, no por el servicio REST)';
const IGAC_ATTRIBUTION = 'Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0';

/** Validaciones comunes a toda capa geométrica del catastro. */
const GEOMETRY_VALIDATIONS = [
  {
    id: 'geom-valid',
    description: 'Toda geometría debe pasar ST_IsValid tras ST_MakeValid; se reportan las corregidas.',
    severity: 'warning' as const,
  },
  {
    id: 'geom-srid',
    description: 'El SRID de entrada debe ser 4686; si llega otro, se aborta en vez de reproyectar a ciegas.',
    severity: 'blocker' as const,
  },
  {
    id: 'geom-within-colombia',
    description: 'El centroide debe caer dentro de la extensión de Colombia (incluida el área insular).',
    severity: 'warning' as const,
  },
  {
    id: 'area-not-zero',
    description: 'El área calculada en EPSG:9377 debe ser mayor que 0 m².',
    severity: 'warning' as const,
  },
];

/** Validaciones del código predial. */
const NPN_VALIDATIONS = [
  {
    id: 'npn-length',
    description: 'CODIGO debe tener exactamente 30 dígitos numéricos.',
    severity: 'blocker' as const,
  },
  {
    id: 'npn-muni-exists',
    description: 'Los 5 primeros dígitos deben existir en la DIVIPOLA del DANE.',
    severity: 'blocker' as const,
  },
  {
    id: 'npn-zone-domain',
    description:
      'Se registra la distribución del tramo de zona. Fase 0 observó 01=urbano y 00=rural, no 02: si aparece otro valor hay que revisar la segmentación antes de publicar.',
    severity: 'warning' as const,
  },
  {
    id: 'npn-duplicates',
    description: 'Se cuentan los NPN repetidos dentro del mismo corte y se reportan.',
    severity: 'warning' as const,
  },
  {
    id: 'count-vs-previous',
    description: 'El número de registros no debe variar más de 10 % frente al corte anterior.',
    severity: 'warning' as const,
  },
];

const URBAN_TERRAIN: DatasetDefinition = {
  id: 'igac-u-terreno-rest',
  source: 'IGAC',
  name: 'Terrenos urbanos (Dato Fundamental Catastro)',
  url: `${CATASTRO_SERVICE}/4`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 4686,
  frequency: 'desconocida',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: {
      target: 'npn',
      sqlType: 'CHAR(30)',
      note: 'Número Predial Nacional de 30 dígitos. Clave del producto.',
    },
    CODIGO_ANT: {
      target: 'npn_old',
      sqlType: 'VARCHAR(30)',
      note: 'Código anterior de 20 dígitos. NO es el prefijo de 20 del NPN: omite comuna y barrio.',
    },
    MANZANA_CO: {
      target: 'manzana_vereda',
      sqlType: 'VARCHAR(17)',
      note: 'Código de manzana de 17 dígitos; prefijo del NPN hasta el tramo de manzana.',
    },
    NUMERO_SUB: {
      target: 'attrs.numero_subpredio',
      sqlType: 'INTEGER',
      note: 'Número de subpredio. 0 en toda la muestra inspeccionada.',
    },
    GlobalID: {
      target: 'attrs.source_global_id',
      sqlType: 'TEXT',
      note: 'GUID de origen. Se guarda solo para trazabilidad del corte.',
    },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(geom, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.parcel',
  validations: [
    ...NPN_VALIDATIONS,
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'npn-zone-is-urban',
      description: 'El tramo de zona debe ser 01 en esta capa (observado en el 100 % de la muestra).',
      severity: 'warning',
    },
    {
      id: 'shape-area-ignored',
      description:
        'SHAPE_Area viene en grados cuadrados y NO se ingiere: el área se calcula en EPSG:9377.',
      severity: 'blocker',
    },
  ],
  modules: ['M1', 'M2', 'M3', 'M4', 'M7', 'M8'],
  justification:
    'Es la geometría predial urbana nacional del IGAC, 3 616 349 polígonos verificados. Sin ella no hay mapa de predios, ni ficha, ni buscador espacial: es el núcleo del producto. Se usa como respaldo y validación; la carga primaria debe venir de la descarga masiva (ver `igac-base-catastral-departamental`).',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${CATASTRO_SERVICE}/4 (U_TERRENO, id 4)`,
    catalogFile: CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'La capa NO trae avalúo, destino económico, dirección ni área reportada: solo geometría e identificadores.',
    'El servicio declara `supportsPagination: false` y responde 400 a `resultRecordCount`; hay que barrer por rangos de FID.',
    '`maxRecordCount` 2 000 y 3,6 millones de registros: descargar la capa entera por REST son ~1 808 peticiones. Inviable como carga primaria.',
    'El servicio no declara licencia (`copyrightText` vacío).',
  ],
};

const RURAL_TERRAIN: DatasetDefinition = {
  id: 'igac-r-terreno-rest',
  source: 'IGAC',
  name: 'Terrenos rurales (Dato Fundamental Catastro)',
  url: `${CATASTRO_SERVICE}/1`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 4686,
  frequency: 'desconocida',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: { target: 'npn', sqlType: 'CHAR(30)', note: 'NPN de 30 dígitos.' },
    CODIGO_ANT: { target: 'npn_old', sqlType: 'VARCHAR(30)' },
    VEREDA_COD: {
      target: 'manzana_vereda',
      sqlType: 'VARCHAR(17)',
      note: 'Código de vereda de 17 dígitos. ATENCIÓN: en la muestra llega en ceros (08421000000000000).',
    },
    NUMERO_SUB: { target: 'attrs.numero_subpredio', sqlType: 'INTEGER' },
    GlobalID: { target: 'attrs.source_global_id', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(geom, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.parcel',
  validations: [
    ...NPN_VALIDATIONS,
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'vereda-cod-not-zero',
      description:
        'Se cuenta cuántos VEREDA_COD llegan en ceros; si supera el 5 % no se puede armar la jerarquía rural y se marca NO_DISPONIBLE en la ficha.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8'],
  justification:
    'Geometría predial rural nacional, 3 146 345 polígonos verificados. Es la mitad del país en número de predios y el insumo de M5 (aptitud de terreno), que solo tiene sentido en suelo rural.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${CATASTRO_SERVICE}/1 (R_TERRENO, id 1)`,
    catalogFile: CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'El tramo de zona del NPN vale 00 en toda la muestra rural, no 02 como asume `packages/shared`.',
    '`VEREDA_COD` llega en ceros: la jerarquía rural (vereda → predio) no se puede construir desde REST.',
  ],
};

const URBAN_BUILDING: DatasetDefinition = {
  id: 'igac-u-construccion-rest',
  source: 'IGAC',
  name: 'Construcciones urbanas (Dato Fundamental Catastro)',
  url: `${CATASTRO_SERVICE}/2`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 4686,
  frequency: 'desconocida',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: { target: 'attrs.codigo', sqlType: 'CHAR(30)', note: 'NPN del predio.' },
    TERRENO_CO: {
      target: 'parcel_npn',
      sqlType: 'CHAR(30)',
      note: 'NPN del terreno que contiene la construcción. Igual a CODIGO en toda la muestra.',
    },
    TIPO_CONST: {
      target: 'attrs.tipo_construccion',
      sqlType: 'TEXT',
      note: 'Único valor observado: CONVENCIONAL. El dominio completo no está publicado.',
    },
    TIPO_DOMIN: {
      target: 'attrs.tipo_dominio',
      sqlType: 'TEXT',
      note: 'Único valor observado: PRIVADO.',
    },
    NUMERO_PIS: {
      target: 'floors',
      sqlType: 'INTEGER',
      note: 'Número de pisos. Único indicador volumétrico disponible.',
    },
    NUMERO_SOT: { target: 'attrs.numero_sotanos', sqlType: 'INTEGER' },
    NUMERO_MEZ: { target: 'attrs.numero_mezanines', sqlType: 'INTEGER' },
    NUMERO_SEM: { target: 'attrs.numero_semisotanos', sqlType: 'INTEGER' },
    IDENTIFICA: {
      target: 'attrs.identificador_unidad',
      sqlType: 'TEXT',
      note: 'Letra que distingue unidades dentro del mismo terreno (A, B, D observadas). Parte de la clave natural.',
    },
    CODIGO_EDI: {
      target: 'attrs.codigo_edificacion',
      sqlType: 'INTEGER',
      note: 'Número de edificación dentro del terreno.',
    },
    CODIGO_ANT: { target: 'attrs.codigo_anterior', sqlType: 'VARCHAR(30)' },
    GlobalID: { target: 'attrs.source_global_id', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(geom, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.building',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'building-parcel-orphans',
      description:
        'Se reportan las construcciones cuyo TERRENO_CO no existe en core.parcel (huérfanas) y los predios sin construcción.',
      severity: 'warning',
    },
    {
      id: 'floors-range',
      description: 'NUMERO_PIS debe estar entre 1 y 80; fuera de ese rango se marca para revisión.',
      severity: 'warning',
    },
    {
      id: 'built-area-not-derived',
      description:
        'built_area_m2 queda NULL: el área del polígono por número de pisos es una estimación, no un dato del IGAC. No se rellena (regla 2).',
      severity: 'blocker',
    },
  ],
  modules: ['M2', 'M4', 'M7', 'M8'],
  justification:
    'Huella y número de pisos de 4 790 310 construcciones urbanas. Alimenta la sección de construcciones de la ficha (M2), la densidad edificada del analizador de zona (M4) y la detección de obra nueva entre cortes (M8).',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${CATASTRO_SERVICE}/2 (U_CONSTRUCCION, id 2)`,
    catalogFile: CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'No trae área construida en m², ni año, ni uso, ni material: solo la huella y los pisos.',
    'Un mismo CODIGO aparece en varias filas con distinto IDENTIFICA: la clave natural es (TERRENO_CO, CODIGO_EDI, IDENTIFICA).',
  ],
};

const RURAL_BUILDING: DatasetDefinition = {
  id: 'igac-r-construccion-rest',
  source: 'IGAC',
  name: 'Construcciones rurales (Dato Fundamental Catastro)',
  url: `${CATASTRO_SERVICE}/0`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 4686,
  frequency: 'desconocida',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: { target: 'attrs.codigo', sqlType: 'CHAR(30)' },
    TERRENO_CO: { target: 'parcel_npn', sqlType: 'CHAR(30)' },
    TIPO_CONST: { target: 'attrs.tipo_construccion', sqlType: 'TEXT' },
    TIPO_DOMIN: { target: 'attrs.tipo_dominio', sqlType: 'TEXT' },
    NUMERO_PIS: { target: 'floors', sqlType: 'INTEGER' },
    NUMERO_SOT: { target: 'attrs.numero_sotanos', sqlType: 'INTEGER' },
    NUMERO_MEZ: { target: 'attrs.numero_mezanines', sqlType: 'INTEGER' },
    NUMERO_SEM: { target: 'attrs.numero_semisotanos', sqlType: 'INTEGER' },
    IDENTIFICA: { target: 'attrs.identificador_unidad', sqlType: 'TEXT' },
    CODIGO_EDI: { target: 'attrs.codigo_edificacion', sqlType: 'INTEGER' },
    CODIGO_ANT: { target: 'attrs.codigo_anterior', sqlType: 'VARCHAR(30)' },
    GlobalID: { target: 'attrs.source_global_id', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(geom, 4326)))',
    },
  },
  // `USUARIO_LO` (usuario que editó el registro) y `FECHA_LOG` existen en esta
  // capa y NO se ingieren: el primero es PII de operario, el segundo va siempre nulo.
  piiBlocklist: ['USUARIO_LO'],
  targetTable: 'core.building',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'pii-usuario-lo-absent',
      description:
        'La tabla destino no debe contener ninguna columna derivada de USUARIO_LO. Falla la carga si aparece.',
      severity: 'blocker',
    },
    {
      id: 'building-parcel-orphans',
      description: 'Se reportan construcciones sin terreno y terrenos sin construcción.',
      severity: 'warning',
    },
  ],
  modules: ['M2', 'M4', 'M7', 'M8'],
  justification:
    'Huella de 393 507 construcciones rurales. Completa la ficha en suelo rural, donde la construcción es el indicio de ocupación efectiva del predio.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${CATASTRO_SERVICE}/0 (R_CONSTRUCCION, id 0)`,
    catalogFile: CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 2,
  notes: [
    'Es la única capa catastral del REST con una columna de PII: `USUARIO_LO` (String 100), descartada por la lista negra.',
    '`codigo_mun` llega vacío en toda la muestra: el municipio se deriva del NPN.',
  ],
};

const URBAN_BLOCK: DatasetDefinition = {
  id: 'igac-u-manzana-rest',
  source: 'IGAC',
  name: 'Manzanas urbanas (Dato Fundamental Catastro)',
  url: `${CATASTRO_SERVICE}/3`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 4686,
  frequency: 'desconocida',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: {
      target: 'code',
      sqlType: 'VARCHAR(17)',
      note: 'Código de manzana de 17 dígitos: prefijo del NPN hasta el tramo de manzana.',
    },
    BARRIO_COD: {
      target: 'neighborhood_code',
      sqlType: 'VARCHAR(13)',
      note: 'Código de barrio de 13 dígitos.',
    },
    CODIGO_ANT: {
      target: 'code_old',
      sqlType: 'VARCHAR(254)',
      note: 'Longitud declarada 254 pero en la muestra trae 13 caracteres.',
    },
    GlobalID: { target: 'attrs.source_global_id', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(geom, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.block',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'block-code-length',
      description: 'CODIGO debe tener 17 dígitos y BARRIO_COD 13.',
      severity: 'warning',
    },
    {
      id: 'block-contains-parcels',
      description:
        'Cada manzana debería contener al menos un predio cuyo NPN empiece por su código. Se reportan las vacías.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M3', 'M4', 'M9'],
  justification:
    '240 033 manzanas: es la unidad de agregación urbana con la que se enlazan los datos del DANE (manzana censal) y la que permite mostrar el mapa a zooms intermedios sin servir 3,6 millones de predios.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${CATASTRO_SERVICE}/3 (U_MANZANA, id 3)`,
    catalogFile: CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 2,
  notes: [
    'El código de manzana del IGAC NO es el código de manzana censal del DANE: el enlace entre ambos hay que hacerlo por geometría, no por código.',
  ],
};

/**
 * La descarga masiva. Es el bloqueante número uno del MVP: sin los Registros 1 y 2
 * no hay avalúo, destino económico, dirección ni área reportada, y sin eso no hay
 * ficha de predio vendible ni buscador avanzado.
 */
const CADASTRAL_BASE_DOWNLOAD: DatasetDefinition = {
  id: 'igac-base-catastral-departamental',
  source: 'IGAC',
  name: 'Base Catastral Pública por departamento (GDB/GPKG + Registros 1 y 2)',
  url: 'https://datos-abiertos-igac-igac-oit.hub.arcgis.com/',
  connector: 'file-download',
  format: 'zip',
  crs: 4686,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  // Regla 2 de CLAUDE.md: no se inspeccionó el archivo, así que no hay mapeo.
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [
    // El Registro 2 es, por definición, el registro de propietarios. Estas columnas
    // se enumeran por su nombre esperado en la norma; se confirmarán al inspeccionar
    // el archivo. La lista negra global aplica igualmente sobre lo que llegue.
    'NOMBRE',
    'NOMBRES',
    'APELLIDO',
    'APELLIDOS',
    'RAZON_SOCIAL',
    'TIPO_DOCUMENTO',
    'NUMERO_DOCUMENTO',
    'CEDULA',
    'NIT',
    'PROPIETARIO',
    'DIRECCION_CORRESPONDENCIA',
    'TELEFONO',
    'CORREO',
    'MATRICULA_INMOBILIARIA',
  ],
  targetTable: 'raw.igac_base_catastral',
  validations: [
    {
      id: 'no-pii-columns',
      description:
        'Ninguna columna de la lista negra puede sobrevivir al staging. La carga se aborta si alguna llega a `core`.',
      severity: 'blocker',
    },
    {
      id: 'r1-r2-join',
      description:
        'El cruce de geometría con Registro 1 por código predial debe cubrir al menos el 95 % de los predios; se reportan los huérfanos en ambos sentidos.',
      severity: 'warning',
    },
    {
      id: 'count-vs-rest',
      description:
        'El número de predios del departamento debe ser coherente con el conteo del servicio REST filtrado por ese departamento.',
      severity: 'warning',
    },
  ],
  modules: ['M2', 'M3', 'M7', 'M8', 'M9'],
  justification:
    'Es la única fuente abierta que puede traer avalúo catastral, destino económico, dirección y áreas reportadas. La Fase 0 comprobó que el servicio REST del IGAC NO los expone, así que sin esta descarga la ficha de predio (M2) queda incompleta y M3 y M9 se quedan sin insumo. Prioridad absoluta.',
  inspection: 'no-inspeccionado',
  evidence: { inspectedFrom: null, catalogFile: 'data-catalog/igac/manual__igac-datos-abiertos-hub.json', inspectedAt: INSPECTED_AT },
  priority: 1,
  phase: 2,
  notes: [
    'fieldMapping: NO_INSPECCIONADO. No se localizó una URL de descarga directa y estable desde el portal ArcGIS Hub; la descarga es por formulario.',
    'DECISIÓN PENDIENTE: obtener a mano el paquete del departamento piloto del corte vigente y fijar aquí la URL exacta antes de la Fase 2.',
    'DECISIÓN PENDIENTE: confirmar si la licencia es CC BY-SA 4.0 (supuesto de PLAN.md §2) o CC BY 4.0 (lo que declaran los espejos en datos.gov.co). Cambia la estrategia comercial.',
    'Al inspeccionarlo hay que documentar los dominios de destino económico y tipo de construcción, que el REST no publica.',
  ],
};

/** Gestor catastral por municipio: la base de la "cobertura honesta" (regla 6). */
const CADASTRAL_MANAGERS: DatasetDefinition = {
  id: 'igac-gestores-catastrales',
  source: 'IGAC',
  name: 'Gestores catastrales',
  url: `${IGAC_REST}/catastro/Gestores_Catastrales/MapServer`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 9377,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Gestores Catastrales',
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [],
  targetTable: 'core.cadastral_manager',
  validations: [
    {
      id: 'all-municipalities-covered',
      description:
        'Todo municipio de la DIVIPOLA debe tener una fila en core.cadastral_manager, aunque sea con estado "desconocido".',
      severity: 'blocker',
    },
  ],
  modules: ['M1', 'M2', 'M9', 'M12'],
  justification:
    'La regla 6 de CLAUDE.md exige decirle al usuario cuándo un municipio no es jurisdicción del IGAC. Este servicio es la fuente oficial de quién gestiona el catastro de cada municipio y es lo que llena `core.cadastral_manager`. Sin él, el producto muestra mapas vacíos sin explicación.',
  inspection: 'url-verificada',
  evidence: {
    inspectedFrom: `${IGAC_REST}/catastro/Gestores_Catastrales/MapServer/0 (capa "Departamento")`,
    catalogFile: 'data-catalog/igac/catastro__Gestores_Catastrales__MapServer.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'fieldMapping: NO_INSPECCIONADO a nivel de municipio. Se verificó que el servicio responde y que su capa 0 ("Departamento") está en EPSG:9377 con campos `decodigo`, `denombre`, `dearea`, `denorma`, pero la capa municipal con el gestor aún no se ha catalogado.',
    'A diferencia de Dato_Fundamental_Catastro, este servicio SÍ soporta paginación y estadísticas: corre sobre una geodatabase corporativa.',
  ],
};

export const CADASTRE_DATASETS: readonly DatasetDefinition[] = [
  URBAN_TERRAIN,
  RURAL_TERRAIN,
  URBAN_BUILDING,
  RURAL_BUILDING,
  URBAN_BLOCK,
  CADASTRAL_BASE_DOWNLOAD,
  CADASTRAL_MANAGERS,
];
