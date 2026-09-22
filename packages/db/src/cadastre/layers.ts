/**
 * Contrato de las capas de la GDB catastral del IGAC.
 *
 * Cada entrada dice cómo se llama la capa en la File Geodatabase, a qué tabla de
 * `raw` se copia y qué geometría trae. Los nombres salen de la inspección real de
 * las 18 capas de `08_ATLANTICO/08.gdb` con `ogrinfo -so -al` (regla 2 de
 * CLAUDE.md); están declarados en `IGAC_GDB_LAYER_INVENTORY` de
 * `etl/config/datasets/igac-cadastre.ts` y aquí solo se añade lo que el cargador
 * necesita para operar.
 *
 * Los nombres de columna que aparecen en este módulo son los que produce
 * `ogr2ogr` al escribir a PostgreSQL, que **pasa los identificadores a
 * minúsculas**. Por eso `CODIGO` se lee como `codigo` y `SHAPE_Area` como
 * `shape_area`. Ese aplanado resuelve de paso que las capas INFORMAL usen otra
 * caja (`Shape_Area`, `CODIGO_MUNICIPIO`): en `raw` acaban con el mismo nombre.
 */

/** Zona del proyecto: `core.parcel.zone` solo admite estos dos valores. */
export type ProjectZone = '01' | '02';

export interface LayerSpec {
  /** Nombre exacto de la capa en la GDB. */
  readonly layer: string;
  /** Sufijo de la tabla en `raw`: `raw.igac_<dept>_<rawSuffix>`. */
  readonly rawSuffix: string;
  /** Tipo que se fuerza en `ogr2ogr -nlt`. */
  readonly geometry: 'MULTIPOLYGON' | 'MULTILINESTRING';
  /**
   * Zona del proyecto que representa la capa. `01` urbano, `02` rural.
   *
   * NO se deduce del NPN a propósito. En la Fase 0 se comprobó que el tramo de
   * zona del NPN vale `00` en el 100 % de los predios rurales y `01`–`06` en los
   * urbanos: identifica el área urbana concreta (cabecera o centro poblado), no
   * un booleano urbano/rural. Quien sabe si un predio es urbano o rural es la
   * capa de la que salió, y ese tramo se conserva aparte en `attrs`.
   */
  readonly zone: ProjectZone;
  /**
   * `true` si el departamento no se puede cargar sin ella. Las capas de
   * jerarquía y nomenclatura son opcionales porque hay departamentos donde el
   * IGAC no las publica; los terrenos no lo son.
   */
  readonly required: boolean;
  /**
   * `false` para las capas que solo se cuentan. Las capas INFORMAL describen
   * ocupación informal, no predios catastrales formales: entran a `raw` para
   * poder informar cuántas hay, pero no a `core`, porque sumarlas al conteo de
   * predios diría que hay más catastro del que hay.
   */
  readonly loadToCore: boolean;
}

export const CADASTRE_LAYERS: readonly LayerSpec[] = [
  // ─ Terrenos: la razón de ser de la carga ─
  { layer: 'U_TERRENO', rawSuffix: 'u_terreno', geometry: 'MULTIPOLYGON', zone: '01', required: true, loadToCore: true },
  { layer: 'R_TERRENO', rawSuffix: 'r_terreno', geometry: 'MULTIPOLYGON', zone: '02', required: true, loadToCore: true },

  // ─ Construcciones ─
  { layer: 'U_CONSTRUCCION', rawSuffix: 'u_construccion', geometry: 'MULTIPOLYGON', zone: '01', required: false, loadToCore: true },
  { layer: 'R_CONSTRUCCION', rawSuffix: 'r_construccion', geometry: 'MULTIPOLYGON', zone: '02', required: false, loadToCore: true },

  // ─ Jerarquía territorial ─
  { layer: 'U_MANZANA', rawSuffix: 'u_manzana', geometry: 'MULTIPOLYGON', zone: '01', required: false, loadToCore: true },
  { layer: 'U_BARRIO', rawSuffix: 'u_barrio', geometry: 'MULTIPOLYGON', zone: '01', required: false, loadToCore: true },
  { layer: 'U_SECTOR', rawSuffix: 'u_sector', geometry: 'MULTIPOLYGON', zone: '01', required: false, loadToCore: true },
  { layer: 'R_SECTOR', rawSuffix: 'r_sector', geometry: 'MULTIPOLYGON', zone: '02', required: false, loadToCore: true },
  { layer: 'R_VEREDA', rawSuffix: 'r_vereda', geometry: 'MULTIPOLYGON', zone: '02', required: false, loadToCore: true },
  { layer: 'U_PERIMETRO', rawSuffix: 'u_perimetro', geometry: 'MULTIPOLYGON', zone: '01', required: false, loadToCore: true },

  // ─ Nomenclatura ─
  { layer: 'U_NOMENCLATURA_VIAL', rawSuffix: 'u_nomenclatura_vial', geometry: 'MULTILINESTRING', zone: '01', required: false, loadToCore: true },
  { layer: 'R_NOMENCLATURA_VIAL', rawSuffix: 'r_nomenclatura_vial', geometry: 'MULTILINESTRING', zone: '02', required: false, loadToCore: true },
  { layer: 'U_NOMENCLATURA_DOMICILIARIA', rawSuffix: 'u_nomenclatura_dom', geometry: 'MULTILINESTRING', zone: '01', required: false, loadToCore: true },
  { layer: 'R_NOMENCLATURA_DOMICILIARIA', rawSuffix: 'r_nomenclatura_dom', geometry: 'MULTILINESTRING', zone: '02', required: false, loadToCore: true },

  // ─ Informal: se cuenta, no se carga ─
  { layer: 'U_TERRENO_INFORMAL', rawSuffix: 'u_terreno_informal', geometry: 'MULTIPOLYGON', zone: '01', required: false, loadToCore: false },
  { layer: 'R_TERRENO_INFORMAL', rawSuffix: 'r_terreno_informal', geometry: 'MULTIPOLYGON', zone: '02', required: false, loadToCore: false },
  { layer: 'U_CONSTRUCCION_INFORMAL', rawSuffix: 'u_construccion_informal', geometry: 'MULTIPOLYGON', zone: '01', required: false, loadToCore: false },
  { layer: 'R_CONSTRUCCION_INFORMAL', rawSuffix: 'r_construccion_informal', geometry: 'MULTIPOLYGON', zone: '02', required: false, loadToCore: false },
];

/** Nombre de la tabla de staging de una capa en un departamento. */
export function rawTableName(deptCode: string, spec: LayerSpec): string {
  return `igac_${deptCode}_${spec.rawSuffix}`;
}

export function layerSpec(layer: string): LayerSpec {
  const spec = CADASTRE_LAYERS.find((l) => l.layer === layer);
  if (!spec) throw new Error(`Capa no declarada en CADASTRE_LAYERS: ${layer}`);
  return spec;
}

/**
 * Tipos de vía de la nomenclatura colombiana.
 *
 * Decide qué filas de `*_NOMENCLATURA_DOMICILIARIA` son de verdad una dirección.
 * Hace falta porque la capa mezcla direcciones con topónimos y con el literal
 * «NS»: en Atlántico, de 73 215 registros urbanos, 14 125 dicen «NS» y solo 18
 * contienen «Calle» o «Carrera»; el resto son nombres de lote («PARCELA L-1
 * DIVISION 1», «ZONA DE CESION No.1»). Cargarlos todos como direcciones haría
 * que el buscador ofreciera topónimos disfrazados de dirección.
 *
 * El patrón exige que al tipo de vía le siga un número, que es lo que distingue
 * «Calle 30» de un topónimo que contenga la palabra «calle».
 */
export const STREET_TYPE_PATTERN =
  '(?i)(^|[^a-z])(calle|carrera|avenida|avenida\\s+calle|avenida\\s+carrera|diagonal|transversal|circular|circunvalar|autopista|via|kilometro|km|manzana|bloque|torre|cl|cr|kr|ac|ak|dg|tv|tr|av)[\\s.]*[0-9]';

/** Literales observados que la fuente usa para «sin nomenclatura». */
export const NO_ADDRESS_LITERALS: readonly string[] = ['NS', 'N/S', 'SN', 'S/N', 'SIN NOMENCLATURA', '.', '-'];
