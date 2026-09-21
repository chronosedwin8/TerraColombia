/**
 * Constructor de SQL parametrizado.
 *
 * Regla del proyecto (CLAUDE.md, ADR-007): no existe ruta de concatenación de cadenas a SQL.
 * Todo valor viaja como `$n`. Los identificadores solo pueden venir de listas blancas
 * declaradas en el código, nunca del cliente.
 */

export interface SqlQuery {
  text: string;
  values: unknown[];
}

const RAW = Symbol('sql.raw');
const IDENT = Symbol('sql.identifier');

interface RawFragment {
  [RAW]: true;
  value: string;
}
interface IdentFragment {
  [IDENT]: true;
  value: string;
}

export type SqlFragment = SqlBuilder | RawFragment | IdentFragment;

function isRaw(v: unknown): v is RawFragment {
  return typeof v === 'object' && v !== null && RAW in v;
}
function isIdent(v: unknown): v is IdentFragment {
  return typeof v === 'object' && v !== null && IDENT in v;
}
function isBuilder(v: unknown): v is SqlBuilder {
  return v instanceof SqlBuilder;
}

/**
 * Fragmento literal de SQL. **No uses esto con datos del cliente.** Existe para armar
 * cláusulas fijas (por ejemplo `ORDER BY area_geom_m2 DESC`) ya validadas contra una lista blanca.
 */
export function raw(value: string): RawFragment {
  return { [RAW]: true, value };
}

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Identificador citado. Solo acepta minúsculas, dígitos y guion bajo, y opcionalmente
 * un esquema: `core.parcel`. Cualquier otra cosa lanza. Nunca pases entrada del usuario
 * sin haberla contrastado antes con una lista blanca.
 */
export function ident(value: string): IdentFragment {
  const parts = value.split('.');
  if (parts.length > 2) throw new Error(`Identificador inválido: ${value}`);
  for (const p of parts) {
    if (!SAFE_IDENT.test(p)) throw new Error(`Identificador inválido: ${value}`);
  }
  return { [IDENT]: true, value: parts.map((p) => `"${p}"`).join('.') };
}

class SqlBuilder {
  constructor(
    private readonly strings: readonly string[],
    private readonly params: readonly unknown[],
  ) {}

  build(startIndex = 1): SqlQuery {
    const values: unknown[] = [];
    let text = '';
    let index = startIndex;

    const consume = (strs: readonly string[], prms: readonly unknown[]) => {
      for (let i = 0; i < strs.length; i++) {
        text += strs[i] ?? '';
        if (i >= prms.length) continue;
        const p = prms[i];
        if (isRaw(p)) {
          text += p.value;
        } else if (isIdent(p)) {
          text += p.value;
        } else if (isBuilder(p)) {
          const nested = p.build(index);
          text += nested.text;
          values.push(...nested.values);
          index += nested.values.length;
        } else {
          text += `$${index}`;
          values.push(p);
          index += 1;
        }
      }
    };

    consume(this.strings, this.params);
    return { text, values };
  }

  get text(): string {
    return this.build().text;
  }

  get values(): unknown[] {
    return this.build().values;
  }
}

/**
 * Plantilla etiquetada. Los valores interpolados se convierten en `$n` salvo que sean
 * fragmentos `raw`, `ident` o anidados `sql`.
 *
 * ```ts
 * const q = sql`SELECT * FROM core.parcel WHERE npn = ${npn} AND muni_code = ${muni}`;
 * await pool.query(q.text, q.values);
 * ```
 */
export function sql(strings: TemplateStringsArray, ...params: unknown[]): SqlBuilder {
  return new SqlBuilder(strings.raw, params);
}

/** Une fragmentos con un separador literal. Ignora los vacíos. */
export function join(fragments: SqlFragment[], separator = ' AND '): SqlBuilder {
  const parts = fragments.filter(Boolean);
  if (parts.length === 0) return sql`TRUE`;
  let out = sql`${parts[0]!}`;
  for (let i = 1; i < parts.length; i++) {
    out = sql`${out}${raw(separator)}${parts[i]!}`;
  }
  return out;
}

/** `WHERE` que desaparece si no hay condiciones. */
export function where(conditions: SqlFragment[]): SqlBuilder {
  const parts = conditions.filter(Boolean);
  if (parts.length === 0) return sql``;
  return sql`WHERE ${join(parts, ' AND ')}`;
}

/** Lista de valores para `IN (...)`. Lanza si está vacía, para no generar `IN ()`. */
export function values(list: readonly unknown[]): SqlBuilder {
  if (list.length === 0) throw new Error('Lista de valores vacía: revisa el filtro antes de construir el IN');
  let out = sql`${list[0]}`;
  for (let i = 1; i < list.length; i++) out = sql`${out}, ${list[i]}`;
  return out;
}

/**
 * Traduce un rango numérico del DSL a condiciones. La columna debe venir de una lista
 * blanca del llamador, nunca del cliente.
 */
export function numericRange(
  column: IdentFragment | RawFragment,
  range: { eq?: number; gte?: number; lte?: number; gt?: number; lt?: number },
): SqlBuilder[] {
  const out: SqlBuilder[] = [];
  if (range.eq !== undefined) out.push(sql`${column} = ${range.eq}`);
  if (range.gte !== undefined) out.push(sql`${column} >= ${range.gte}`);
  if (range.lte !== undefined) out.push(sql`${column} <= ${range.lte}`);
  if (range.gt !== undefined) out.push(sql`${column} > ${range.gt}`);
  if (range.lt !== undefined) out.push(sql`${column} < ${range.lt}`);
  return out;
}

/** Geometría GeoJSON como parámetro. La validación de forma ocurre antes, con Zod. */
export function geoJson(geometry: unknown, srid = 4326): SqlBuilder {
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), ${srid})`;
}

/** Punto a partir de lng/lat. */
export function point(lng: number, lat: number, srid = 4326): SqlBuilder {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), ${srid})`;
}

/** Círculo geodésico exacto: buffer en EPSG:9377 y vuelta a 4326. */
export function circle(lng: number, lat: number, radiusM: number): SqlBuilder {
  return sql`ST_Transform(ST_Buffer(ST_Transform(${point(lng, lat)}, 9377), ${radiusM}), 4326)`;
}

/** Envolvente a partir de un bbox. */
export function bboxEnvelope(bbox: readonly [number, number, number, number]): SqlBuilder {
  return sql`ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326)`;
}

export type { SqlBuilder };
