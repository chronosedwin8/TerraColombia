/**
 * Validaciones del corte catastral y barrido de datos personales.
 *
 * Las de severidad `error` bloquean la publicación: `meta.publish_snapshot` se
 * niega a activar un corte que tenga alguna. Se reserva ese nivel para lo que
 * haría daño si llegara al usuario —geometrías fuera de Colombia, filas en la
 * partición por defecto, una columna de dato personal— y no para la pobreza de la
 * fuente, que es un hecho que hay que contar, no un fallo que haya que ocultar.
 */

import { classifyPiiColumn, detectPiiContent } from '@terracolombia/etl-config';
import { execute, query } from '../pool.js';
import { ident, sql } from '../sql.js';
import { recordPiiDiscard, recordValidation } from '../repositories/meta.js';
import { CADASTRE_LAYERS, rawTableName } from './layers.js';
import type { InspectedLayer } from './stage.js';

/**
 * Borra el diagnóstico anterior de este corte.
 *
 * Hay que llamarlo al principio de cada corrida. `createSnapshot` reutiliza el
 * corte cuando coinciden dataset y fecha, así que relanzar el cargador escribe
 * sobre el mismo `snapshot_id`; sin este borrado las validaciones se acumulan y
 * —lo que de verdad muerde— un `error` de un intento anterior sigue ahí y
 * `meta.publish_snapshot` se niega a publicar un corte que ya está bien. Pasó:
 * un `pii_detected` de una corrida fallida impedía publicar la siguiente, ya
 * correcta.
 */
export async function clearSnapshotDiagnostics(snapshotId: number): Promise<void> {
  await execute(sql`DELETE FROM meta.validation WHERE snapshot_id = ${snapshotId}`);
  await execute(sql`DELETE FROM meta.pii_discard_log WHERE snapshot_id = ${snapshotId}`);
}

export interface PiiSweepResult {
  readonly columnsChecked: number;
  readonly layersChecked: number;
  readonly offendingColumns: { layer: string; column: string; ruleId: string; reason: string }[];
  readonly contentHits: { layer: string; column: string; patternId: string; reason: string }[];
  readonly exemptions: { layer: string; column: string; evidence: string }[];
  /** Columnas de auditoría: son dato personal, se descartan, pero no bloquean. */
  readonly operationalColumns: { layer: string; column: string; reason: string }[];
}

/**
 * Columnas que SÍ son dato personal, se descartan siempre, pero NO impiden publicar.
 *
 * La diferencia con `offendingColumns` no es si el dato es personal —lo es en ambos casos—
 * sino a quién identifica y qué vínculo crea:
 *
 *  · Una columna de titularidad (propietario, poseedor, documento) identifica al SUJETO del
 *    registro y crea justo la ruta predio → persona que el proyecto promete que no existirá.
 *    Si aparece una, el corte no se publica hasta que alguien lo mire. Eso es la regla 3.
 *  · `USUARIO_LOG` identifica a quien EDITÓ el registro en el sistema del IGAC: un
 *    funcionario. Es dato personal y se descarta igual, pero no vincula a nadie con un
 *    predio, así que detener la publicación nacional por ella no protege a nadie y sí deja
 *    el producto sin datos.
 *
 * Aparece en las 26 capas de las geodatabases de varios departamentos. Ninguna llega a
 * `core`: el transformador copia una lista cerrada de columnas y esta no está en ella. El
 * descarte queda registrado en `meta.pii_discard_log` con el nombre de la columna, nunca con
 * su contenido, y el contenido sigue pasando por la heurística: si un `USUARIO_LOG` trajera
 * algo peor que un nombre de usuario, se detecta por ahí.
 */
const PII_OPERATIONAL_COLUMNS: readonly { column: string; reason: string }[] = [
  {
    column: 'usuario_log',
    reason:
      'Usuario que editó el registro en el sistema del IGAC. Identifica a un funcionario, ' +
      'no al titular del predio: se descarta, pero no crea la ruta predio → persona.',
  },
];

/** ¿La columna es de auditoría operativa? Se compara ya normalizada. */
function operationalColumnFor(column: string) {
  const normalizado = column
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return PII_OPERATIONAL_COLUMNS.find((c) => c.column === normalizado);
}

/**
 * Columnas de la GDB catastral que la lista negra global marca y que aquí, en esta
 * fuente concreta, son nombres de cosas y no de personas.
 *
 * ## Por qué existe esta lista en vez de tocar la lista negra
 *
 * `classifyPiiColumn` pone la coincidencia exacta por encima de la allowlist a
 * propósito: una columna llamada `NOMBRE` a secas, en una fuente cualquiera, es un
 * candidato serio a nombre de persona y el criterio del proyecto es descartar ante
 * la duda. Quitar `nombre` de `PII_EXACT_COLUMNS` para que el catastro cargue
 * bajaría la defensa de **todas** las fuentes, presentes y futuras, para resolver
 * un problema de tres columnas. Eso es exactamente el falso negativo que la regla 3
 * quiere evitar.
 *
 * La excepción se declara aquí, acotada a la pareja (capa, columna) exacta, con la
 * evidencia de qué se observó en el dato real, y cada uso se registra en
 * `meta.validation` para que la exención quede auditada y no sea una decisión
 * silenciosa. Los valores siguen pasando por la heurística de **contenido**: si en
 * algún departamento un `NOMBRE` de vereda trajera un nombre propio de persona, se
 * detecta igual y se descarta la columna.
 *
 * Evidencia recogida el 2026-09-21 con `ogrinfo -dialect SQLITE` sobre
 * `08_ATLANTICO/08.gdb`.
 */
const PII_LAYER_EXEMPTIONS: readonly { layer: string; column: string; evidence: string }[] = [
  {
    layer: 'R_VEREDA',
    column: 'NOMBRE',
    evidence:
      'Nombre de la vereda (topónimo). Valores observados en Atlántico: «SN», «_», «086060001», «086060002». Ni uno es un nombre de persona.',
  },
  {
    layer: 'U_BARRIO',
    column: 'NOMBRE',
    evidence:
      'Nombre del barrio (topónimo). Valores observados: «BOHORQUEZ», «CAMPO DE LA CRUZ», «ALGODONAL», «SANTA LUCIA», «SIN NOMBRE», «Barrio 0».',
  },
  {
    layer: 'U_PERIMETRO',
    column: 'CODIGO_NOMBRE',
    evidence:
      'Categoría del dominio domAdministrativo. Valores observados: «Cabecera Municipal», «Corregimiento», «Área Metropolitana», «Baranoa», «08606».',
  },
];

function exemptionFor(layer: string, column: string) {
  return PII_LAYER_EXEMPTIONS.find(
    (e) => e.layer === layer && e.column.toLowerCase() === column.toLowerCase(),
  );
}

/**
 * Barre **todas** las capas de la GDB buscando datos personales, antes de cargar
 * nada.
 *
 * Dos defensas, en este orden:
 *
 *  1. Por nombre de columna, con la lista negra del proyecto. Es la principal.
 *  2. Por contenido, sobre una muestra de cada columna de texto. Existe para las
 *     columnas de nombre opaco: una columna llamada `ETIQUETA` o `TEXTO` no
 *     levanta sospechas por su nombre, pero podría traer el nombre de una persona.
 *
 * Se barren las 18 capas, incluidas las que no se cargan: si una capa informal
 * trajera un propietario, hay que saberlo igual, porque la siguiente versión del
 * cargador podría decidir cargarla.
 */
export async function sweepPii(
  deptCode: string,
  datasetId: string,
  snapshotId: number,
  inspected: readonly InspectedLayer[],
): Promise<PiiSweepResult> {
  const offendingColumns: PiiSweepResult['offendingColumns'] = [];
  const contentHits: PiiSweepResult['contentHits'] = [];
  const exemptions: PiiSweepResult['exemptions'] = [];
  const operationalColumns: PiiSweepResult['operationalColumns'] = [];
  let columnsChecked = 0;

  for (const layer of inspected) {
    for (const column of layer.columns) {
      columnsChecked++;
      const verdict = classifyPiiColumn(column);
      if (!verdict.pii) continue;

      const exempt = exemptionFor(layer.layer, column);
      if (exempt) {
        exemptions.push(exempt);
        continue;
      }
      // Dato personal de auditoría: se descarta y se registra, pero no bloquea.
      const operacional = operationalColumnFor(column);
      if (operacional) {
        operationalColumns.push({ layer: layer.layer, column, reason: operacional.reason });
        continue;
      }
      offendingColumns.push({
        layer: layer.layer,
        column,
        ruleId: verdict.ruleId,
        reason: verdict.reason,
      });
    }
  }

  // Defensa por contenido: se mira una muestra de las columnas de texto ya
  // cargadas en `raw`. Se hace sobre `raw` y no sobre la GDB porque ahí ya se
  // puede muestrear con SQL, y se hace ANTES de escribir en `core`.
  for (const spec of CADASTRE_LAYERS) {
    const table = rawTableName(deptCode, spec);
    const exists = await query<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'raw' AND table_name = ${table}
    `);
    if ((exists[0]?.n ?? 0) === 0) continue;

    const textCols = await query<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'raw' AND table_name = ${table}
        AND data_type IN ('character varying', 'text', 'character')
    `);

    for (const { column_name } of textCols) {
      const sample = await query<{ v: string | null }>(sql`
        SELECT DISTINCT ${ident(column_name)}::text AS v
        FROM ${ident(`raw.${table}`)}
        WHERE ${ident(column_name)} IS NOT NULL
        LIMIT 200
      `);
      for (const row of sample) {
        const hit = detectPiiContent(row.v, column_name);
        if (hit) {
          contentHits.push({
            layer: spec.layer,
            column: column_name,
            patternId: hit.patternId,
            reason: hit.reason,
          });
          break; // Un acierto por columna basta: se descarta la columna entera.
        }
      }
    }
  }

  for (const o of offendingColumns) {
    await recordPiiDiscard({
      snapshotId,
      datasetId,
      sourceLayer: o.layer,
      columnName: o.column,
      reason: o.ruleId === 'exact' ? 'blocklist_exact' : 'blocklist_pattern',
      occurrences: 0,
    });
  }
  for (const o of operationalColumns) {
    await recordPiiDiscard({
      snapshotId,
      datasetId,
      sourceLayer: o.layer,
      columnName: o.column,
      reason: 'operational_audit',
      occurrences: 0,
    });
  }
  for (const h of contentHits) {
    await recordPiiDiscard({
      snapshotId,
      datasetId,
      sourceLayer: h.layer,
      columnName: h.column,
      reason: 'content_heuristic',
      occurrences: 0,
    });
  }

  await recordValidation({
    snapshotId,
    checkName: 'pii_detected',
    // `error` a propósito: si aparece una columna de titularidad, el corte no se
    // publica hasta que alguien decida qué hacer con ella. Es la regla 3 y no
    // admite un «ya lo vemos luego».
    severity: offendingColumns.length > 0 ? 'error' : 'info',
    passed: offendingColumns.length === 0,
    affectedRows: offendingColumns.length,
    message:
      offendingColumns.length === 0
        ? `Sin datos personales: ${columnsChecked} columnas de ${inspected.length} capas revisadas por nombre, ` +
          `y el contenido muestreado en las columnas de texto. ` +
          (contentHits.length > 0
            ? `${contentHits.length} columna(s) marcadas por contenido y descartadas de core.`
            : 'Ninguna columna marcada por contenido.')
        : `Se encontraron ${offendingColumns.length} columna(s) con posible dato personal: ` +
          `${offendingColumns.map((o) => `${o.layer}.${o.column}`).join(', ')}. ` +
          'El corte NO se publica (regla 3 de CLAUDE.md).',
    sample: [...offendingColumns, ...contentHits].slice(0, 30),
  });

  // La exención queda registrada aparte, con su evidencia: que una columna llamada
  // `NOMBRE` haya pasado el filtro tiene que ser una decisión visible en el linaje
  // del corte, no algo que solo sepa el código.
  if (exemptions.length > 0) {
    await recordValidation({
      snapshotId,
      checkName: 'pii_detected',
      severity: 'info',
      passed: true,
      affectedRows: exemptions.length,
      message:
        `${exemptions.length} columna(s) que la lista negra marca por nombre se admitieron porque en ` +
        'esta fuente son topónimos o categorías de dominio, verificado sobre el dato real. ' +
        'Siguen sometidas a la heurística de contenido.',
      sample: exemptions.map((e) => ({
        capa: e.layer,
        columna: e.column,
        evidencia: e.evidence,
      })),
    });
  }

  // El descarte de auditoría también se deja escrito en el linaje: que una columna con
  // dato personal se haya tirado tiene que poder verse, no solo saberlo el código.
  if (operationalColumns.length > 0) {
    await recordValidation({
      snapshotId,
      checkName: 'pii_detected',
      severity: 'info',
      passed: true,
      affectedRows: operationalColumns.length,
      message:
        `${operationalColumns.length} columna(s) de auditoría con dato personal se descartaron ` +
        'sin bloquear la publicación: identifican a quien editó el registro, no al titular del ' +
        'predio, así que no crean la ruta predio → persona. Ninguna llega a core.',
      sample: operationalColumns.slice(0, 30).map((o) => ({
        capa: o.layer,
        columna: o.column,
        motivo: o.reason,
      })),
    });
  }

  return {
    columnsChecked,
    layersChecked: inspected.length,
    offendingColumns,
    contentHits,
    exemptions,
    operationalColumns,
  };
}

export interface GeometryValidationResult {
  readonly parcels: number;
  readonly inDefaultPartition: number;
  readonly outsideColombia: number;
  readonly invalidGeometry: number;
  readonly zeroArea: number;
  readonly crossDepartment: number;
  readonly unknownMunicipality: string[];
}

/**
 * Comprueba lo que podría haber salido mal sin que nada fallara.
 *
 * El caso que más importa es la partición por defecto: `core.parcel` está
 * particionada por `dept_code` y existe una partición DEFAULT que se traga
 * cualquier código imprevisto. Una fila ahí no rompe nada visible —se inserta, se
 * consulta— pero deja de podarse por partición y, sobre todo, significa que el
 * código de departamento no es el que creíamos.
 */
export async function validateGeometry(
  deptCode: string,
  snapshotId: number,
): Promise<GeometryValidationResult> {
  const counts = await query<{
    parcels: number;
    outside: number;
    invalid: number;
    zero_area: number;
    cross: number;
  }>(sql`
    SELECT
      count(*)::int AS parcels,
      count(*) FILTER (
        WHERE geom IS NOT NULL
          AND NOT ST_Intersects(centroid, ST_MakeEnvelope(-82.0, -4.5, -66.5, 13.6, 4326))
      )::int AS outside,
      count(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))::int AS invalid,
      count(*) FILTER (WHERE area_geom_m2 IS NULL OR area_geom_m2 <= 0)::int AS zero_area,
      count(*) FILTER (WHERE dept_code <> ${deptCode})::int AS cross
    FROM core.parcel
    WHERE snapshot_id = ${snapshotId}
  `);

  // Se consulta la partición DEFAULT directamente: por definición contiene lo que
  // no encaja en ninguna lista, así que preguntarle a la tabla padre no serviría.
  const def = await query<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM core.parcel_default WHERE snapshot_id = ${snapshotId}
  `);
  const defBuildings = await query<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM core.building_default WHERE snapshot_id = ${snapshotId}
  `);

  const unknownMuni = await query<{ muni_code: string }>(sql`
    SELECT DISTINCT p.muni_code
    FROM core.parcel p
    WHERE p.snapshot_id = ${snapshotId}
      AND NOT EXISTS (SELECT 1 FROM core.municipality m WHERE m.code = p.muni_code)
    ORDER BY 1
  `);

  const c = counts[0];
  const inDefault = (def[0]?.n ?? 0) + (defBuildings[0]?.n ?? 0);

  await recordValidation({
    snapshotId,
    checkName: 'partition_default',
    severity: inDefault > 0 ? 'error' : 'info',
    passed: inDefault === 0,
    affectedRows: inDefault,
    message:
      inDefault === 0
        ? `Ninguna fila cayó en core.parcel_default ni en core.building_default: el departamento ${deptCode} entró en su partición.`
        : `${inDefault} fila(s) cayeron en la partición por defecto: el código de departamento no es el previsto.`,
  });

  await recordValidation({
    snapshotId,
    checkName: 'outside_colombia',
    severity: (c?.outside ?? 0) > 0 ? 'error' : 'info',
    passed: (c?.outside ?? 0) === 0,
    affectedRows: c?.outside ?? 0,
    message:
      (c?.outside ?? 0) === 0
        ? 'Todos los centroides caen dentro de la extensión de Colombia.'
        : `${c?.outside} predios fuera de Colombia: revisa la reproyección de EPSG:9377 a 4326 antes de publicar.`,
  });

  await recordValidation({
    snapshotId,
    checkName: 'invalid_geometry',
    severity: (c?.invalid ?? 0) > 0 ? 'warning' : 'info',
    passed: (c?.invalid ?? 0) === 0,
    affectedRows: c?.invalid ?? 0,
    message: `${c?.invalid ?? 0} predios con geometría inválida tras core.clean_polygon().`,
  });

  await recordValidation({
    snapshotId,
    checkName: 'zero_area',
    severity: (c?.zero_area ?? 0) > 0 ? 'warning' : 'info',
    passed: (c?.zero_area ?? 0) === 0,
    affectedRows: c?.zero_area ?? 0,
    message: `${c?.zero_area ?? 0} predios con área nula o cero en EPSG:9377.`,
  });

  await recordValidation({
    snapshotId,
    checkName: 'npn_muni_exists',
    severity: unknownMuni.length > 0 ? 'warning' : 'info',
    passed: unknownMuni.length === 0,
    affectedRows: unknownMuni.length,
    message:
      unknownMuni.length === 0
        ? 'Todos los municipios de los NPN existen en la DIVIPOLA del DANE.'
        : `Códigos de municipio que no están en la DIVIPOLA: ${unknownMuni.map((u) => u.muni_code.trim()).join(', ')}.`,
    sample: unknownMuni.map((u) => u.muni_code.trim()),
  });

  if ((c?.cross ?? 0) > 0) {
    await recordValidation({
      snapshotId,
      checkName: 'srid_mismatch',
      severity: 'warning',
      passed: false,
      affectedRows: c?.cross ?? 0,
      message:
        `${c?.cross} predios de este corte tienen un dept_code distinto de ${deptCode}: ` +
        'la GDB del departamento trae predios de otro. Están en la partición que les corresponde.',
    });
  }

  return {
    parcels: c?.parcels ?? 0,
    inDefaultPartition: inDefault,
    outsideColombia: c?.outside ?? 0,
    invalidGeometry: c?.invalid ?? 0,
    zeroArea: c?.zero_area ?? 0,
    crossDepartment: c?.cross ?? 0,
    unknownMunicipality: unknownMuni.map((u) => u.muni_code.trim()),
  };
}

/**
 * Registra qué campos quedaron vacíos porque la fuente no los trae.
 *
 * No es un aviso de fallo: es el cumplimiento de la regla 4 por el lado
 * incómodo. Si el producto va a mostrar «destino económico: no disponible», tiene
 * que haber una fila en `meta.validation` que diga por qué, con la fecha del corte
 * que se revisó.
 */
export async function recordUnavailableFields(
  snapshotId: number,
  fields: readonly { column: string; why: string }[],
): Promise<void> {
  await recordValidation({
    snapshotId,
    checkName: 'source_lacks_fields',
    severity: 'info',
    passed: true,
    affectedRows: fields.length,
    message:
      `La Base Catastral Pública no trae ${fields.length} campos que el modelo prevé; quedan en NULL ` +
      'y se declaran NO_DISPONIBLE. No se estiman ni se rellenan con valores por defecto (reglas 2, 4 y 5).',
    sample: fields.map((f) => ({ columna: f.column, motivo: f.why })),
  });
}

/** Comparación con el corte anterior del mismo departamento. */
export async function validateRowCountDelta(
  datasetId: string,
  snapshotId: number,
  rowCount: number,
): Promise<void> {
  const previous = await query<{ row_count: number | null; cut_date: string }>(sql`
    SELECT row_count, cut_date::text AS cut_date
    FROM meta.snapshot
    WHERE dataset_id = ${datasetId} AND id <> ${snapshotId} AND row_count IS NOT NULL
    ORDER BY cut_date DESC
    LIMIT 1
  `);
  const prev = previous[0];
  if (!prev?.row_count) {
    await recordValidation({
      snapshotId,
      checkName: 'row_count_delta',
      severity: 'info',
      passed: true,
      affectedRows: rowCount,
      message: `Primer corte de este departamento: ${rowCount} predios. No hay corte anterior con el que comparar.`,
    });
    return;
  }
  const delta = ((rowCount - prev.row_count) / prev.row_count) * 100;
  await recordValidation({
    snapshotId,
    checkName: 'row_count_delta',
    severity: Math.abs(delta) > 10 ? 'warning' : 'info',
    passed: Math.abs(delta) <= 10,
    affectedRows: Math.abs(rowCount - prev.row_count),
    message:
      `${rowCount} predios frente a ${prev.row_count} del corte ${prev.cut_date}: ` +
      `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} %.`,
  });
}
