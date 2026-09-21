/**
 * Datasets catastrales del IGAC.
 *
 * Dos orígenes, con papeles muy distintos (PLAN.md §5.1):
 *
 *  1. **Base Catastral Pública descargable** (GDB por departamento). Es la fuente
 *     primaria. Inspeccionada de verdad en la Fase 0 con el paquete del
 *     departamento piloto **Atlántico (08)**: 18 capas, 86 876 predios,
 *     EPSG:9377, licencia CC BY-SA 4.0 declarada explícitamente.
 *     Evidencia: `docs/DICCIONARIO_CATASTRAL.md` §2 y §3.
 *
 *  2. **ArcGIS REST** (`Dato_Fundamental_Catastro/MapServer`). Solo respaldo y
 *     validación: 5 capas, sin paginación, sin atributos alfanuméricos.
 *     Evidencia: `data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json`.
 *
 * Todos los `fieldMapping` de este archivo salen de inspección real (`ogrinfo`
 * sobre la GDB o el crawler sobre el servicio). Regla 2 de CLAUDE.md.
 */

import { type DatasetDefinition, type DatasetValidation } from '../types.js';

const IGAC_REST = 'https://mapas.igac.gov.co/server/rest/services';
const CATASTRO_SERVICE = `${IGAC_REST}/Dato_Fundamental_Catastro/MapServer`;
const REST_CATALOG_FILE = 'data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json';
const INSPECTED_AT = '2026-09-21';

/**
 * Descarga de la GDB departamental. El identificador es el ítem de ArcGIS Online
 * del departamento; `08` es Atlántico (piloto). Verificado con HEAD el 2026-09-21:
 * 200, `08_ATLANTICO.zip`, 56 609 544 bytes, `Accept-Ranges: bytes`.
 */
const GDB_ITEM_ID = 'b4c2079287ee40bdb159a412fb5bdfad';
const GDB_URL = `https://www.arcgis.com/sharing/rest/content/items/${GDB_ITEM_ID}/data`;
const GDB_SHA256 = '11647eeb3dbe5db92d514c87095ae1a665cd16f4b109fa55f893dcb20519eaeb';
const GDB_EVIDENCE = 'docs/DICCIONARIO_CATASTRAL.md';

/**
 * Licencia verificada en el propio ítem (`licenseInfo`):
 * «Este producto adopta la licencia pública internacional de
 * Reconocimiento-CompartirIgual 4.0 de Creative Commons […]. Por tal razón,
 * nuevos productos y servicios derivados de su reutilización deben ser también
 * licenciados bajo las mismas condiciones […]».
 * Confirma el supuesto de PLAN.md §2 y la cláusula ShareAlike.
 */
const IGAC_LICENSE = 'CC BY-SA 4.0';
const IGAC_ATTRIBUTION = 'Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0';
/** Corte declarado en el ítem: «a corte de 31 de julio de 2026». */
const IGAC_CUT = '2026-07-31';

// ─── Validaciones reutilizables ───────────────────────────────────────────────

const GEOMETRY_VALIDATIONS: readonly DatasetValidation[] = [
  {
    id: 'geom-valid',
    description: 'Toda geometría debe pasar ST_IsValid tras ST_MakeValid; se reportan las corregidas.',
    severity: 'warning',
  },
  {
    id: 'geom-srid-9377',
    description:
      'El SRID de entrada debe ser 9377 (MAGNA CTM12). Si llega otro se aborta en vez de reproyectar a ciegas.',
    severity: 'blocker',
  },
  {
    id: 'geom-within-colombia',
    description: 'El centroide reproyectado a 4326 debe caer dentro de la extensión de Colombia.',
    severity: 'warning',
  },
];

const NPN_VALIDATIONS: readonly DatasetValidation[] = [
  {
    id: 'npn-length',
    description: 'CODIGO debe tener exactamente 30 dígitos numéricos.',
    severity: 'blocker',
  },
  {
    id: 'npn-muni-exists',
    description: 'Los 5 primeros dígitos deben existir en la DIVIPOLA del DANE.',
    severity: 'blocker',
  },
  {
    id: 'npn-duplicates',
    description:
      'Se cuentan los NPN repetidos. En Atlántico hay 706 duplicados sobre 67 925 predios urbanos (1,04 %): el NPN NO es clave única y la tabla destino no puede declararlo PRIMARY KEY.',
    severity: 'warning',
  },
  {
    id: 'count-vs-previous',
    description: 'El número de registros no debe variar más de 10 % frente al corte anterior.',
    severity: 'warning',
  },
  {
    id: 'no-pii-columns',
    description:
      'Ninguna columna de la lista negra puede llegar a `core`. La base pública inspeccionada no trae ninguna, pero la comprobación es obligatoria en cada corte.',
    severity: 'blocker',
  },
];

/** Campos que todas las capas de la GDB comparten. */
const COMMON_GDB_FIELDS = {
  GLOBALID: {
    target: 'attrs.source_global_id',
    sqlType: 'TEXT',
    note: 'GUID de origen. Solo trazabilidad del corte; no es estable entre cortes.',
  },
  codigo_municipio: {
    target: 'muni_code',
    sqlType: 'CHAR(5)',
    note: 'Código DIVIPOLA del municipio. Poblado en toda la muestra de la GDB (a diferencia del servicio REST, donde llega vacío).',
  },
  CODIGO_DEPARTAMENTO: {
    target: 'dept_code',
    sqlType: 'CHAR(2)',
    note: 'Código DIVIPOLA del departamento.',
  },
  SHAPE_Length: {
    target: 'attrs.perimeter_m',
    sqlType: 'NUMERIC',
    note: 'Perímetro en metros: la GDB está en EPSG:9377, que es métrico. (En el servicio REST el equivalente viene en grados y es inservible.)',
  },
  SHAPE_Area: {
    target: 'area_geom_m2',
    sqlType: 'NUMERIC',
    note: 'Área en m². Verificado en Atlántico: mín 5,1 m², media 489,6 m², máx 1 030 087 m², ningún cero. Se recalcula igualmente con ST_Area en 9377 para no depender del dato de origen.',
  },
} as const;

// ─── Capas de la GDB ──────────────────────────────────────────────────────────

const GDB_URBAN_TERRAIN: DatasetDefinition = {
  id: 'igac-gdb-u-terreno',
  source: 'IGAC',
  name: 'Base Catastral Pública — U_TERRENO (terrenos urbanos)',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: {
      target: 'npn',
      sqlType: 'CHAR(30)',
      note: 'Número Predial Nacional de 30 dígitos. NOT NULL en la GDB. No es único: ver validación npn-duplicates.',
    },
    MANZANA_CODIGO: {
      target: 'manzana_vereda',
      sqlType: 'VARCHAR(17)',
      note: 'Código de manzana de 17 dígitos. Llave a U_MANZANA.CODIGO.',
    },
    NUMERO_SUBTERRANEOS: {
      target: 'attrs.numero_subterraneos',
      sqlType: 'INTEGER',
      note: 'NOT NULL DEFAULT 0 en la GDB.',
    },
    CODIGO_ANTERIOR: {
      target: 'npn_old',
      sqlType: 'VARCHAR(20)',
      note: 'Código predial anterior de 20 dígitos. NO es el prefijo de 20 del NPN: omite comuna y barrio.',
    },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
      note: 'MultiPolygon en EPSG:9377. Se sirve en 4326 y se mide en 9377.',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.parcel',
  validations: [
    ...NPN_VALIDATIONS,
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'manzana-fk',
      description: 'Todo MANZANA_CODIGO debería existir en U_MANZANA; se reportan los huérfanos.',
      severity: 'warning',
    },
    {
      id: 'npn-zone-distribution',
      description:
        'Se registra la distribución del tramo de zona (dígitos 6-7). En Atlántico: 01 (62 549), 02 (2 699), 03 (1 124), 04 (867), 05 (413), 06 (271) y 00 (2 anómalos). NO es un booleano urbano/rural.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M3', 'M4', 'M7', 'M8'],
  justification:
    'Es la geometría predial urbana con sus identificadores, la fuente primaria de `core.parcel`. En Atlántico son 67 925 predios en 15 municipios. Sin ella no hay mapa de predios, ni ficha, ni buscador espacial.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'ogrinfo -so -al 08_ATLANTICO/08.gdb → capa U_TERRENO (grupo URBANO)',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    `Descarga verificada: HEAD 200, 08_ATLANTICO.zip, 56 609 544 bytes, Accept-Ranges: bytes. SHA-256 ${GDB_SHA256}.`,
    `Corte declarado por el IGAC: ${IGAC_CUT} (publicado el 2026-09-03).`,
    'La GDB NO trae avalúo catastral, destino económico ni área reportada: los Registros 1 y 2 no están en el paquete público. Ver riesgo `sin-registro-1-2` en data-catalog/RIESGOS.md.',
    'Hay un ítem por departamento: para cambiar de departamento basta cambiar el id del ítem de ArcGIS Online. Son 31 departamentos publicados.',
  ],
};

const GDB_RURAL_TERRAIN: DatasetDefinition = {
  id: 'igac-gdb-r-terreno',
  source: 'IGAC',
  name: 'Base Catastral Pública — R_TERRENO (terrenos rurales)',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: { target: 'npn', sqlType: 'CHAR(30)', note: 'NPN de 30 dígitos, NOT NULL.' },
    VEREDA_CODIGO: {
      target: 'manzana_vereda',
      sqlType: 'VARCHAR(17)',
      note: 'Código de vereda de 17 dígitos. Llave a R_VEREDA.CODIGO. En la GDB SÍ viene poblado (en el servicio REST llega en ceros).',
    },
    NUMERO_SUBTERRANEOS: { target: 'attrs.numero_subterraneos', sqlType: 'INTEGER' },
    CODIGO_ANTERIOR: { target: 'npn_old', sqlType: 'VARCHAR(20)' },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.parcel',
  validations: [
    ...NPN_VALIDATIONS,
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'npn-zone-rural-is-00',
      description:
        'El tramo de zona debe ser 00 en esta capa: verificado en el 100 % de los 18 951 predios rurales de Atlántico.',
      severity: 'warning',
    },
    {
      id: 'vereda-fk',
      description: 'Todo VEREDA_CODIGO debería existir en R_VEREDA; se reportan los huérfanos.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8'],
  justification:
    'Geometría predial rural: 18 951 predios en Atlántico. Es el insumo de M5 (aptitud de terreno), que solo tiene sentido en suelo rural, y de los informes de finca, que son el caso de uso de persona natural con mayor disposición a pagar.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'ogrinfo -so -al 08_ATLANTICO/08.gdb → capa R_TERRENO (grupo RURAL)',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'El tramo de zona del NPN vale 00 en el 100 % de los predios rurales, y 01–06 en los urbanos: la zona identifica el área urbana (cabecera y centros poblados), no un booleano urbano/rural. Esto contradice `ZONE = {URBAN:01, RURAL:02}` de `packages/shared`.',
  ],
};

const GDB_URBAN_BUILDING: DatasetDefinition = {
  id: 'igac-gdb-u-construccion',
  source: 'IGAC',
  name: 'Base Catastral Pública — U_CONSTRUCCION (construcciones urbanas)',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: { target: 'attrs.codigo', sqlType: 'CHAR(30)', note: 'NPN del predio, NOT NULL.' },
    TERRENO_CODIGO: {
      target: 'parcel_npn',
      sqlType: 'CHAR(30)',
      note: 'NPN del terreno. Llave a U_TERRENO.CODIGO.',
    },
    TIPO_CONSTRUCCION: {
      target: 'attrs.tipo_construccion',
      sqlType: 'TEXT',
      transform: "upper(btrim(tipo_construccion))",
      note: 'Dominio `domTipoConstruccion`. Valores observados en Atlántico: CONVENCIONAL (72 753), NO CONVENCIONAL (13 562+), pero con dos grafías cada uno (CONVENCIONAL/Convencional): hay que normalizar a mayúsculas.',
    },
    TIPO_DOMINIO: {
      target: 'attrs.tipo_dominio',
      sqlType: 'TEXT',
      transform: "nullif(upper(btrim(tipo_dominio)), '')",
      note: 'Dominio `domTipoDominio`. Observados: PRIVADO, COMUN y en blanco (3 324 filas con " ").',
    },
    NUMERO_PISOS: {
      target: 'floors',
      sqlType: 'INTEGER',
      note: 'NOT NULL DEFAULT 0. Único indicador volumétrico disponible.',
    },
    NUMERO_SOTANOS: { target: 'attrs.numero_sotanos', sqlType: 'INTEGER' },
    NUMERO_MEZANINES: { target: 'attrs.numero_mezanines', sqlType: 'INTEGER' },
    NUMERO_SEMISOTANOS: { target: 'attrs.numero_semisotanos', sqlType: 'INTEGER' },
    ETIQUETA: {
      target: 'attrs.etiqueta',
      sqlType: 'TEXT',
      note: 'Etiqueta de dibujo. Vacía en la muestra del servicio REST; verificar utilidad en la GDB.',
    },
    IDENTIFICADOR: {
      target: 'attrs.identificador_unidad',
      sqlType: 'TEXT',
      note: 'Letra que distingue unidades dentro del terreno (DEFAULT "A"). Parte de la clave natural.',
    },
    CODIGO_EDIFICACION: { target: 'attrs.codigo_edificacion', sqlType: 'INTEGER' },
    CODIGO_ANTERIOR: { target: 'attrs.codigo_anterior', sqlType: 'VARCHAR(30)' },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.building',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'building-parcel-orphans',
      description:
        'Se reportan construcciones cuyo TERRENO_CODIGO no existe en core.parcel y predios sin construcción.',
      severity: 'warning',
    },
    {
      id: 'floors-range',
      description: 'NUMERO_PISOS debe estar entre 1 y 80; fuera de rango se marca para revisión.',
      severity: 'warning',
    },
    {
      id: 'built-area-not-derived',
      description:
        'built_area_m2 queda NULL. El área del polígono por número de pisos es una estimación, no un dato del IGAC: no se rellena (regla 2).',
      severity: 'blocker',
    },
    {
      id: 'tipo-construccion-domain',
      description:
        'Tras normalizar a mayúsculas, TIPO_CONSTRUCCION solo debe tomar los valores del dominio domTipoConstruccion; cualquier valor nuevo se reporta.',
      severity: 'warning',
    },
  ],
  modules: ['M2', 'M4', 'M7', 'M8'],
  justification:
    'Huella y pisos de 89 697 construcciones urbanas en Atlántico. Alimenta la sección de construcciones de la ficha (M2), la densidad edificada del analizador de zona (M4) y la detección de obra nueva entre cortes (M8), que es el diferencial de M8 frente a la competencia.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'ogrinfo -so -al 08_ATLANTICO/08.gdb → capa U_CONSTRUCCION',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'No trae área construida en m², ni año de construcción, ni uso, ni material.',
    'La clave natural es (TERRENO_CODIGO, CODIGO_EDIFICACION, IDENTIFICADOR): un mismo CODIGO aparece en varias filas.',
    'Inconsistencia de mayúsculas observada en TIPO_CONSTRUCCION y TIPO_DOMINIO: normalizar en el transform, no en la consulta.',
  ],
};

const GDB_RURAL_BUILDING: DatasetDefinition = {
  id: 'igac-gdb-r-construccion',
  source: 'IGAC',
  name: 'Base Catastral Pública — R_CONSTRUCCION (construcciones rurales)',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: { target: 'attrs.codigo', sqlType: 'CHAR(30)' },
    TERRENO_CODIGO: { target: 'parcel_npn', sqlType: 'CHAR(30)' },
    TIPO_CONSTRUCCION: {
      target: 'attrs.tipo_construccion',
      sqlType: 'TEXT',
      transform: 'upper(btrim(tipo_construccion))',
    },
    TIPO_DOMINIO: {
      target: 'attrs.tipo_dominio',
      sqlType: 'TEXT',
      transform: "nullif(upper(btrim(tipo_dominio)), '')",
    },
    NUMERO_PISOS: { target: 'floors', sqlType: 'INTEGER' },
    NUMERO_SOTANOS: { target: 'attrs.numero_sotanos', sqlType: 'INTEGER' },
    NUMERO_MEZANINES: { target: 'attrs.numero_mezanines', sqlType: 'INTEGER' },
    NUMERO_SEMISOTANOS: { target: 'attrs.numero_semisotanos', sqlType: 'INTEGER' },
    ETIQUETA: { target: 'attrs.etiqueta', sqlType: 'TEXT' },
    IDENTIFICADOR: { target: 'attrs.identificador_unidad', sqlType: 'TEXT' },
    CODIGO_EDIFICACION: { target: 'attrs.codigo_edificacion', sqlType: 'INTEGER' },
    CODIGO_ANTERIOR: { target: 'attrs.codigo_anterior', sqlType: 'VARCHAR(20)' },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  // La GDB de Atlántico NO trae `USUARIO_LOGIN`, pero el servicio REST sí expone
  // `USUARIO_LO` en la capa equivalente: se declara por si aparece en otro corte.
  piiBlocklist: ['USUARIO_LOGIN', 'USUARIO_LO', 'FECHA_LOG'],
  targetTable: 'core.building',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'pii-usuario-absent',
      description:
        'La tabla destino no debe contener ninguna columna derivada de USUARIO_*. Falla la carga si aparece.',
      severity: 'blocker',
    },
    {
      id: 'building-parcel-orphans',
      description: 'Se reportan construcciones sin terreno y terrenos sin construcción.',
      severity: 'warning',
    },
  ],
  modules: ['M2', 'M4', 'M5', 'M7', 'M8'],
  justification:
    'Huella de 18 310 construcciones rurales en Atlántico. En suelo rural la construcción es el indicio de ocupación efectiva del predio, que es lo que pregunta quien compra una finca.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'ogrinfo -so -al 08_ATLANTICO/08.gdb → capa R_CONSTRUCCION',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 2,
  notes: [
    'La capa equivalente del servicio REST (`R_CONSTRUCCION`) sí trae `USUARIO_LO`, la única columna de PII hallada en toda la oferta catastral del IGAC. La GDB no la trae, pero la lista negra la declara igualmente.',
  ],
};

const GDB_URBAN_BLOCK: DatasetDefinition = {
  id: 'igac-gdb-u-manzana',
  source: 'IGAC',
  name: 'Base Catastral Pública — U_MANZANA, U_BARRIO y U_SECTOR (jerarquía urbana)',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: {
      target: 'code',
      sqlType: 'VARCHAR(17)',
      note: 'Manzana: 17 dígitos. Barrio: 13. Sector: 9. Todos son prefijos del NPN.',
    },
    BARRIO_CODIGO: {
      target: 'neighborhood_code',
      sqlType: 'VARCHAR(13)',
      note: 'Solo en U_MANZANA. Llave a U_BARRIO.CODIGO.',
    },
    SECTOR_CODIGO: {
      target: 'sector_code',
      sqlType: 'VARCHAR(9)',
      note: 'Solo en U_BARRIO. Llave a U_SECTOR.CODIGO.',
    },
    NOMBRE: {
      target: 'name',
      sqlType: 'TEXT',
      note: 'Solo en U_BARRIO (String 100, NOT NULL). Es el nombre del barrio: dato público del territorio, no de personas. Alimenta el buscador por barrio.',
    },
    CODIGO_ANTERIOR: {
      target: 'code_old',
      sqlType: 'VARCHAR(255)',
      note: 'Solo en U_MANZANA. Longitud declarada 255 aunque el contenido observado son 13 caracteres.',
    },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.block / core.neighborhood / core.sector',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'hierarchy-codes',
      description:
        'El código de barrio debe ser prefijo del de manzana, y el de sector prefijo del de barrio. Se reportan las rupturas.',
      severity: 'warning',
    },
    {
      id: 'block-contains-parcels',
      description: 'Se reportan las manzanas sin ningún predio cuyo NPN empiece por su código.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M3', 'M4', 'M9'],
  justification:
    'La jerarquía urbana (5 164 manzanas, 33 barrios, 38 sectores en Atlántico) es la unidad de agregación con la que se sirve el mapa a zooms intermedios sin mandar 68 000 predios, y U_BARRIO aporta el único nombre de barrio oficial del catastro, imprescindible para el buscador universal de M1.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'ogrinfo -so -al 08_ATLANTICO/08.gdb → capas U_MANZANA, U_BARRIO, U_SECTOR',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 2,
  notes: [
    'Son tres capas con esquemas casi idénticos; se declaran juntas porque comparten transformación y tabla destino por tipo.',
    'El código de manzana del IGAC NO coincide con el de manzana censal del DANE: el enlace entre ambos es por geometría.',
    'Atlántico tiene solo 33 barrios para 15 municipios: la cobertura de U_BARRIO es parcial y la UI debe tolerar barrio nulo.',
  ],
};

const GDB_RURAL_HIERARCHY: DatasetDefinition = {
  id: 'igac-gdb-r-vereda',
  source: 'IGAC',
  name: 'Base Catastral Pública — R_VEREDA y R_SECTOR (jerarquía rural)',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    CODIGO: {
      target: 'code',
      sqlType: 'VARCHAR(17)',
      note: 'Vereda: 17 dígitos. Sector rural: 9.',
    },
    SECTOR_CODIGO: { target: 'sector_code', sqlType: 'VARCHAR(9)', note: 'Solo en R_VEREDA.' },
    NOMBRE: {
      target: 'name',
      sqlType: 'TEXT',
      note: 'Nombre de la vereda (String 100, NOT NULL en R_VEREDA). Topónimo, no dato personal.',
    },
    CODIGO_ANTERIOR: { target: 'code_old', sqlType: 'VARCHAR(13)' },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.vereda / core.sector',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'vereda-name-not-empty',
      description: 'NOMBRE no puede venir vacío: es lo que el usuario busca en zona rural.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M4', 'M5'],
  justification:
    'El nombre de la vereda es como la gente identifica un predio rural ("la finca en la vereda X"): sin R_VEREDA el buscador universal no funciona fuera de las cabeceras. Son 50 veredas y 40 sectores rurales en Atlántico.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'ogrinfo -so -al 08_ATLANTICO/08.gdb → capas R_VEREDA, R_SECTOR',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 2,
  notes: [
    'Solo 50 veredas para 15 municipios rurales: la cobertura es baja frente a la realidad del territorio. Verificar contra otro departamento antes de prometer búsqueda por vereda a nivel nacional.',
  ],
};

const GDB_ADDRESSES: DatasetDefinition = {
  id: 'igac-gdb-nomenclatura',
  source: 'IGAC',
  name: 'Base Catastral Pública — U_/R_NOMENCLATURA_DOMICILIARIA y VIAL',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    TEXTO: {
      target: 'label',
      sqlType: 'TEXT',
      note: 'String 600. En nomenclatura domiciliaria debería ser la dirección del predio; en Atlántico solo 18 de 73 215 registros contienen "Carrera"/"Calle". Ver nota de calidad.',
    },
    TERRENO_CODIGO: {
      target: 'parcel_npn',
      sqlType: 'CHAR(30)',
      note: 'NPN del predio al que corresponde la dirección. NOT NULL en R_, nullable en U_.',
    },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiLineString,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
      note: 'MultiLineString: es la línea de rotulación, no un punto de dirección.',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.address_point / core.street_name',
  validations: [
    {
      id: 'address-usefulness',
      description:
        'Se mide qué porcentaje de TEXTO contiene un tipo de vía reconocible (Calle/Carrera/Diagonal/Transversal). Si es menor al 30 %, el dataset NO puede alimentar el geocodificador y la UI debe declarar la dirección NO_DISPONIBLE.',
      severity: 'blocker',
    },
    {
      id: 'address-parcel-fk',
      description: 'TERRENO_CODIGO debe existir en core.parcel; se reportan los huérfanos.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2'],
  justification:
    'Es la única capa del catastro que podría dar la dirección de un predio, y la dirección es la forma en que el 99 % de los usuarios buscará. Entra al MVP para medirla y decidir, no para prometerla: la inspección de Atlántico dice que hoy NO sirve como dirección.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom:
      'ogrinfo -so -al + consultas SQLITE sobre 08_ATLANTICO/08.gdb → U_NOMENCLATURA_DOMICILIARIA (73 215 filas), U_NOMENCLATURA_VIAL (4 280), R_NOMENCLATURA_DOMICILIARIA (11 856), R_NOMENCLATURA_VIAL (14)',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 3,
  phase: 3,
  notes: [
    'HALLAZGO CRÍTICO: de 73 215 registros de nomenclatura domiciliaria urbana en Atlántico, 14 125 dicen literalmente "NS" y solo 18 contienen "Carrera" o "Calle". El resto son topónimos y nombres de lote ("ARROYO GRANDE", "PARCELA L-1 DIVISION 1", "ZONA DE CESION No.1").',
    'Consecuencia: el buscador por dirección del MVP NO puede sostenerse con el catastro. Alternativas a evaluar: nomenclatura de OSM, geocodificador propio sobre U_NOMENCLATURA_VIAL, o declarar la búsqueda por dirección fuera del alcance del MVP.',
    'La geometría es una línea de rotulación, no un punto de dirección: `core.address_point` necesitaría derivar el punto (p. ej. ST_LineInterpolatePoint), lo que es una estimación y debe marcarse como tal.',
  ],
};

const GDB_URBAN_PERIMETER: DatasetDefinition = {
  id: 'igac-gdb-u-perimetro',
  source: 'IGAC',
  name: 'Base Catastral Pública — U_PERIMETRO (perímetros urbanos y centros poblados)',
  url: GDB_URL,
  connector: 'file-download',
  format: 'gdb',
  crs: 9377,
  frequency: 'mensual',
  license: IGAC_LICENSE,
  attribution: IGAC_ATTRIBUTION,
  fieldMapping: {
    DEPARTAMENTO_CODIGO: { target: 'dept_code', sqlType: 'CHAR(2)' },
    MUNICIPIO_CODIGO: {
      target: 'muni_code',
      sqlType: 'VARCHAR(5)',
      note: 'ATENCIÓN: no siempre trae 5 dígitos. Observados "08078" y "137" en la misma capa. Usar `codigo_municipio` como fuente autoritativa.',
    },
    TIPO_AVALUO: {
      target: 'attrs.tipo_avaluo',
      sqlType: 'TEXT',
      note: 'Campo mal usado: mezcla códigos de 2 dígitos (01, 02) con códigos de 7 (0814101). No se interpreta; se guarda como texto crudo.',
    },
    NOMBRE_GEOGRAFICO: {
      target: 'name',
      sqlType: 'TEXT',
      note: 'Topónimo del área urbana. Observados "Baranoa", "CAMPO DE LA CRUZ", "BOHORQUEZ". Con nulos.',
    },
    CODIGO_NOMBRE: {
      target: 'attrs.categoria',
      sqlType: 'TEXT',
      note: 'Dominio `domAdministrativo`. Observados "Cabecera Municipal", "Corregimiento", y también el propio nombre del municipio ("Baranoa"): el campo se usa de forma inconsistente.',
    },
    ...COMMON_GDB_FIELDS,
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(shape, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'core.urban_perimeter',
  validations: [
    ...GEOMETRY_VALIDATIONS,
    {
      id: 'muni-code-length',
      description:
        'Se cuentan los MUNICIPIO_CODIGO que no tienen 5 dígitos y se resuelven con codigo_municipio antes de cargar.',
      severity: 'warning',
    },
    {
      id: 'perimeter-contains-urban-parcels',
      description:
        'Todo predio urbano debería caer dentro de algún perímetro; se reporta el porcentaje que queda fuera.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M4', 'M5'],
  justification:
    'Distinguir suelo urbano de rural es la primera pregunta de cualquier análisis de aptitud (M5) y el filtro más usado del buscador (M3). Con 29 perímetros para 15 municipios queda claro que hay más de un área urbana por municipio (cabecera + centros poblados), lo que explica los códigos de zona 01–06 del NPN.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'ogrinfo -so -al + consultas SQLITE sobre 08_ATLANTICO/08.gdb → U_PERIMETRO (29 filas)',
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 2,
  notes: [
    'Tres campos con uso inconsistente (MUNICIPIO_CODIGO, TIPO_AVALUO, CODIGO_NOMBRE): no se interpretan en el MVP, se guardan crudos en `attrs` y se documenta.',
  ],
};

// ─── Respaldo por REST ────────────────────────────────────────────────────────

const REST_URBAN_TERRAIN: DatasetDefinition = {
  id: 'igac-u-terreno-rest',
  source: 'IGAC',
  name: 'Dato Fundamental Catastro (REST) — U_TERRENO, validación nacional',
  url: `${CATASTRO_SERVICE}/4`,
  connector: 'arcgis-rest',
  format: 'geojson',
  crs: 4686,
  frequency: 'desconocida',
  license: `${IGAC_LICENSE} (asumida del portal; el servicio no declara copyrightText)`,
  attribution: 'Fuente: IGAC, Dato Fundamental Catastro, CC BY-SA 4.0',
  fieldMapping: {
    CODIGO: { target: 'npn', sqlType: 'CHAR(30)' },
    CODIGO_ANT: { target: 'npn_old', sqlType: 'VARCHAR(20)' },
    MANZANA_CO: {
      target: 'manzana_vereda',
      sqlType: 'VARCHAR(17)',
      note: 'Nombre truncado a 10 caracteres por haber pasado por Shapefile. En la GDB es MANZANA_CODIGO.',
    },
    NUMERO_SUB: { target: 'attrs.numero_subterraneos', sqlType: 'INTEGER' },
    GLOBALID_S: {
      target: 'attrs.globalid_s',
      sqlType: 'TEXT',
      note: 'Campo muerto: cadena vacía (" ") en el 100 % de la muestra.',
    },
    GlobalID: { target: 'attrs.source_global_id', sqlType: 'TEXT' },
    Shape: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_Transform(geom, 4326)))',
    },
  },
  piiBlocklist: [],
  targetTable: 'raw.igac_rest_u_terreno',
  validations: [
    {
      id: 'shape-area-is-degrees',
      description:
        'SHAPE_Area y SHAPE_Leng de este servicio vienen en grados (el servicio reproyecta a 4686) y NO se ingieren.',
      severity: 'blocker',
    },
    {
      id: 'count-vs-gdb',
      description:
        'El conteo nacional del servicio (3 616 349 predios urbanos el 2026-09-21) se compara con la suma de las GDB departamentales cargadas para detectar departamentos faltantes.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M9'],
  justification:
    'No sirve como carga primaria (3,6 millones de registros con `maxRecordCount` 2 000 y sin paginación serían ~1 808 peticiones), pero sí como control de cobertura: su conteo nacional permite saber cuántos predios del IGAC existen y, por diferencia, cuántos nos faltan. Es la forma honesta de llenar la tabla de cobertura (regla 6).',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${CATASTRO_SERVICE}/4 (U_TERRENO, id 4)`,
    catalogFile: REST_CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 3,
  phase: 2,
  notes: [
    'Conteos nacionales verificados el 2026-09-21: U_TERRENO 3 616 349, R_TERRENO 3 146 345, U_CONSTRUCCION 4 790 310, R_CONSTRUCCION 393 507, U_MANZANA 240 033.',
    'El servicio declara `supportsPagination: false` y responde 400 a `resultRecordCount`: el conector pagina por rangos de FID.',
    'Los nombres de campo están truncados a 10 caracteres y NO coinciden con los de la GDB: son dos esquemas distintos de la misma información.',
  ],
};

// ─── Gestores catastrales ─────────────────────────────────────────────────────

const CADASTRAL_MANAGERS: DatasetDefinition = {
  id: 'igac-gestores-catastrales',
  source: 'IGAC',
  name: 'Gestores Catastrales de Colombia',
  url: 'https://www.datos.gov.co/resource/bhcx-bx97.json',
  connector: 'socrata',
  format: 'json',
  crs: 4326,
  frequency: 'eventual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Gestores Catastrales de Colombia, CC BY-SA 4.0',
  fieldMapping: {
    mpcodigo: {
      target: 'muni_code',
      sqlType: 'CHAR(5)',
      note: 'Código del municipio. Verificar contra `divipola` (ambos campos existen).',
    },
    divipola: { target: 'attrs.divipola', sqlType: 'TEXT' },
    mpnombre: { target: 'attrs.municipio_nombre', sqlType: 'TEXT' },
    departamen: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    depto: { target: 'dept_code', sqlType: 'VARCHAR(5)' },
    gestor_cat: {
      target: 'manager_name',
      sqlType: 'TEXT',
      note: 'Nombre del gestor catastral del municipio. Es el campo que decide `is_igac`.',
    },
    estado_act: {
      target: 'coverage_status',
      sqlType: 'TEXT',
      note: 'Estado de la actualización catastral. Se mapea a `full|partial|none|unknown` del contrato `Coverage`.',
    },
    ley617: { target: 'attrs.ley_617', sqlType: 'TEXT' },
    acto_admin: { target: 'attrs.acto_administrativo', sqlType: 'TEXT' },
    fecha_cont: { target: 'attrs.fecha_contrato', sqlType: 'DATE' },
    inicio: { target: 'attrs.inicio', sqlType: 'DATE' },
    restriccio: {
      target: 'notes',
      sqlType: 'TEXT',
      note: 'Restricciones declaradas. Se muestra al usuario en el mensaje de cobertura.',
    },
    url_habili: { target: 'attrs.url_habilitacion', sqlType: 'TEXT' },
    url_servic: { target: 'attrs.url_servicio', sqlType: 'TEXT' },
    the_geom: {
      target: 'geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_GeomFromGeoJSON(the_geom)))',
      note: 'MultiPolygon GeoJSON embebido en el JSON de Socrata, ya en EPSG:4326.',
    },
  },
  // `contacto` trae datos de contacto del gestor: la lista negra lo descarta.
  piiBlocklist: ['contacto', 'responsabl', 'gestor_con'],
  targetTable: 'core.cadastral_manager',
  validations: [
    {
      id: 'all-municipalities-covered',
      description:
        'Todo municipio de la DIVIPOLA debe tener fila en core.cadastral_manager, aunque sea con estado "desconocido". 1 122 filas frente a ~1 122 municipios: verificar el cruce exacto.',
      severity: 'blocker',
    },
    {
      id: 'contacto-absent',
      description: 'La columna `contacto` no puede llegar a core: contiene datos de contacto.',
      severity: 'blocker',
    },
    {
      id: 'is-igac-derivable',
      description: '`gestor_cat` debe permitir decidir sin ambigüedad si el gestor es el IGAC.',
      severity: 'blocker',
    },
  ],
  modules: ['M1', 'M2', 'M9', 'M12'],
  justification:
    'La regla 6 de CLAUDE.md exige decirle al usuario cuándo un municipio no es jurisdicción del IGAC. Este dataset, con 1 122 filas y geometría municipal, es exactamente `core.cadastral_manager` y es lo que convierte "mapa vacío" en "este municipio lo gestiona X, esto sí tenemos". Sin él el producto miente por omisión.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'https://www.datos.gov.co/resource/bhcx-bx97.json (28 columnas, 1 122 filas)',
    catalogFile: 'data-catalog/igac/socrata__bhcx-bx97.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'Corte declarado: 2025-03-05. Los gestores catastrales cambian con frecuencia: hay que revisar la vigencia antes de cada lanzamiento.',
    'Existe también el servicio REST `catastro/Gestores_Catastrales/MapServer` (EPSG:9377, con paginación y estadísticas) como alternativa si el dataset de Socrata se queda atrás.',
    'La columna `contacto` fue marcada por la lista negra de PII y se descarta.',
  ],
};

// ─── Mercado inmobiliario ─────────────────────────────────────────────────────

const REAL_ESTATE_TRANSACTIONS: DatasetDefinition = {
  id: 'igac-transacciones-inmobiliarias',
  source: 'IGAC',
  name: 'Registro de transacciones inmobiliarias en Colombia',
  url: 'https://www.datos.gov.co/resource/7y2j-43cv.json',
  connector: 'socrata',
  format: 'json',
  crs: null,
  frequency: 'anual',
  license: IGAC_LICENSE,
  attribution: 'Fuente: IGAC, Registro de transacciones inmobiliarias, CC BY-SA 4.0',
  fieldMapping: {
    pk: {
      target: 'id',
      sqlType: 'TEXT',
      note: 'Clave compuesta de origen, p. ej. "05001-001-000013-00014-00313-2018".',
    },
    divipola: {
      target: 'muni_code',
      sqlType: 'VARCHAR(5)',
      note: 'ATENCIÓN: viene sin cero a la izquierda ("5001" para Medellín). Hay que rellenar a 5 dígitos.',
      transform: "lpad(divipola, 5, '0')",
    },
    departamento: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    municipio: { target: 'attrs.municipio_nombre', sqlType: 'TEXT' },
    numero_catastral: {
      target: 'npn',
      sqlType: 'VARCHAR(30)',
      note: 'Número catastral del predio: es la llave a core.parcel.',
    },
    numero_catastral_antiguo: { target: 'npn_old', sqlType: 'VARCHAR(20)' },
    year_radica: { target: 'year', sqlType: 'INTEGER' },
    fecha_radica_texto: {
      target: 'filed_at',
      sqlType: 'DATE',
      note: 'Fecha de radicación como texto ("2018-02-05 00:00:00"): parsear explícitamente.',
    },
    fecha_apertura_texto: { target: 'attrs.fecha_apertura', sqlType: 'DATE' },
    tipo_predio_zona: {
      target: 'zone_label',
      sqlType: 'TEXT',
      note: 'Valores observados: URBANO, RURAL. Es el único campo del ecosistema IGAC que dice urbano/rural en texto.',
    },
    categoria_ruralidad_2024: {
      target: 'attrs.categoria_ruralidad',
      sqlType: 'TEXT',
      note: 'Observado: "Ciudades y aglomeraciones". Categoría de ruralidad de la Misión Rural.',
    },
    valor: {
      target: 'value',
      sqlType: 'NUMERIC',
      note: 'Valor de la transacción. ADVERTENCIA: no es avalúo catastral ni valor comercial certificado (regla 5).',
    },
    tiene_valor: {
      target: 'attrs.tiene_valor',
      sqlType: 'BOOLEAN',
      note: 'Indica si la anotación trae valor. Muchas no lo traen: hay que filtrar por este campo antes de promediar.',
    },
    tiene_mas_de_un_valor: { target: 'attrs.tiene_mas_de_un_valor', sqlType: 'BOOLEAN' },
    num_anotacion: { target: 'attrs.num_anotacion', sqlType: 'TEXT' },
    cod_natujur: {
      target: 'attrs.cod_naturaleza_juridica',
      sqlType: 'TEXT',
      note: 'Código de la naturaleza jurídica del acto (compraventa, hipoteca…). Se usa el código, NO el nombre.',
    },
    orip: { target: 'attrs.orip', sqlType: 'TEXT', note: 'Oficina de Registro de Instrumentos Públicos.' },
    estado_folio: { target: 'attrs.estado_folio', sqlType: 'TEXT' },
    predios_nuevos: { target: 'attrs.predios_nuevos', sqlType: 'INTEGER' },
    dinamica_2024: { target: 'attrs.dinamica_2024', sqlType: 'TEXT' },
  },
  // `nombre_natujur` y `documento_justificativo` los marcó la lista negra.
  // `matricula` es identificador registral del inmueble: se conserva, pero
  // vigilado, porque junto a un titular reconstruiría la ruta predio → persona.
  piiBlocklist: ['nombre_natujur', 'documento_justificativo'],
  targetTable: 'analytics.real_estate_transaction',
  validations: [
    {
      id: 'no-holder-columns',
      description:
        'Ninguna columna que identifique a las partes del acto (nombre_natujur, documento_justificativo) puede llegar a la base.',
      severity: 'blocker',
    },
    {
      id: 'divipola-padded',
      description: 'Tras el lpad, todo `divipola` debe existir en core.municipality.',
      severity: 'blocker',
    },
    {
      id: 'value-only-when-flagged',
      description:
        'Solo se agregan valores de filas con tiene_valor = 1 y tiene_mas_de_un_valor = 0; el resto se cuenta pero no se promedia.',
      severity: 'blocker',
    },
    {
      id: 'no-appraisal-claim',
      description:
        'Toda cifra derivada de este dataset debe salir con la advertencia de la regla 5: no es avalúo ni valor comercial.',
      severity: 'blocker',
    },
  ],
  modules: ['M9', 'M8'],
  justification:
    'Es lo más cerca que hay de un dato abierto de mercado inmobiliario en Colombia: 30 903 248 anotaciones registrales con municipio, número catastral, fecha y, cuando existe, valor. Resuelve la duda que PLAN.md §5.1 dejaba abierta sobre el Observatorio Inmobiliario y habilita M9 (dinámica de transacciones por municipio) sin inventar un modelo de precios.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: 'https://www.datos.gov.co/resource/7y2j-43cv.json (26 columnas, 30 903 248 filas)',
    catalogFile: 'data-catalog/igac/socrata__7y2j-43cv.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 4,
  notes: [
    'Corte declarado: 2025-04-04. 30,9 millones de filas: la ingesta debe ser por municipio y con $select explícito, nunca completa.',
    'Dos columnas de PII detectadas y descartadas: `nombre_natujur` y `documento_justificativo`.',
    'DECISIÓN DE NEGOCIO PENDIENTE: publicar indicadores de valor de transacción es sensible. Requiere el concepto jurídico de PLAN.md §2 y una redacción muy cuidada de la advertencia de la regla 5.',
  ],
};

export const CADASTRE_DATASETS: readonly DatasetDefinition[] = [
  GDB_URBAN_TERRAIN,
  GDB_RURAL_TERRAIN,
  GDB_URBAN_BUILDING,
  GDB_RURAL_BUILDING,
  GDB_URBAN_BLOCK,
  GDB_RURAL_HIERARCHY,
  GDB_ADDRESSES,
  GDB_URBAN_PERIMETER,
  REST_URBAN_TERRAIN,
  CADASTRAL_MANAGERS,
  REAL_ESTATE_TRANSACTIONS,
];
