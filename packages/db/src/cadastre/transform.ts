/**
 * Transformación `raw` → `core` del catastro del IGAC.
 *
 * Todo ocurre en SQL, con un `INSERT … SELECT` por capa y municipio: las
 * geometrías nunca pasan por Node. Un departamento grande son cientos de miles de
 * polígonos y traerlos a JavaScript para volver a mandarlos costaría un orden de
 * magnitud más que dejar que PostGIS los transforme donde ya están.
 *
 * Reglas que este módulo hace cumplir:
 *
 *  - **Regla 2.** Solo se leen columnas observadas con `ogrinfo` en la GDB real.
 *    Lo que la fuente no trae se escribe `NULL`; no se estima ni se deriva. La
 *    lista completa está en `CADASTRE_UNAVAILABLE_FIELDS` de `etl/config`.
 *  - **Regla 5.** `cadastral_value` queda NULL porque el avalúo no está en la base
 *    pública. No hay ninguna ruta en este módulo que lo rellene.
 *  - Geometría: se guarda en EPSG:4326 (`core.clean_polygon`) y se mide en
 *    EPSG:9377 (`core.area_m2`), que es la convención del proyecto.
 *  - Particionado: `dept_code` sale de los dos primeros dígitos del NPN, no del
 *    campo `CODIGO_DEPARTAMENTO`, que llega NULL en el 100 % de las filas.
 */

import { execute, query } from '../pool.js';
import { ident, sql, type SqlBuilder } from '../sql.js';
import { NO_ADDRESS_LITERALS, rawTableName, layerSpec, type ProjectZone } from './layers.js';

export interface TransformContext {
  readonly deptCode: string;
  readonly snapshotId: number;
  readonly cutDate: string;
  /** Capas que de verdad llegaron a `raw`. */
  readonly stagedLayers: ReadonlySet<string>;
  readonly onProgress?: (message: string) => void;
}

export interface LayerOutcome {
  readonly layer: string;
  readonly target: string;
  readonly sourceRows: number;
  readonly insertedRows: number;
  readonly skipped: Record<string, number>;
  readonly ms: number;
}

/** NPN de 30 dígitos: lo que exige `parcel_npn_digits_chk`. */
const NPN_RE = '^[0-9]{30}$';

function rawTable(deptCode: string, layer: string) {
  return ident(`raw.${rawTableName(deptCode, layerSpec(layer))}`);
}

async function tableExists(deptCode: string, layer: string): Promise<boolean> {
  const name = rawTableName(deptCode, layerSpec(layer));
  const rows = await query<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'raw' AND table_name = ${name}
  `);
  return (rows[0]?.n ?? 0) > 0;
}

/** Columnas que la tabla de staging trae de verdad, en minúsculas. */
async function stagedColumns(deptCode: string, layer: string): Promise<Set<string>> {
  const name = rawTableName(deptCode, layerSpec(layer));
  const rows = await query<{ column_name: string }>(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'raw' AND table_name = ${name}
  `);
  return new Set(rows.map((r) => r.column_name.toLowerCase()));
}

/**
 * Referencia a una columna opcional de `raw`.
 *
 * Las 18 capas no comparten esquema (U_BARRIO no tiene `codigo_departamento`, las
 * capas INFORMAL no tienen `tipo_dominio`…), así que una consulta que nombre una
 * columna ausente falla al planificar. Esto devuelve la columna si está y un
 * `NULL` tipado si no, para poder escribir una sola consulta por destino.
 */
function col(present: Set<string>, name: string, sqlType = 'text'): SqlBuilder {
  return present.has(name) ? sql`r.${ident(name)}` : sql`NULL::${ident(sqlType)}`;
}

/** Municipios presentes en una tabla de staging, para trocear el trabajo. */
async function municipalitiesIn(deptCode: string, layer: string): Promise<string[]> {
  const t = rawTable(deptCode, layer);
  const present = await stagedColumns(deptCode, layer);
  // `codigo_municipio` es el campo oficial; si faltara se cae al prefijo del código,
  // que en todas las capas con CODIGO es el DIVIPOLA de 5 dígitos.
  const expr = present.has('codigo_municipio')
    ? sql`COALESCE(NULLIF(btrim(r.codigo_municipio), ''), left(r.codigo, 5))`
    : sql`left(r.codigo, 5)`;
  const rows = await query<{ muni: string | null }>(sql`
    SELECT DISTINCT ${expr} AS muni FROM ${t} r ORDER BY 1
  `);
  return rows.map((r) => r.muni).filter((m): m is string => m !== null && /^\d{5}$/.test(m));
}

// ─── Predios ──────────────────────────────────────────────────────────────────

/**
 * `U_TERRENO` / `R_TERRENO` → `core.parcel`.
 *
 * ## El NPN no es único
 *
 * En Atlántico 431 NPN aparecen repartidos en 1 137 filas, con hasta 33 filas para
 * un mismo NPN, y `parcel_npn_snapshot_uq` es UNIQUE `(dept_code, npn, snapshot_id)`.
 * Las filas del mismo NPN se agrupan en una sola con `ST_Collect`, que es lo
 * correcto y no una componenda: `core.parcel.geom` es `MultiPolygon` justamente
 * porque un predio puede tener varias partes, y `core.clean_polygon` valida y
 * promueve la colección. Se usa `ST_Collect` y no `ST_Union` porque `ST_Collect`
 * es un agregado barato —no calcula intersecciones— y el `ST_MakeValid` que ya
 * hace `core.clean_polygon` resuelve cualquier solape. Sobre 340 MB de Boyacá esa
 * diferencia son minutos.
 *
 * `attrs.partes_en_la_fuente` guarda cuántas filas se fusionaron, para que la
 * fusión sea auditable desde la ficha y no un dato perdido.
 *
 * ## Zona
 *
 * `zone` sale de la capa (`01` urbano / `02` rural), no del NPN: el tramo de zona
 * del NPN vale `00` en todos los predios rurales y `01`–`06` en los urbanos, así
 * que identifica el área urbana concreta, no la clase de suelo. El tramo original
 * se conserva en `attrs.tramo_zona_npn`.
 */
export async function transformParcels(
  ctx: TransformContext,
  layer: 'U_TERRENO' | 'R_TERRENO',
): Promise<LayerOutcome> {
  const started = Date.now();
  const spec = layerSpec(layer);
  const zone: ProjectZone = spec.zone;

  if (!ctx.stagedLayers.has(layer) || !(await tableExists(ctx.deptCode, layer))) {
    return { layer, target: 'core.parcel', sourceRows: 0, insertedRows: 0, skipped: {}, ms: 0 };
  }

  const t = rawTable(ctx.deptCode, layer);
  const present = await stagedColumns(ctx.deptCode, layer);
  // U_TERRENO llama al enlace jerárquico `manzana_codigo`; R_TERRENO, `vereda_codigo`.
  const hierarchyCol = present.has('manzana_codigo')
    ? sql`r.manzana_codigo`
    : present.has('vereda_codigo')
      ? sql`r.vereda_codigo`
      : sql`NULL::text`;
  const hierarchyKey = present.has('manzana_codigo') ? 'manzana_codigo' : 'vereda_codigo';

  const totals = await query<{ total: number; bad_npn: number; no_geom: number }>(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE r.codigo IS NULL OR r.codigo !~ ${NPN_RE})::int AS bad_npn,
           count(*) FILTER (WHERE r.geom IS NULL OR ST_IsEmpty(r.geom))::int AS no_geom
    FROM ${t} r
  `);
  const sourceRows = totals[0]?.total ?? 0;

  const munis = await municipalitiesIn(ctx.deptCode, layer);
  let inserted = 0;

  for (const muni of munis) {
    const n = await execute(sql`
      WITH grouped AS (
        SELECT
          r.codigo::char(30)                                   AS npn,
          min(NULLIF(btrim(r.codigo_anterior), ''))            AS npn_old,
          ST_Collect(r.geom)                                   AS g9377,
          count(*)::int                                        AS parts,
          sum(r.shape_area)::numeric                           AS source_area_m2,
          min(NULLIF(btrim(${hierarchyCol}), ''))              AS hierarchy_code,
          max(${col(present, 'numero_subterraneos', 'int')})    AS basements,
          min(NULLIF(btrim(r.globalid), ''))                   AS source_global_id
        FROM ${t} r
        WHERE r.codigo ~ ${NPN_RE}
          AND r.geom IS NOT NULL AND NOT ST_IsEmpty(r.geom)
          AND left(r.codigo, 5) = ${muni}
        GROUP BY r.codigo
      ),
      cleaned AS (
        SELECT g.*, core.clean_polygon(g.g9377, 4326) AS geom FROM grouped g
      ),
      final AS (
        SELECT c.*, ST_PointOnSurface(c.geom) AS pt FROM cleaned c WHERE c.geom IS NOT NULL
      )
      INSERT INTO core.parcel (
        npn, npn_old, dept_code, muni_code, zone,
        sector, commune, neighborhood, block_or_vereda, terrain,
        condition, building_code, floor_code, unit_code,
        is_ph, matrix_npn,
        area_geom_m2, area_reported_m2, built_area_m2,
        economic_use, address, address_fold, cadastral_value, valuation_year,
        attrs, geom, centroid, h3_r9, h3_r8, snapshot_id, valid_from
      )
      SELECT
        f.npn,
        left(f.npn_old, 20),
        left(f.npn, 2)::char(2),
        left(f.npn, 5)::char(5),
        ${zone}::char(2),
        substring(f.npn FROM  8 FOR 2)::char(2),
        substring(f.npn FROM 10 FOR 2)::char(2),
        substring(f.npn FROM 12 FOR 2)::char(2),
        substring(f.npn FROM 14 FOR 4)::char(4),
        substring(f.npn FROM 18 FOR 4)::char(4),
        substring(f.npn FROM 22 FOR 1)::char(1),
        substring(f.npn FROM 23 FOR 2)::char(2),
        substring(f.npn FROM 25 FOR 2)::char(2),
        substring(f.npn FROM 27 FOR 4)::char(4),
        core.npn_is_ph(f.npn),
        core.npn_matrix(f.npn),
        core.area_m2(f.geom),
        /* area_reported_m2: la base pública NO trae área registral. NO se estima. */
        NULL,
        /* built_area_m2: no hay área construida. Huella x pisos seria una estimacion nuestra. */
        NULL,
        /* economic_use: el destino económico vive en el Registro 1, que no se publica. */
        NULL,
        /* address y address_fold: no hay dirección alfanumérica del predio. */
        NULL, NULL,
        /* cadastral_value y valuation_year: el avalúo vive en el Registro 2 (regla 5). */
        NULL, NULL,
        jsonb_strip_nulls(jsonb_build_object(
          'fuente_capa', ${layer}::text,
          'tramo_zona_npn', substring(f.npn FROM 6 FOR 2),
          ${hierarchyKey}::text, f.hierarchy_code,
          'numero_subterraneos', f.basements,
          'source_global_id', f.source_global_id,
          'area_shape_fuente_m2', round(f.source_area_m2, 2),
          'partes_en_la_fuente', CASE WHEN f.parts > 1 THEN f.parts ELSE NULL END
        )),
        f.geom,
        f.pt,
        h3_lat_lng_to_cell(f.pt, 9),
        h3_lat_lng_to_cell(f.pt, 8),
        ${ctx.snapshotId},
        ${ctx.cutDate}::date
      FROM final f
      ON CONFLICT (dept_code, npn, snapshot_id) DO NOTHING
    `);
    inserted += n;
    ctx.onProgress?.(`${layer} ${muni}: ${inserted} predios`);
  }

  return {
    layer,
    target: 'core.parcel',
    sourceRows,
    insertedRows: inserted,
    skipped: {
      npn_no_es_de_30_digitos: totals[0]?.bad_npn ?? 0,
      sin_geometria: totals[0]?.no_geom ?? 0,
      fusionadas_por_npn_repetido: Math.max(
        0,
        sourceRows - (totals[0]?.bad_npn ?? 0) - (totals[0]?.no_geom ?? 0) - inserted,
      ),
    },
    ms: Date.now() - started,
  };
}

// ─── Construcciones ───────────────────────────────────────────────────────────

/**
 * `U_CONSTRUCCION` / `R_CONSTRUCCION` → `core.building`.
 *
 * `use`, `built_area_m2` y `built_year` quedan NULL: la fuente no los trae.
 * `TIPO_CONSTRUCCION` no es el uso sino el tipo (CONVENCIONAL / NO CONVENCIONAL),
 * así que va a `attrs` y nunca se presenta como uso del inmueble.
 *
 * `floors` sale de `NUMERO_PISOS` pasando el 0 a NULL. En la GDB ese campo es
 * `NOT NULL DEFAULT 0`, de modo que el 0 no significa «un edificio de cero pisos»
 * sino «nadie lo informó»; guardarlo como 0 convertiría un dato ausente en un dato
 * falso. El valor crudo se conserva en `attrs.numero_pisos_fuente`.
 *
 * `TIPO_CONSTRUCCION` y `TIPO_DOMINIO` llegan con dos grafías (CONVENCIONAL y
 * Convencional) y con espacios en blanco como valor: se normalizan a mayúsculas
 * sin espacios, según la nota de la Fase 0.
 */
export async function transformBuildings(
  ctx: TransformContext,
  layer: 'U_CONSTRUCCION' | 'R_CONSTRUCCION',
): Promise<LayerOutcome> {
  const started = Date.now();
  if (!ctx.stagedLayers.has(layer) || !(await tableExists(ctx.deptCode, layer))) {
    return { layer, target: 'core.building', sourceRows: 0, insertedRows: 0, skipped: {}, ms: 0 };
  }

  const t = rawTable(ctx.deptCode, layer);
  const present = await stagedColumns(ctx.deptCode, layer);

  /**
   * `TERRENO_CODIGO` es nullable en R_CONSTRUCCION, y `core.building.parcel_npn`
   * es NOT NULL. Cuando falta se usa `CODIGO`, que la propia fuente documenta como
   * el NPN del predio y es NOT NULL. No es una invención: son dos columnas que
   * contienen el mismo identificador del predio.
   */
  const parcelNpn = sql`COALESCE(NULLIF(btrim(${col(present, 'terreno_codigo')}), ''), NULLIF(btrim(r.codigo), ''))`;

  const totals = await query<{ total: number; bad: number; no_geom: number; zero_floors: number }>(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${parcelNpn} IS NULL OR ${parcelNpn} !~ ${NPN_RE})::int AS bad,
           count(*) FILTER (WHERE r.geom IS NULL OR ST_IsEmpty(r.geom))::int AS no_geom,
           count(*) FILTER (WHERE ${col(present, 'numero_pisos', 'int')} = 0)::int AS zero_floors
    FROM ${t} r
  `);
  const sourceRows = totals[0]?.total ?? 0;

  const munis = await municipalitiesIn(ctx.deptCode, layer);
  let inserted = 0;

  for (const muni of munis) {
    const n = await execute(sql`
      WITH src AS (
        SELECT
          ${parcelNpn}::char(30)                                         AS parcel_npn,
          core.clean_polygon(r.geom, 4326)                               AS geom,
          NULLIF(${col(present, 'numero_pisos', 'int')}, 0)              AS floors,
          ${col(present, 'numero_pisos', 'int')}                         AS floors_raw,
          NULLIF(upper(btrim(${col(present, 'tipo_construccion')})), '') AS tipo_construccion,
          NULLIF(upper(btrim(${col(present, 'tipo_dominio')})), '')      AS tipo_dominio,
          ${col(present, 'numero_sotanos', 'int')}                       AS sotanos,
          ${col(present, 'numero_mezanines', 'int')}                     AS mezanines,
          ${col(present, 'numero_semisotanos', 'int')}                   AS semisotanos,
          NULLIF(btrim(${col(present, 'etiqueta')}), '')                 AS etiqueta,
          NULLIF(btrim(${col(present, 'identificador')}), '')            AS identificador,
          ${col(present, 'codigo_edificacion', 'int')}                   AS codigo_edificacion,
          NULLIF(btrim(${col(present, 'codigo_anterior')}), '')          AS codigo_anterior,
          NULLIF(btrim(r.globalid), '')                                  AS source_global_id,
          r.shape_area::numeric                                          AS source_area_m2
        FROM ${t} r
        WHERE ${parcelNpn} ~ ${NPN_RE}
          AND r.geom IS NOT NULL AND NOT ST_IsEmpty(r.geom)
          AND left(${parcelNpn}, 5) = ${muni}
      )
      INSERT INTO core.building (
        dept_code, parcel_npn, muni_code, building_ref, floors,
        built_area_m2, use, built_year, attrs, geom, snapshot_id
      )
      SELECT
        left(s.parcel_npn, 2)::char(2),
        s.parcel_npn,
        left(s.parcel_npn, 5)::char(5),
        /* Clave natural de la fuente: (CODIGO_EDIFICACION, IDENTIFICADOR). */
        NULLIF(concat_ws('-', s.codigo_edificacion::text, s.identificador), ''),
        CASE WHEN s.floors BETWEEN 1 AND 200 THEN s.floors ELSE NULL END,
        /* built_area_m2: la fuente no trae área construida. */
        NULL,
        /* use: la fuente no trae uso. TIPO_CONSTRUCCION es el tipo, no el uso. */
        NULL,
        /* built_year: la fuente no trae año de construcción. */
        NULL,
        jsonb_strip_nulls(jsonb_build_object(
          'fuente_capa', ${layer}::text,
          'tipo_construccion', s.tipo_construccion,
          'tipo_dominio', s.tipo_dominio,
          'numero_pisos_fuente', s.floors_raw,
          'numero_sotanos', s.sotanos,
          'numero_mezanines', s.mezanines,
          'numero_semisotanos', s.semisotanos,
          'etiqueta', s.etiqueta,
          'identificador_unidad', s.identificador,
          'codigo_edificacion', s.codigo_edificacion,
          'codigo_anterior', s.codigo_anterior,
          'source_global_id', s.source_global_id,
          'area_shape_fuente_m2', round(s.source_area_m2, 2)
        )),
        s.geom,
        ${ctx.snapshotId}
      FROM src s
      WHERE s.geom IS NOT NULL
    `);
    inserted += n;
    ctx.onProgress?.(`${layer} ${muni}: ${inserted} construcciones`);
  }

  return {
    layer,
    target: 'core.building',
    sourceRows,
    insertedRows: inserted,
    skipped: {
      npn_de_predio_invalido: totals[0]?.bad ?? 0,
      sin_geometria: totals[0]?.no_geom ?? 0,
      pisos_en_cero_guardados_como_null: totals[0]?.zero_floors ?? 0,
    },
    ms: Date.now() - started,
  };
}

// ─── Unidades territoriales ───────────────────────────────────────────────────

/**
 * Capas de jerarquía (manzana, barrio, sector, vereda) → su tabla de `core`.
 *
 * Las cuatro tablas tienen la misma forma y una UNIQUE que incluye el código, así
 * que comparten transformación: se agrupa por código con `ST_Collect` por el mismo
 * motivo que en predios (un barrio puede venir en varios polígonos) y se inserta.
 */
export async function transformHierarchy(
  ctx: TransformContext,
  layer: 'U_MANZANA' | 'U_BARRIO' | 'U_SECTOR' | 'R_SECTOR' | 'R_VEREDA',
): Promise<LayerOutcome> {
  const started = Date.now();
  const spec = layerSpec(layer);
  const target =
    layer === 'U_MANZANA'
      ? 'core.block'
      : layer === 'U_BARRIO'
        ? 'core.neighborhood'
        : layer === 'R_VEREDA'
          ? 'core.vereda'
          : 'core.sector';

  if (!ctx.stagedLayers.has(layer) || !(await tableExists(ctx.deptCode, layer))) {
    return { layer, target, sourceRows: 0, insertedRows: 0, skipped: {}, ms: 0 };
  }

  const t = rawTable(ctx.deptCode, layer);
  const present = await stagedColumns(ctx.deptCode, layer);
  const totals = await query<{ total: number }>(sql`SELECT count(*)::int AS total FROM ${t} r`);

  const muniExpr = present.has('codigo_municipio')
    ? sql`COALESCE(NULLIF(btrim(r.codigo_municipio), ''), left(r.codigo, 5))`
    : sql`left(r.codigo, 5)`;

  const base = sql`
    WITH grouped AS (
      SELECT
        NULLIF(btrim(r.codigo), '')                          AS code,
        ${muniExpr}                                          AS muni_code,
        ST_Collect(r.geom)                                   AS g9377,
        min(NULLIF(btrim(${col(present, 'nombre')}), ''))     AS name,
        min(NULLIF(btrim(${col(present, 'sector_codigo')}), '')) AS sector_code,
        min(NULLIF(btrim(${col(present, 'barrio_codigo')}), '')) AS neighborhood_code,
        min(NULLIF(btrim(${col(present, 'codigo_anterior')}), '')) AS code_old,
        count(*)::int                                        AS parts
      FROM ${t} r
      WHERE r.geom IS NOT NULL AND NOT ST_IsEmpty(r.geom)
        AND NULLIF(btrim(r.codigo), '') IS NOT NULL
        AND ${muniExpr} ~ '^[0-9]{5}$'
      GROUP BY 1, 2
    ),
    cleaned AS (
      SELECT g.*, core.clean_polygon(g.g9377, 4326) AS geom FROM grouped g
    )
  `;

  const attrs = sql`jsonb_strip_nulls(jsonb_build_object(
    'fuente_capa', ${layer}::text,
    'sector_codigo', c.sector_code,
    'barrio_codigo', c.neighborhood_code,
    'codigo_anterior', c.code_old,
    'partes_en_la_fuente', CASE WHEN c.parts > 1 THEN c.parts ELSE NULL END
  ))`;

  // Una consulta por destino: los nombres de columna difieren y no hay forma de
  // parametrizarlos sin concatenar SQL, que el proyecto no permite.
  let inserted: number;
  if (target === 'core.block') {
    inserted = await execute(sql`
      ${base}
      INSERT INTO core.block (muni_code, code, attrs, geom, snapshot_id)
      SELECT c.muni_code::char(5), c.code, ${attrs}, c.geom, ${ctx.snapshotId}
      FROM cleaned c WHERE c.geom IS NOT NULL
      ON CONFLICT (muni_code, code, snapshot_id) DO NOTHING
    `);
  } else if (target === 'core.neighborhood') {
    inserted = await execute(sql`
      ${base}
      INSERT INTO core.neighborhood (muni_code, code, name, attrs, geom, snapshot_id)
      SELECT c.muni_code::char(5), c.code, c.name, ${attrs}, c.geom, ${ctx.snapshotId}
      FROM cleaned c WHERE c.geom IS NOT NULL
      ON CONFLICT (muni_code, code, snapshot_id) DO NOTHING
    `);
  } else if (target === 'core.vereda') {
    inserted = await execute(sql`
      ${base}
      INSERT INTO core.vereda (muni_code, code, name, attrs, geom, snapshot_id)
      SELECT c.muni_code::char(5), c.code, c.name, ${attrs}, c.geom, ${ctx.snapshotId}
      FROM cleaned c WHERE c.geom IS NOT NULL
      ON CONFLICT (muni_code, code, snapshot_id) DO NOTHING
    `);
  } else {
    inserted = await execute(sql`
      ${base}
      INSERT INTO core.sector (muni_code, zone, code, name, attrs, geom, snapshot_id)
      SELECT c.muni_code::char(5), ${spec.zone}::char(2), c.code, c.name, ${attrs}, c.geom, ${ctx.snapshotId}
      FROM cleaned c WHERE c.geom IS NOT NULL
      ON CONFLICT (muni_code, zone, code, snapshot_id) DO NOTHING
    `);
  }

  return {
    layer,
    target,
    sourceRows: totals[0]?.total ?? 0,
    insertedRows: inserted,
    skipped: {},
    ms: Date.now() - started,
  };
}

/**
 * `U_PERIMETRO` → `core.urban_perimeter`.
 *
 * `muni_code` sale de `codigo_municipio` y no de `MUNICIPIO_CODIGO`: la Fase 0
 * observó que este último no siempre trae 5 dígitos (aparecen «08078» y «137» en
 * la misma capa). `TIPO_AVALUO` y `CODIGO_NOMBRE` se usan de forma inconsistente
 * en la fuente, así que se guardan crudos en `attrs` sin interpretarlos.
 */
export async function transformUrbanPerimeter(ctx: TransformContext): Promise<LayerOutcome> {
  const started = Date.now();
  const layer = 'U_PERIMETRO';
  if (!ctx.stagedLayers.has(layer) || !(await tableExists(ctx.deptCode, layer))) {
    return { layer, target: 'core.urban_perimeter', sourceRows: 0, insertedRows: 0, skipped: {}, ms: 0 };
  }
  const t = rawTable(ctx.deptCode, layer);
  const present = await stagedColumns(ctx.deptCode, layer);
  const totals = await query<{ total: number }>(sql`SELECT count(*)::int AS total FROM ${t} r`);

  const inserted = await execute(sql`
    WITH src AS (
      SELECT
        NULLIF(btrim(r.codigo_municipio), '')                         AS muni_code,
        core.clean_polygon(r.geom, 4326)                              AS geom,
        NULLIF(btrim(${col(present, 'nombre_geografico')}), '')        AS name,
        NULLIF(btrim(${col(present, 'tipo_avaluo')}), '')              AS tipo_avaluo,
        NULLIF(btrim(${col(present, 'codigo_nombre')}), '')            AS codigo_nombre,
        NULLIF(btrim(${col(present, 'municipio_codigo')}), '')         AS municipio_codigo_fuente,
        NULLIF(btrim(r.globalid), '')                                  AS source_global_id
      FROM ${t} r
      WHERE r.geom IS NOT NULL AND NOT ST_IsEmpty(r.geom)
        AND NULLIF(btrim(r.codigo_municipio), '') ~ '^[0-9]{5}$'
    )
    INSERT INTO core.urban_perimeter (muni_code, name, attrs, geom, snapshot_id)
    SELECT
      s.muni_code::char(5),
      s.name,
      jsonb_strip_nulls(jsonb_build_object(
        'fuente_capa', ${layer}::text,
        'tipo_avaluo', s.tipo_avaluo,
        'categoria', s.codigo_nombre,
        'municipio_codigo_fuente', s.municipio_codigo_fuente,
        'source_global_id', s.source_global_id,
        'aviso_campos_inconsistentes',
          'TIPO_AVALUO y CODIGO_NOMBRE se usan de forma inconsistente en la fuente: se guardan sin interpretar.'
      )),
      s.geom,
      ${ctx.snapshotId}
    FROM src s WHERE s.geom IS NOT NULL
  `);

  return {
    layer,
    target: 'core.urban_perimeter',
    sourceRows: totals[0]?.total ?? 0,
    insertedRows: inserted,
    skipped: {},
    ms: Date.now() - started,
  };
}

// ─── Nomenclatura ─────────────────────────────────────────────────────────────

/** `U_/R_NOMENCLATURA_VIAL` → `core.street_name`. */
export async function transformStreetNames(
  ctx: TransformContext,
  layer: 'U_NOMENCLATURA_VIAL' | 'R_NOMENCLATURA_VIAL',
): Promise<LayerOutcome> {
  const started = Date.now();
  if (!ctx.stagedLayers.has(layer) || !(await tableExists(ctx.deptCode, layer))) {
    return { layer, target: 'core.street_name', sourceRows: 0, insertedRows: 0, skipped: {}, ms: 0 };
  }
  const t = rawTable(ctx.deptCode, layer);
  const totals = await query<{ total: number }>(sql`SELECT count(*)::int AS total FROM ${t} r`);

  const inserted = await execute(sql`
    WITH src AS (
      SELECT
        NULLIF(btrim(r.texto), '')                     AS name,
        NULLIF(btrim(r.codigo_municipio), '')          AS muni_code,
        ST_Multi(ST_Transform(ST_MakeValid(r.geom), 4326)) AS geom,
        NULLIF(btrim(r.globalid), '')                  AS source_global_id
      FROM ${t} r
      WHERE r.geom IS NOT NULL AND NOT ST_IsEmpty(r.geom)
        AND NULLIF(btrim(r.texto), '') IS NOT NULL
        AND NULLIF(btrim(r.codigo_municipio), '') ~ '^[0-9]{5}$'
    )
    INSERT INTO core.street_name (muni_code, name, name_fold, attrs, geom, snapshot_id)
    SELECT
      s.muni_code::char(5),
      s.name,
      public.tc_fold(s.name),
      jsonb_build_object('fuente_capa', ${layer}::text, 'source_global_id', s.source_global_id),
      s.geom,
      ${ctx.snapshotId}
    FROM src s
    WHERE s.geom IS NOT NULL AND ST_GeometryType(s.geom) = 'ST_MultiLineString'
  `);

  return {
    layer,
    target: 'core.street_name',
    sourceRows: totals[0]?.total ?? 0,
    insertedRows: inserted,
    skipped: {},
    ms: Date.now() - started,
  };
}

/**
 * `U_/R_NOMENCLATURA_DOMICILIARIA` → `core.address_point`.
 *
 * ## Solo entra lo que de verdad es una dirección
 *
 * La capa mezcla direcciones con topónimos y con el literal «NS». En Atlántico, de
 * 73 215 registros urbanos, 14 125 dicen «NS» y solo 18 contienen «Calle» o
 * «Carrera»; el resto son nombres de lote («PARCELA L-1 DIVISION 1», «ZONA DE
 * CESION No.1»). La validación `address-usefulness` del catálogo ya decidió qué
 * hacer con eso: si menos del 30 % es una dirección reconocible, la capa **no
 * alimenta el geocodificador**. Aquí se aplica fila a fila —entra lo que encaja
 * con un tipo de vía seguido de número y se descarta el resto— en vez de aceptar
 * o rechazar la capa entera, que dejaría fuera las direcciones buenas que sí hay.
 *
 * `core.parcel.address` sigue en NULL en cualquier caso: una etiqueta de
 * nomenclatura para el 0,02 % de los predios no es la dirección del predio.
 *
 * ## El punto es derivado
 *
 * La geometría de origen es la **línea de rotulación**, no un punto de dirección,
 * y `core.address_point.geom` es `Point NOT NULL`. Se toma el punto medio de la
 * línea. Es una reducción geométrica del dato de origen, no un atributo inventado,
 * pero sigue siendo derivada: queda marcada en `attrs.geometria_derivada` para que
 * nadie la confunda con un punto levantado en campo.
 */
export async function transformAddressPoints(
  ctx: TransformContext,
  layer: 'U_NOMENCLATURA_DOMICILIARIA' | 'R_NOMENCLATURA_DOMICILIARIA',
): Promise<LayerOutcome & { usefulnessPct: number }> {
  const started = Date.now();
  const empty = {
    layer,
    target: 'core.address_point',
    sourceRows: 0,
    insertedRows: 0,
    skipped: {},
    ms: 0,
    usefulnessPct: 0,
  };
  if (!ctx.stagedLayers.has(layer) || !(await tableExists(ctx.deptCode, layer))) return empty;

  const t = rawTable(ctx.deptCode, layer);
  const streetRe = String.raw`(^|[^a-zA-Z])(calle|carrera|avenida|diagonal|transversal|circular|circunvalar|autopista|via|kilometro|km|cl|cr|kr|ac|ak|dg|tv|tr|av)[[:space:].]*[0-9]`;

  const totals = await query<{ total: number; usable: number; no_address: number }>(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE btrim(r.texto) ~* ${streetRe}::text)::int AS usable,
           count(*) FILTER (WHERE upper(btrim(r.texto)) = ANY(${[...NO_ADDRESS_LITERALS]}::text[]))::int AS no_address
    FROM ${t} r
  `);
  const sourceRows = totals[0]?.total ?? 0;
  const usable = totals[0]?.usable ?? 0;
  const usefulnessPct = sourceRows > 0 ? (usable / sourceRows) * 100 : 0;

  const inserted = await execute(sql`
    WITH src AS (
      SELECT
        btrim(r.texto)                                  AS label,
        NULLIF(btrim(r.codigo_municipio), '')           AS muni_code,
        NULLIF(btrim(r.terreno_codigo), '')             AS parcel_npn,
        ST_Transform(ST_MakeValid(r.geom), 4326)        AS line
      FROM ${t} r
      WHERE r.geom IS NOT NULL AND NOT ST_IsEmpty(r.geom)
        AND btrim(r.texto) ~* ${streetRe}::text
        AND NULLIF(btrim(r.codigo_municipio), '') ~ '^[0-9]{5}$'
    ),
    pts AS (
      SELECT
        s.label, s.muni_code, s.parcel_npn,
        /* Punto medio de la línea de rotulación: el origen es una línea, no un punto. */
        ST_LineInterpolatePoint(ST_GeometryN(ST_LineMerge(s.line), 1), 0.5) AS pt
      FROM src s
      WHERE ST_LineMerge(s.line) IS NOT NULL
    )
    INSERT INTO core.address_point (muni_code, label, label_fold, parcel_npn, geom, snapshot_id)
    SELECT
      p.muni_code::char(5),
      p.label,
      public.tc_fold(p.label),
      CASE WHEN p.parcel_npn ~ ${NPN_RE} THEN p.parcel_npn::char(30) ELSE NULL END,
      p.pt,
      ${ctx.snapshotId}
    FROM pts p
    WHERE p.pt IS NOT NULL AND ST_GeometryType(p.pt) = 'ST_Point'
  `);

  return {
    layer,
    target: 'core.address_point',
    sourceRows,
    insertedRows: inserted,
    skipped: {
      sin_nomenclatura_literal: totals[0]?.no_address ?? 0,
      no_es_una_direccion_reconocible: sourceRows - usable,
    },
    ms: Date.now() - started,
    usefulnessPct,
  };
}

// ─── Limpieza previa ──────────────────────────────────────────────────────────

/**
 * Borra lo que este corte hubiera escrito antes, para que volver a lanzar el
 * cargador sea seguro.
 *
 * Solo borra por `snapshot_id`: los cortes anteriores del mismo departamento se
 * quedan, porque son lo que compara M8 (cambio territorial) para detectar predios
 * nuevos y englobes.
 */
export async function clearSnapshotRows(deptCode: string, snapshotId: number): Promise<void> {
  await execute(sql`DELETE FROM core.building WHERE dept_code = ${deptCode} AND snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.parcel WHERE dept_code = ${deptCode} AND snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.address_point WHERE snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.street_name WHERE snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.urban_perimeter WHERE snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.block WHERE snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.neighborhood WHERE snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.vereda WHERE snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM core.sector WHERE snapshot_id = ${snapshotId}`);
}
