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

/** Plantilla de descarga directa de un ítem de ArcGIS Online. */
export function arcgisItemDataUrl(itemId: string): string {
  return `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data`;
}

/** Metadatos del ítem de ArcGIS Online (para leer corte, tamaño y licencia). */
export function arcgisItemMetadataUrl(itemId: string): string {
  return `https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`;
}

/**
 * Un ítem de ArcGIS Online por departamento con jurisdicción del IGAC.
 *
 * Los 31 identificadores se verificaron el 2026-09-21 contra
 * `https://www.arcgis.com/sharing/rest/search?q=owner:IGAC-Admin AND title:"Base Catastral"`
 * y, uno a uno, contra `arcgisItemMetadataUrl(itemId)`: los 31 responden 200 con
 * `owner: IGAC-Admin`, `type: File Geodatabase` y `access: public`.
 *
 * `sizeBytes` y `declaredCut` son los que devolvió el ítem ese día. El cargador
 * NO se fía de esta copia: vuelve a leer el ítem en cada corrida y usa la fecha
 * de corte que declare la fuente en ese momento (regla 4). Se guardan aquí para
 * poder detectar que un ítem cambió de tamaño o de corte entre corridas.
 */
export interface DepartmentGdbItem {
  /** Código DIVIPOLA del departamento (clave de partición de `core.parcel`). */
  readonly deptCode: string;
  readonly deptName: string;
  /** Identificador del ítem de ArcGIS Online. */
  readonly itemId: string;
  /** Nombre del ZIP tal como lo publica el ítem. */
  readonly fileName: string;
  /** Tamaño observado el 2026-09-21, en bytes. */
  readonly sizeBytes: number;
  /** Corte declarado por el ítem el 2026-09-21 (`snippet`/`description`). */
  readonly declaredCut: string;
}

export const IGAC_DEPARTMENT_GDB_ITEMS: readonly DepartmentGdbItem[] = [
  { deptCode: '08', deptName: 'Atlántico', itemId: 'b4c2079287ee40bdb159a412fb5bdfad', fileName: '08_ATLANTICO.zip', sizeBytes: 56_609_544, declaredCut: '2026-08-31' },
  { deptCode: '13', deptName: 'Bolívar', itemId: '5b52d511fd63447ea838cbe83571e6d9', fileName: '13_BOLIVAR.zip', sizeBytes: 170_505_216, declaredCut: '2026-08-31' },
  { deptCode: '15', deptName: 'Boyacá', itemId: '723e946e9ede418a95a6eefd28439626', fileName: '15_BOYACA.zip', sizeBytes: 360_513_536, declaredCut: '2026-08-31' },
  { deptCode: '17', deptName: 'Caldas', itemId: 'ee8ff6e5ec1543efbbf725f9c5407bb1', fileName: '17_CALDAS.zip', sizeBytes: 140_296_192, declaredCut: '2026-08-31' },
  { deptCode: '18', deptName: 'Caquetá', itemId: '43858ab694de4a03943b44a8dc9fe0f7', fileName: '18_CAQUETA.zip', sizeBytes: 72_982_528, declaredCut: '2026-08-31' },
  { deptCode: '19', deptName: 'Cauca', itemId: 'e636ae42b01c41c38eb68b9dc1e7fe6d', fileName: '19_CAUCA.zip', sizeBytes: 277_667_840, declaredCut: '2026-07-31' },
  { deptCode: '20', deptName: 'Cesar', itemId: '6ae575322bf247ef917e01928cde81e7', fileName: '20_CESAR.zip', sizeBytes: 119_014_400, declaredCut: '2026-08-31' },
  { deptCode: '23', deptName: 'Córdoba', itemId: '34be9606b4c24f3687979e3248bec336', fileName: '23_CORDOBA.zip', sizeBytes: 141_688_832, declaredCut: '2026-08-31' },
  { deptCode: '25', deptName: 'Cundinamarca', itemId: '013f8e1a81514861a6cc0d2fa22fd075', fileName: '25_CUNDINAMARCA.zip', sizeBytes: 171_442_176, declaredCut: '2026-08-31' },
  { deptCode: '27', deptName: 'Chocó', itemId: 'ef867bdadca34e85a65371cb2dcf8799', fileName: '27_CHOCO.zip', sizeBytes: 29_675_520, declaredCut: '2026-08-31' },
  { deptCode: '41', deptName: 'Huila', itemId: '9ee0cc892c1849ffb20e4ffc1b1536e4', fileName: '41_HUILA.zip', sizeBytes: 163_053_568, declaredCut: '2026-08-31' },
  { deptCode: '44', deptName: 'La Guajira', itemId: '0b70d2b04d864929ac31063d128b8130', fileName: '44_LA_GUAJIRA.zip', sizeBytes: 63_229_952, declaredCut: '2026-08-31' },
  { deptCode: '47', deptName: 'Magdalena', itemId: '73aa0831f4b5430ab36f9de88f3e77c8', fileName: '47_MAGDALENA.zip', sizeBytes: 113_770_496, declaredCut: '2026-08-31' },
  { deptCode: '50', deptName: 'Meta', itemId: '7209bbf194fa4ece886bb17dd4ec0423', fileName: '50_META.zip', sizeBytes: 176_160_768, declaredCut: '2026-08-31' },
  { deptCode: '52', deptName: 'Nariño', itemId: 'ca9cf5d0b7574a2e89b20f55c32df4d8', fileName: '52_NARIÑO.zip', sizeBytes: 224_788_480, declaredCut: '2026-08-31' },
  { deptCode: '54', deptName: 'Norte de Santander', itemId: '6bb6dc70cbd44db1bc294e1ddca09fb7', fileName: '54_NORTE_DE_SANTANDER.zip', sizeBytes: 91_963_392, declaredCut: '2026-08-31' },
  { deptCode: '63', deptName: 'Quindío', itemId: 'cd3d983dfda94302807af70f88cd50c8', fileName: '63_QUINDIO.zip', sizeBytes: 45_717_504, declaredCut: '2026-08-31' },
  { deptCode: '66', deptName: 'Risaralda', itemId: '2e938e38f3f548d8b1aaae8efa52db20', fileName: '66_RISARALDA.zip', sizeBytes: 51_066_880, declaredCut: '2026-08-31' },
  { deptCode: '68', deptName: 'Santander', itemId: 'a139cba741fc4b8fad80378a94ac9b57', fileName: '68_SANTANDER.zip', sizeBytes: 210_124_800, declaredCut: '2026-08-31' },
  { deptCode: '70', deptName: 'Sucre', itemId: '2e2acfdaf4cc4667b61eecf3cf323939', fileName: '70_SUCRE.zip', sizeBytes: 213_495_808, declaredCut: '2026-08-31' },
  { deptCode: '73', deptName: 'Tolima', itemId: '2236f306e7694e42bd2394a063f70052', fileName: '73_TOLIMA.zip', sizeBytes: 276_234_240, declaredCut: '2026-08-31' },
  { deptCode: '76', deptName: 'Valle del Cauca', itemId: '82c38882bca04d77982ace710fa2f361', fileName: '76_VALLE_DEL_CAUCA.zip', sizeBytes: 177_618_944, declaredCut: '2026-08-31' },
  { deptCode: '81', deptName: 'Arauca', itemId: 'd550dc60eabb435686eed008691f172d', fileName: '81_ARAUCA.zip', sizeBytes: 26_005_504, declaredCut: '2026-08-31' },
  { deptCode: '85', deptName: 'Casanare', itemId: '9fc2be94ac644a3b979e822930cf9c8e', fileName: '85_CASANARE.zip', sizeBytes: 62_914_560, declaredCut: '2026-08-31' },
  { deptCode: '86', deptName: 'Putumayo', itemId: '28b11d334b8b410b80c24699ad1c058e', fileName: '86_PUTUMAYO.zip', sizeBytes: 85_041_152, declaredCut: '2026-08-31' },
  { deptCode: '88', deptName: 'Archipiélago de San Andrés, Providencia y Santa Catalina', itemId: 'ac2d60a10ea644ee842aa5d643f58ec4', fileName: '88_SAN_ANDRES.zip', sizeBytes: 6_396_313, declaredCut: '2026-08-31' },
  { deptCode: '91', deptName: 'Amazonas', itemId: '19ae3d80c26c4ba3862a0f0adcc5b905', fileName: '91_AMAZONAS.zip', sizeBytes: 119_853_056, declaredCut: '2026-08-31' },
  { deptCode: '94', deptName: 'Guainía', itemId: '98c5351a21d94a01b76841a81d9ef369', fileName: '94_GUAINIA.zip', sizeBytes: 734_003, declaredCut: '2026-08-31' },
  { deptCode: '95', deptName: 'Guaviare', itemId: '035281b427a247eaaae07d5fedd8b74c', fileName: '95_GUAVIARE.zip', sizeBytes: 14_155_776, declaredCut: '2026-08-31' },
  { deptCode: '97', deptName: 'Vaupés', itemId: '4263d357365c450186e345e4d977c4bc', fileName: '97_VAUPES.zip', sizeBytes: 5_347_737, declaredCut: '2026-08-31' },
  { deptCode: '99', deptName: 'Vichada', itemId: '9823923292ed481caacba224f6c6472f', fileName: '99_VICHADA.zip', sizeBytes: 213_368_832, declaredCut: '2026-08-31' },
] as const;

/**
 * Departamentos SIN base catastral pública del IGAC, porque su catastro lo lleva
 * otro gestor habilitado. NO es un fallo de la carga: es cobertura real y la UI
 * tiene que decirlo con cifras (regla 6 de CLAUDE.md).
 *
 * Se contrasta en cada corrida contra `core.cadastral_manager`, que sale del
 * dataset `igac-gestores-catastrales`: ahí está el gestor municipio a municipio,
 * que es el detalle que el usuario necesita (en Antioquia el gestor es
 * departamental, en el resto del país hay gestores municipales sueltos).
 */
export const DEPARTMENTS_WITHOUT_IGAC_GDB: readonly { deptCode: string; deptName: string; reason: string }[] = [
  {
    deptCode: '05',
    deptName: 'Antioquia',
    reason:
      'Gestor catastral propio (Catastro de Antioquia). El IGAC no publica GDB de este departamento.',
  },
  {
    deptCode: '11',
    deptName: 'Bogotá, D.C.',
    reason:
      'Gestor catastral propio (Unidad Administrativa Especial de Catastro Distrital). El IGAC no publica GDB de este distrito.',
  },
] as const;

/** Identificador del dataset de un departamento. Un corte por departamento (regla 4). */
export function cadastreDatasetId(deptCode: string): string {
  return `igac-cadastre-${deptCode}`;
}

/** Prefijo de los datasets catastrales reales; lo usa la API para expandir la procedencia. */
export const CADASTRE_DATASET_PREFIX = 'igac-cadastre-';

/**
 * Campos que el producto necesita y que la Base Catastral **Pública** NO trae.
 *
 * Verificado el 2026-09-21 con `ogrinfo -so -al` sobre las **18 capas** de
 * `08_ATLANTICO/08.gdb`, no solo sobre las urbanas: ninguna capa —urbana, rural,
 * formal o informal— tiene destino económico, avalúo, área registral, dirección
 * alfanumérica, área construida, año de construcción ni uso de construcción.
 * Tampoco hay tablas alfanuméricas en la GDB (los Registros 1 y 2 no van en el
 * paquete público).
 *
 * Estas columnas quedan en NULL. **No se estiman, no se derivan y no se rellenan
 * con un valor por defecto** (reglas 2, 4 y 5 de CLAUDE.md).
 */
export const CADASTRE_UNAVAILABLE_FIELDS: readonly { column: string; why: string }[] = [
  {
    column: 'core.parcel.economic_use',
    why: 'No hay destino económico en ninguna de las 18 capas. Vive en el Registro 1, que no se publica.',
  },
  {
    column: 'core.parcel.cadastral_value',
    why: 'No hay avalúo catastral. Vive en el Registro 2, que no se publica.',
  },
  {
    column: 'core.parcel.valuation_year',
    why: 'Sin avalúo no hay vigencia de avalúo.',
  },
  {
    column: 'core.parcel.area_reported_m2',
    why: 'No hay área de terreno registral. Solo existe SHAPE_Area (área geométrica), que se carga en area_geom_m2.',
  },
  {
    column: 'core.parcel.built_area_m2',
    why: 'No hay área construida. Multiplicar la huella por NUMERO_PISOS sería una estimación nuestra, no un dato del IGAC.',
  },
  {
    column: 'core.parcel.address',
    why: 'No hay dirección alfanumérica del predio. Lo más cercano es el TEXTO de nomenclatura domiciliaria, que en Atlántico solo es una dirección reconocible en 18 de 73 215 registros.',
  },
  {
    column: 'core.building.built_area_m2',
    why: 'No hay área construida por construcción.',
  },
  {
    column: 'core.building.built_year',
    why: 'No hay año de construcción.',
  },
  {
    column: 'core.building.use',
    why: 'No hay uso de la construcción. TIPO_CONSTRUCCION es el TIPO (CONVENCIONAL / NO CONVENCIONAL), no el uso: se guarda en attrs y no se presenta como uso.',
  },
] as const;

/**
 * Inventario real de las 18 capas de la GDB y su destino.
 *
 * Verificado con `ogrinfo -so -al 08_ATLANTICO/08.gdb` el 2026-09-21. Los conteos
 * son los de Atlántico. **Ninguna de las 18 capas tiene una sola columna de dato
 * personal**: no hay propietario, titular, documento, teléfono ni dirección de
 * correspondencia. Los únicos `NOMBRE` son topónimos (R_VEREDA, U_BARRIO) y
 * `NOMBRE_GEOGRAFICO` (U_PERIMETRO), que la allowlist de PII ya reconoce como
 * nombres de cosas. Regla 3 comprobada sobre la fuente completa, no solo sobre
 * las capas que se cargan.
 */
export const IGAC_GDB_LAYER_INVENTORY: readonly {
  layer: string;
  group: 'RURAL' | 'URBANO';
  geometry: 'MultiPolygon' | 'MultiLineString';
  /** Tabla de `core` a la que va, o null si no se carga. */
  target: string | null;
  /** Filas en Atlántico el 2026-09-21. */
  atlanticoRows: number;
  note?: string;
}[] = [
  { layer: 'U_TERRENO', group: 'URBANO', geometry: 'MultiPolygon', target: 'core.parcel', atlanticoRows: 67_925 },
  { layer: 'R_TERRENO', group: 'RURAL', geometry: 'MultiPolygon', target: 'core.parcel', atlanticoRows: 18_951 },
  { layer: 'U_CONSTRUCCION', group: 'URBANO', geometry: 'MultiPolygon', target: 'core.building', atlanticoRows: 89_697 },
  { layer: 'R_CONSTRUCCION', group: 'RURAL', geometry: 'MultiPolygon', target: 'core.building', atlanticoRows: 18_310 },
  { layer: 'U_MANZANA', group: 'URBANO', geometry: 'MultiPolygon', target: 'core.block', atlanticoRows: 5_164 },
  { layer: 'U_BARRIO', group: 'URBANO', geometry: 'MultiPolygon', target: 'core.neighborhood', atlanticoRows: 33, note: 'Es la única capa sin CODIGO_DEPARTAMENTO: el cargador no puede asumir que las 18 capas comparten esquema.' },
  { layer: 'U_SECTOR', group: 'URBANO', geometry: 'MultiPolygon', target: 'core.sector', atlanticoRows: 38 },
  { layer: 'R_SECTOR', group: 'RURAL', geometry: 'MultiPolygon', target: 'core.sector', atlanticoRows: 40 },
  { layer: 'R_VEREDA', group: 'RURAL', geometry: 'MultiPolygon', target: 'core.vereda', atlanticoRows: 50 },
  { layer: 'U_PERIMETRO', group: 'URBANO', geometry: 'MultiPolygon', target: 'core.urban_perimeter', atlanticoRows: 29 },
  { layer: 'U_NOMENCLATURA_VIAL', group: 'URBANO', geometry: 'MultiLineString', target: 'core.street_name', atlanticoRows: 4_280 },
  { layer: 'R_NOMENCLATURA_VIAL', group: 'RURAL', geometry: 'MultiLineString', target: 'core.street_name', atlanticoRows: 14 },
  { layer: 'U_NOMENCLATURA_DOMICILIARIA', group: 'URBANO', geometry: 'MultiLineString', target: 'core.address_point', atlanticoRows: 73_215, note: 'Solo entran las filas cuyo TEXTO es una dirección reconocible; el resto son topónimos y "NS".' },
  { layer: 'R_NOMENCLATURA_DOMICILIARIA', group: 'RURAL', geometry: 'MultiLineString', target: 'core.address_point', atlanticoRows: 11_856, note: 'Igual que la urbana.' },
  { layer: 'U_TERRENO_INFORMAL', group: 'URBANO', geometry: 'MultiPolygon', target: null, atlanticoRows: 0, note: 'Ocupación informal, no predio catastral formal. Se cuenta en `raw` y se informa, pero NO entra a core.parcel: mezclarla inflaría el conteo de predios. Columnas en MAYÚSCULAS (CODIGO_MUNICIPIO, Shape_Area).' },
  { layer: 'R_TERRENO_INFORMAL', group: 'RURAL', geometry: 'MultiPolygon', target: null, atlanticoRows: 0, note: 'Igual que la urbana. No trae VEREDA_CODIGO.' },
  { layer: 'U_CONSTRUCCION_INFORMAL', group: 'URBANO', geometry: 'MultiPolygon', target: null, atlanticoRows: 0, note: 'No entra a core.building por el mismo motivo. No trae TIPO_DOMINIO ni CODIGO_EDIFICACION.' },
  { layer: 'R_CONSTRUCCION_INFORMAL', group: 'RURAL', geometry: 'MultiPolygon', target: null, atlanticoRows: 0, note: 'Igual que la urbana.' },
];

/**
 * Licencia verificada en el propio ítem (`licenseInfo`):
 * «Este producto adopta la licencia pública internacional de
 * Reconocimiento-CompartirIgual 4.0 de Creative Commons […]. Por tal razón,
 * nuevos productos y servicios derivados de su reutilización deben ser también
 * licenciados bajo las mismas condiciones […]».
 * Confirma el supuesto de PLAN.md §2 y la cláusula ShareAlike.
 */
const IGAC_LICENSE = 'CC BY-SA 4.0';

/**
 * Corte declarado por el ítem de ArcGIS Online, releído el 2026-09-21: el
 * `snippet` de 30 de los 31 ítems dice «a corte de 31 de agosto de 2026»
 * (Cauca sigue en «31 de julio de 2026»).
 *
 * NO se usa el campo `modified` del ítem como fecha de corte: el 2026-09-21 los
 * 31 ítems tienen `modified` de ese mismo día, y Cauca —que declara un corte un
 * mes más viejo— tiene el mismo `modified` que los demás. `modified` es la fecha
 * en que se tocó el ítem, no la fecha a la que corresponde el dato. Confundirlas
 * haría que la atribución mintiera (regla 4), así que el cargador lee el corte
 * declarado en el texto del ítem y solo cae a `modified` si no lo encuentra,
 * dejando constancia de que lo hizo.
 */
const IGAC_CUT = '2026-08-31';
const IGAC_ATTRIBUTION = `Fuente: IGAC, Base Catastral, corte ${IGAC_CUT.slice(0, 7)}, CC BY-SA 4.0`;

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
    `Corte declarado por el IGAC en el texto del ítem: ${IGAC_CUT}.`,
    'La GDB NO trae avalúo catastral, destino económico ni área reportada: los Registros 1 y 2 no están en el paquete público. Confirmado el 2026-09-21 sobre las 18 capas, no solo las urbanas: ver CADASTRE_UNAVAILABLE_FIELDS. Riesgo `sin-registro-1-2` en data-catalog/RIESGOS.md.',
    'Hay un ítem por departamento: los 31 identificadores están en IGAC_DEPARTMENT_GDB_ITEMS, verificados uno a uno el 2026-09-21.',
    'El NPN no es único: en Atlántico 431 NPN aparecen en 1 137 filas (hasta 33 partes para un mismo NPN). El cargador las fusiona con ST_Union, porque core.parcel.geom es MultiPolygon y un predio puede ser multiparte; el conteo de fusiones se registra en la validación `npn-duplicates`.',
    'Dos filas de Atlántico traen una LETRA en el tramo `condicion` del NPN (08078010000000553A003900000000): 30 caracteres pero no 30 dígitos. Violan parcel_npn_digits_chk y se rechazan con registro en meta.validation, no se corrigen a mano.',
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
    depto: {
      target: 'attrs.departamento_nombre_corto',
      sqlType: 'VARCHAR(5)',
      note: 'Nombre corto del departamento ("Amazonas"), NO un código. core.cadastral_manager no tiene columna dept_code: el departamento se deduce de muni_code.',
    },
    gestor_cat: {
      target: 'manager_name',
      sqlType: 'TEXT',
      note: 'Nombre del gestor catastral del municipio. Es el campo que decide `is_igac`. Dominio medido el 2026-09-21: 46 gestores distintos, "IGAC" en 836 municipios, "CATASTRO ANTIOQUIA" en 112, "DEPARTAMENTO DE CUNDINAMARCA" en 76, "DEPARTAMENTO DEL VALLE DEL CAUCA" en 25, y 42 gestores más con 1 a 12 municipios. 1 fila lo trae vacío.',
    },
    estado_act: {
      target: 'coverage_status',
      sqlType: 'TEXT',
      note: 'Estado de la habilitación del gestor. Valor observado el 2026-09-21: "EN OPERACION" en 1 121 filas y vacío en 1. NO dice si el catastro está actualizado, así que no se puede derivar `full|partial|none` de él: se mapea a `unknown` y el estado real lo fija la carga de predios.',
    },
    ley617: { target: 'attrs.ley_617', sqlType: 'TEXT' },
    acto_admin: {
      target: 'notes',
      sqlType: 'TEXT',
      note: 'Acto administrativo que habilitó al gestor ("RESOLUCION 727 DEL 12/08/2020"). No nulo en 150 de 1 122 filas. Es lo único de la fuente que sirve como nota accionable para el usuario, así que va a core.cadastral_manager.notes.',
    },
    fecha_cont: {
      target: 'attrs.fecha_contrato',
      sqlType: 'DATE',
      note: 'No nulo en solo 20 de 1 122 filas.',
    },
    inicio: {
      target: 'attrs.inicio',
      sqlType: 'DATE',
      note: 'Fecha de inicio de la habilitación ("2020-11-30T00:00:00.000"). No nulo en 168 de 1 122 filas.',
    },
    restriccio: {
      target: 'attrs.restriccion_cartografica',
      sqlType: 'TEXT',
      note: 'NO son las restricciones del gestor: es un descargo cartográfico idéntico en las 1 122 filas (1 solo valor distinto, medido el 2026-09-21) y además truncado a media frase por una comilla mal cerrada en el origen. No se publica como nota al usuario; se queda en raw.',
    },
    url_habili: {
      target: 'attrs.url_habilitacion',
      sqlType: 'TEXT',
      note: 'Enlace de SharePoint al documento de habilitación, no al portal del gestor. No nulo en 144 de 1 122 filas.',
    },
    url_servic: {
      target: 'attrs.url_servicio',
      sqlType: 'TEXT',
      note: 'Enlace de SharePoint, igual que url_habili; no es el portal del gestor. No nulo en 138 de 1 122 filas. Por eso core.cadastral_manager.manager_url queda NULL: la fuente NO_DISPONIBLE el portal del gestor.',
    },
    the_geom: {
      target: 'raw.geom',
      sqlType: 'geometry(MultiPolygon,4326)',
      transform: 'ST_MakeValid(ST_Multi(ST_GeomFromGeoJSON(the_geom)))',
      note: 'MultiPolygon GeoJSON embebido en el JSON de Socrata, ya en EPSG:4326. core.cadastral_manager NO tiene columna de geometría (es una tabla de atributos por municipio): el polígono se queda en raw.igac_gestores_catastrales.geom. El polígono municipal que usa el mapa viene de core.municipality.',
    },
  },
  // `contacto` trae datos de contacto del gestor: la lista negra lo descarta.
  // Verificado el 2026-09-21 en la fuente: `responsabl` es el nombre completo de una
  // persona natural y `contacto` un correo; no nulos en 282 de 1 122 filas (los gestores
  // locales). Los tres se descartan en `stage` y quedan en meta.pii_discard_log.
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
    'Corte declarado: 2025-03-05 (`data_updated_at` del portal, reconfirmado el 2026-09-21). Los gestores catastrales cambian con frecuencia: hay que revisar la vigencia antes de cada lanzamiento.',
    'Existe también el servicio REST `catastro/Gestores_Catastrales/MapServer` (EPSG:9377, con paginación y estadísticas) como alternativa si el dataset de Socrata se queda atrás.',
    'La columna `contacto` fue marcada por la lista negra de PII y se descarta. `responsabl` y `gestor_con` van en la lista negra del dataset: `gestor_con` resultó ser un texto institucional ("GESTOR IGAC"), pero se descarta igual porque la fuente no garantiza que no traiga un nombre de funcionario.',
    'HALLAZGO DE COBERTURA (regla 6): solo 836 de los 1 122 municipios (74,5 %) tienen al IGAC como gestor catastral. Los 286 restantes —Antioquia con 112, Cundinamarca con 76, Valle con 25 y 43 gestores locales más— NO están en la base abierta del IGAC. Sin esta tabla el producto mostraría mapa vacío sin explicación en una cuarta parte del país.',
    '`estado_act` NO es el estado de actualización catastral sino el de la habilitación del gestor: todas las filas dicen "EN OPERACION". No sirve para poblar `coverage_status`, que queda en `unknown` hasta que se carguen predios del municipio.',
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

// ─── Un dataset por departamento ──────────────────────────────────────────────

/**
 * Los ocho datasets de arriba declaran **las capas**: qué campos trae cada una y
 * cómo se mapean. Estos declaran **los cortes**: un `meta.dataset` y un
 * `meta.snapshot` por departamento, que es lo que exige el linaje.
 *
 * Tiene que ser uno por departamento y no uno solo para todo el país por una
 * razón de esquema, no de gusto: `meta.snapshot` tiene
 * `UNIQUE (dataset_id, cut_date)` y el índice parcial `snapshot_one_active_per_dataset`
 * deja **un único corte activo por dataset**. Con un solo `igac-cadastre`
 * nacional, publicar Boyacá despublicaría Atlántico. Separándolos, cada
 * departamento se carga, se publica y se reemplaza sin tocar a los demás, que es
 * exactamente el motivo por el que `core.parcel` está particionada por
 * `dept_code` (ver cabecera de la migración 0004).
 */
const DEPARTMENT_DATASETS: readonly DatasetDefinition[] = IGAC_DEPARTMENT_GDB_ITEMS.map((item) => ({
  id: cadastreDatasetId(item.deptCode),
  source: 'IGAC',
  name: `Base Catastral Pública — ${item.deptName} (${item.deptCode})`,
  url: arcgisItemDataUrl(item.itemId),
  connector: 'file-download' as const,
  format: 'gdb' as const,
  crs: 9377,
  frequency: 'mensual' as const,
  license: IGAC_LICENSE,
  // La atribución real se reescribe en cada corrida con el corte que declare el
  // ítem ese día. Esta es la del corte verificado el 2026-09-21.
  attribution: `Fuente: IGAC, Base Catastral, corte ${item.declaredCut.slice(0, 7)}, CC BY-SA 4.0`,
  // El mapeo de campos NO se repite aquí: es el de las capas (GDB_URBAN_TERRAIN y
  // compañía), que es donde se inspeccionó. Repetirlo invitaría a que las dos
  // copias se separaran.
  fieldMapping: GDB_URBAN_TERRAIN.fieldMapping,
  piiBlocklist: ['USUARIO_LOGIN', 'USUARIO_LO', 'FECHA_LOG'],
  targetTable: 'core.parcel',
  validations: [...NPN_VALIDATIONS, ...GEOMETRY_VALIDATIONS],
  modules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8'] as const,
  justification: `Corte catastral del departamento de ${item.deptName}. Es la unidad de descarga, de publicación y de partición: un ZIP, un corte, una partición de core.parcel.`,
  inspection: 'inspeccionado' as const,
  evidence: {
    inspectedFrom: `${arcgisItemMetadataUrl(item.itemId)} → owner IGAC-Admin, type "File Geodatabase", access public, name ${item.fileName}, ${item.sizeBytes} bytes`,
    catalogFile: GDB_EVIDENCE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1 as const,
  phase: 2,
  notes: [
    `Ítem de ArcGIS Online ${item.itemId} (${item.fileName}, ${item.sizeBytes} bytes el ${INSPECTED_AT}).`,
    `Corte declarado por la fuente el ${INSPECTED_AT}: ${item.declaredCut}.`,
    'La estructura de capas y campos se inspeccionó sobre Atlántico. El cargador vuelve a inspeccionar cada GDB con ogrinfo antes de cargarla y rechaza el departamento si le falta una capa o le sobra una columna de PII, en vez de suponer que todos los departamentos comparten esquema.',
  ],
}));

export const CADASTRE_DATASETS: readonly DatasetDefinition[] = [
  GDB_URBAN_TERRAIN,
  GDB_RURAL_TERRAIN,
  GDB_URBAN_BUILDING,
  GDB_RURAL_BUILDING,
  GDB_URBAN_BLOCK,
  GDB_RURAL_HIERARCHY,
  GDB_ADDRESSES,
  GDB_URBAN_PERIMETER,
  ...DEPARTMENT_DATASETS,
  REST_URBAN_TERRAIN,
  CADASTRAL_MANAGERS,
  REAL_ESTATE_TRANSACTIONS,
];
