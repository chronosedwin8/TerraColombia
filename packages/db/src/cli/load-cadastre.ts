#!/usr/bin/env node
/**
 * Carga de la Base Catastral Pública del IGAC, por departamento.
 *
 *   pnpm --filter @terracolombia/db load:cadastre -- --dept=08
 *   pnpm --filter @terracolombia/db load:cadastre -- --dept=08,25,76
 *   pnpm --filter @terracolombia/db load:cadastre -- --priority   (los 8 más poblados)
 *   pnpm --filter @terracolombia/db load:cadastre -- --all        (los 31 publicados)
 *   pnpm --filter @terracolombia/db load:cadastre -- --coverage   (solo informe de cobertura)
 *
 * Opciones:
 *   --keep-raw        No borra las tablas de staging de `raw` al terminar.
 *   --keep-zip        No borra el ZIP descargado (por omisión se conserva).
 *   --dry-run         Carga y valida, pero no publica el corte.
 *   --skip-download   Usa el ZIP que ya esté en disco sin consultar el ítem.
 *
 * Cada departamento es una unidad independiente: su propio `meta.dataset`, su
 * propio `meta.snapshot` y su propia partición de `core.parcel`. Si uno falla, los
 * demás siguen, y el informe final dice exactamente qué entró y qué no.
 */

import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CADASTRE_DATASET_PREFIX,
  CADASTRE_UNAVAILABLE_FIELDS,
  DEPARTMENTS_WITHOUT_IGAC_GDB,
  IGAC_DEPARTMENT_GDB_ITEMS,
  arcgisItemDataUrl,
  cadastreDatasetId,
  type DepartmentGdbItem,
} from '@terracolombia/etl-config';
import { closePool, createPool, execute, query, setPool } from '../pool.js';
import { loadEnv } from '../env.js';
import { sql } from '../sql.js';
import {
  createSnapshot,
  publishSnapshot,
  recordValidation,
  setSnapshotStatus,
  upsertDataset,
  startRun,
  finishRun,
} from '../repositories/meta.js';
import { rebuildSearchIndex } from '../repositories/search.js';
import { refreshMuniSummary } from '../repositories/analytics.js';
import { markCadastreCoverage } from '../repositories/admin.js';
import { CADASTRE_LAYERS } from '../cadastre/layers.js';
import {
  downloadDepartmentZip,
  dropStagingTables,
  extractGdb,
  inspectGdb,
  resolveGdalTools,
  stageAllLayers,
  verifyCrsEquivalence,
  type GdalTools,
} from '../cadastre/stage.js';
import {
  clearSnapshotRows,
  transformAddressPoints,
  transformBuildings,
  transformHierarchy,
  transformParcels,
  transformStreetNames,
  transformUrbanPerimeter,
  type LayerOutcome,
} from '../cadastre/transform.js';
import {
  clearSnapshotDiagnostics,
  recordUnavailableFields,
  sweepPii,
  validateGeometry,
  validateRowCountDelta,
} from '../cadastre/validate.js';
import { fetchArcgisItem, checkItemIdentity } from '../cadastre/arcgis-item.js';

// ─── Argumentos ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
function flag(name: string): string | null {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
}
const has = (name: string) => flag(name) !== null;

/**
 * Orden por población, que es el que pide priorizar si aprieta el tiempo: un
 * corte de Cundinamarca sirve a más gente que uno de Vaupés.
 */
const PRIORITY_ORDER = ['25', '76', '68', '13', '23', '52', '73', '15'];

const REPO_ROOT = resolve(process.cwd());
const DOWNLOAD_DIR = join(REPO_ROOT, 'data/downloads/igac-cadastre');
const WORK_DIR = join(DOWNLOAD_DIR, 'extract');
const SCRATCH_DIR = join(DOWNLOAD_DIR, 'dump');

// ─── Informe ──────────────────────────────────────────────────────────────────

interface DepartmentReport {
  deptCode: string;
  deptName: string;
  status: 'published' | 'loaded-not-published' | 'failed' | 'skipped';
  cutDate: string | null;
  cutDateSource: 'declarada-por-la-fuente' | 'modified-del-item' | null;
  snapshotId: number | null;
  parcelsUrban: number;
  parcelsRural: number;
  buildings: number;
  blocks: number;
  neighborhoods: number;
  sectors: number;
  veredas: number;
  perimeters: number;
  streetNames: number;
  addressPoints: number;
  municipalities: number;
  informalRows: number;
  addressUsefulnessPct: number;
  downloadMs: number;
  stageMs: number;
  transformMs: number;
  totalMs: number;
  sha256: string | null;
  error: string | null;
  notes: string[];
}

function emptyReport(item: DepartmentGdbItem): DepartmentReport {
  return {
    deptCode: item.deptCode,
    deptName: item.deptName,
    status: 'failed',
    cutDate: null,
    cutDateSource: null,
    snapshotId: null,
    parcelsUrban: 0,
    parcelsRural: 0,
    buildings: 0,
    blocks: 0,
    neighborhoods: 0,
    sectors: 0,
    veredas: 0,
    perimeters: 0,
    streetNames: 0,
    addressPoints: 0,
    municipalities: 0,
    informalRows: 0,
    addressUsefulnessPct: 0,
    downloadMs: 0,
    stageMs: 0,
    transformMs: 0,
    totalMs: 0,
    sha256: null,
    error: null,
    notes: [],
  };
}

// ─── Carga de un departamento ─────────────────────────────────────────────────

async function loadDepartment(
  item: DepartmentGdbItem,
  tools: GdalTools,
  connectionString: string,
  opts: { dryRun: boolean; keepRaw: boolean; skipDownload: boolean },
): Promise<DepartmentReport> {
  const report = emptyReport(item);
  const t0 = Date.now();
  const datasetId = cadastreDatasetId(item.deptCode);
  const line = (msg: string) =>
    process.stdout.write(`\r    ${msg.padEnd(72).slice(0, 72)}`);

  console.log(`\n── ${item.deptCode} · ${item.deptName} ${'─'.repeat(Math.max(0, 50 - item.deptName.length))}`);

  // 1. Metadatos del ítem: de aquí sale la fecha de corte que se va a mostrar.
  let cutDate = item.declaredCut;
  let cutSource: DepartmentReport['cutDateSource'] = 'declarada-por-la-fuente';
  let sizeBytes = item.sizeBytes;

  if (!opts.skipDownload) {
    const info = await fetchArcgisItem(item.itemId);
    const identityProblems = checkItemIdentity(info, {
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
    });
    if (identityProblems.length > 0) {
      report.notes.push(...identityProblems);
      console.log(`    aviso: ${identityProblems.join(' ')}`);
    }
    sizeBytes = info.sizeBytes || item.sizeBytes;

    if (info.declaredCut) {
      cutDate = info.declaredCut;
      cutSource = 'declarada-por-la-fuente';
      if (info.declaredCut !== item.declaredCut) {
        report.notes.push(
          `El corte que declara la fuente cambió: era ${item.declaredCut} y ahora es ${info.declaredCut}.`,
        );
      }
    } else {
      // Sin corte declarado se cae a `modified`, pero queda dicho que es un
      // sustituto: `modified` es cuándo se tocó el ítem, no a qué fecha
      // corresponde el dato (regla 4).
      cutDate = info.modifiedIso.slice(0, 10);
      cutSource = 'modified-del-item';
      report.notes.push(
        'El ítem no declara fecha de corte en su texto: se usa `modified` como aproximación y se marca como tal.',
      );
    }
    console.log(
      `    corte declarado por la fuente: ${cutDate}` +
        (info.declaredCutEvidence ? ` («${info.declaredCutEvidence}»)` : '') +
        `  ·  modified del ítem: ${info.modifiedIso.slice(0, 10)}`,
    );
  }
  report.cutDate = cutDate;
  report.cutDateSource = cutSource;

  const attribution = `Fuente: IGAC, Base Catastral, corte ${cutDate.slice(0, 7)}, CC BY-SA 4.0`;

  await upsertDataset({
    id: datasetId,
    source: 'IGAC',
    name: `Base Catastral Pública — ${item.deptName} (${item.deptCode})`,
    description:
      `Predios, construcciones y unidades territoriales del departamento de ${item.deptName} ` +
      'publicados por el IGAC como File Geodatabase. No incluye avalúo catastral, destino económico ' +
      'ni área registral: esos campos viven en los Registros 1 y 2, que no se publican.',
    license: 'CC BY-SA 4.0',
    attribution,
    url: arcgisItemDataUrl(item.itemId),
    frequency: 'mensual',
    connector: 'file-download',
    format: 'gdb',
    source_srid: 9377,
    target_table: 'core.parcel',
    share_alike: true,
    notes:
      `Ítem de ArcGIS Online ${item.itemId}. Corte declarado por la fuente: ${cutDate} ` +
      `(origen de la fecha: ${cutSource}). El avalúo catastral NO está en esta fuente.`,
  });

  const snapshot = await createSnapshot({
    datasetId,
    cutDate,
    // El dato es real. Nada de esta ruta escribe un corte sintético.
    isSynthetic: false,
    sourceUrl: arcgisItemDataUrl(item.itemId),
    stageMethod: 'ogr2ogr',
  });
  report.snapshotId = snapshot.id;
  const runId = await startRun(datasetId, 'stage', snapshot.id);

  try {
    // Relanzar el cargador tiene que dar el mismo resultado que lanzarlo por
    // primera vez: se borra el diagnóstico del intento anterior sobre este mismo
    // corte antes de volver a escribirlo.
    await clearSnapshotDiagnostics(snapshot.id);
    await setSnapshotStatus(snapshot.id, 'downloading');

    // 2. Descarga.
    const dl = await downloadDepartmentZip(item.itemId, item.deptCode, sizeBytes, DOWNLOAD_DIR);
    report.downloadMs = dl.downloadMs;
    report.sha256 = dl.sha256;
    console.log(
      `    ZIP ${dl.reused ? 'reutilizado de disco' : 'descargado'}: ` +
        `${(dl.sizeBytes / 1_048_576).toFixed(1)} MB` +
        (dl.reused ? '' : ` en ${(dl.downloadMs / 1000).toFixed(1)} s`),
    );
    await execute(sql`UPDATE meta.snapshot SET checksum = ${dl.sha256} WHERE id = ${snapshot.id}`);

    // 3. Descompresión e inspección real de la GDB (regla 2).
    const gdbPath = await extractGdb(dl.zipPath, item.deptCode, WORK_DIR, tools);
    const inspected = await inspectGdb(gdbPath, tools);
    console.log(`    GDB con ${inspected.length} capas inspeccionadas con ogrinfo`);

    // 4. El CRS tiene que ser el que creemos antes de asignárselo.
    const terreno = inspected.find((l) => l.layer === 'U_TERRENO') ?? inspected[0];
    const crs = verifyCrsEquivalence(terreno?.srsWkt ?? '');
    if (!crs.ok) {
      throw new Error(
        `El CRS de la GDB de ${item.deptCode} no es equivalente a EPSG:9377: ${crs.problems.join(' ')}`,
      );
    }
    await recordValidation({
      snapshotId: snapshot.id,
      checkName: 'srid_mismatch',
      severity: 'info',
      passed: true,
      affectedRows: 0,
      message:
        'El CRS de la GDB («MAGNA CTM12») coincide parámetro a parámetro con EPSG:9377: ' +
        'origen lat 4 / lon -73, factor 0,9992, falso este 5 000 000, falso norte 2 000 000, elipsoide GRS 1980.',
    });

    // 5. Staging a `raw`.
    const stageStart = Date.now();
    mkdirSync(SCRATCH_DIR, { recursive: true });
    const staged = await stageAllLayers({
      gdbPath,
      deptCode: item.deptCode,
      tools,
      connectionString,
      scratchDir: SCRATCH_DIR,
      present: inspected,
      onProgress: line,
    });
    report.stageMs = Date.now() - stageStart;
    process.stdout.write('\r' + ' '.repeat(78) + '\r');
    console.log(
      `    ${staged.length} capas en raw · ${staged.reduce((s, l) => s + l.rows, 0).toLocaleString('es-CO')} filas ` +
        `en ${(report.stageMs / 1000).toFixed(1)} s`,
    );
    await setSnapshotStatus(snapshot.id, 'staged');

    const stagedSet = new Set(staged.map((s) => s.layer));
    report.informalRows = staged
      .filter((s) => s.layer.endsWith('_INFORMAL'))
      .reduce((sum, s) => sum + s.rows, 0);

    // 6. Barrido de datos personales ANTES de escribir en `core` (regla 3).
    const pii = await sweepPii(item.deptCode, datasetId, snapshot.id, inspected);
    if (pii.offendingColumns.length > 0) {
      throw new Error(
        `Se encontraron columnas con posible dato personal en ${item.deptCode}: ` +
          `${pii.offendingColumns.map((o) => `${o.layer}.${o.column}`).join(', ')}. ` +
          'Añádelas a etl/config/pii-blocklist.ts y vuelve a lanzar la carga.',
      );
    }
    console.log(
      `    PII: ${pii.columnsChecked} columnas de ${pii.layersChecked} capas revisadas, ninguna con dato personal` +
        (pii.contentHits.length > 0 ? ` (${pii.contentHits.length} marcadas por contenido)` : ''),
    );

    // 7. Transformación a `core`.
    const transformStart = Date.now();
    await clearSnapshotRows(item.deptCode, snapshot.id);
    const ctx = {
      deptCode: item.deptCode,
      snapshotId: snapshot.id,
      cutDate,
      stagedLayers: stagedSet,
      onProgress: line,
    };

    const outcomes: LayerOutcome[] = [];
    const urban = await transformParcels(ctx, 'U_TERRENO');
    const rural = await transformParcels(ctx, 'R_TERRENO');
    report.parcelsUrban = urban.insertedRows;
    report.parcelsRural = rural.insertedRows;
    outcomes.push(urban, rural);

    for (const layer of ['U_CONSTRUCCION', 'R_CONSTRUCCION'] as const) {
      const o = await transformBuildings(ctx, layer);
      report.buildings += o.insertedRows;
      outcomes.push(o);
    }
    for (const layer of ['U_MANZANA', 'U_BARRIO', 'U_SECTOR', 'R_SECTOR', 'R_VEREDA'] as const) {
      const o = await transformHierarchy(ctx, layer);
      if (o.target === 'core.block') report.blocks += o.insertedRows;
      else if (o.target === 'core.neighborhood') report.neighborhoods += o.insertedRows;
      else if (o.target === 'core.vereda') report.veredas += o.insertedRows;
      else report.sectors += o.insertedRows;
      outcomes.push(o);
    }
    const perim = await transformUrbanPerimeter(ctx);
    report.perimeters = perim.insertedRows;
    outcomes.push(perim);

    for (const layer of ['U_NOMENCLATURA_VIAL', 'R_NOMENCLATURA_VIAL'] as const) {
      const o = await transformStreetNames(ctx, layer);
      report.streetNames += o.insertedRows;
      outcomes.push(o);
    }
    let addressSource = 0;
    let addressUsable = 0;
    for (const layer of ['U_NOMENCLATURA_DOMICILIARIA', 'R_NOMENCLATURA_DOMICILIARIA'] as const) {
      const o = await transformAddressPoints(ctx, layer);
      report.addressPoints += o.insertedRows;
      addressSource += o.sourceRows;
      addressUsable += o.insertedRows;
      outcomes.push(o);
    }
    report.addressUsefulnessPct = addressSource > 0 ? (addressUsable / addressSource) * 100 : 0;
    report.transformMs = Date.now() - transformStart;
    process.stdout.write('\r' + ' '.repeat(78) + '\r');

    const totalParcels = report.parcelsUrban + report.parcelsRural;
    console.log(
      `    core.parcel: ${totalParcels.toLocaleString('es-CO')} ` +
        `(${report.parcelsUrban.toLocaleString('es-CO')} urbanos + ${report.parcelsRural.toLocaleString('es-CO')} rurales) · ` +
        `core.building: ${report.buildings.toLocaleString('es-CO')} · ${(report.transformMs / 1000).toFixed(1)} s`,
    );

    const munis = await query<{ n: number }>(sql`
      SELECT count(DISTINCT muni_code)::int AS n FROM core.parcel WHERE snapshot_id = ${snapshot.id}
    `);
    report.municipalities = munis[0]?.n ?? 0;

    // 8. Validaciones.
    const geom = await validateGeometry(item.deptCode, snapshot.id);
    await recordUnavailableFields(snapshot.id, CADASTRE_UNAVAILABLE_FIELDS);
    await validateRowCountDelta(datasetId, snapshot.id, totalParcels);

    // La utilidad de la nomenclatura se registra como aviso, no como bloqueo: que
    // la fuente no sirva para geocodificar no invalida los predios, que es el 99 %
    // del valor del corte. La consecuencia que pedía el catálogo —no alimentar el
    // geocodificador— ya está aplicada en la transformación, fila a fila.
    await recordValidation({
      snapshotId: snapshot.id,
      checkName: 'address_usefulness',
      severity: report.addressUsefulnessPct < 30 ? 'warning' : 'info',
      passed: report.addressUsefulnessPct >= 30,
      affectedRows: addressSource - addressUsable,
      message:
        `Solo ${report.addressUsefulnessPct.toFixed(2)} % de la nomenclatura domiciliaria ` +
        `(${addressUsable} de ${addressSource}) es una dirección reconocible. ` +
        'El resto son topónimos y literales «NS», y NO entran a core.address_point. ' +
        'core.parcel.address queda NULL: la búsqueda por dirección no se sostiene con esta fuente.',
    });

    if (geom.inDefaultPartition > 0 || geom.outsideColombia > 0) {
      throw new Error(
        `Validación bloqueante en ${item.deptCode}: ${geom.inDefaultPartition} filas en la partición por ` +
          `defecto y ${geom.outsideColombia} predios fuera de Colombia. El corte no se publica.`,
      );
    }
    console.log(
      `    validado: 0 en partición por defecto · ${geom.invalidGeometry} geometrías inválidas · ` +
        `${report.municipalities} municipios`,
    );

    // 9. Publicación.
    await setSnapshotStatus(snapshot.id, 'transformed', {
      rowCount: totalParcels,
      stats: {
        departamento: item.deptName,
        corte_declarado_por_la_fuente: cutDate,
        origen_de_la_fecha_de_corte: cutSource,
        sha256_del_zip: dl.sha256,
        bytes_del_zip: dl.sizeBytes,
        predios_urbanos: report.parcelsUrban,
        predios_rurales: report.parcelsRural,
        construcciones: report.buildings,
        manzanas: report.blocks,
        barrios: report.neighborhoods,
        sectores: report.sectors,
        veredas: report.veredas,
        perimetros_urbanos: report.perimeters,
        nombres_de_via: report.streetNames,
        puntos_de_direccion: report.addressPoints,
        municipios_cubiertos: report.municipalities,
        filas_informales_no_cargadas: report.informalRows,
        campos_no_disponibles_en_la_fuente: CADASTRE_UNAVAILABLE_FIELDS.map((f) => f.column),
        capas_por_destino: outcomes.map((o) => ({
          capa: o.layer,
          destino: o.target,
          filas_en_la_fuente: o.sourceRows,
          filas_cargadas: o.insertedRows,
          descartes: o.skipped,
        })),
      },
    });

    if (opts.dryRun) {
      report.status = 'loaded-not-published';
      console.log('    --dry-run: el corte queda en `transformed`, sin publicar.');
    } else {
      await publishSnapshot(snapshot.id);
      const cubiertos = await markCadastreCoverage(snapshot.id);
      report.status = 'published';
      console.log(`    publicado · ${attribution} · ${cubiertos} municipios marcados con este corte`);
    }

    await finishRun(runId, 'ok', {
      rowsIn: staged.reduce((s, l) => s + l.rows, 0),
      rowsOut: totalParcels + report.buildings,
      message: `${item.deptName}: ${totalParcels} predios, ${report.buildings} construcciones`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report.error = message;
    report.status = 'failed';
    await setSnapshotStatus(snapshot.id, 'failed', { errorMessage: message.slice(0, 2000) });
    await finishRun(runId, 'failed', { message: message.slice(0, 1000) });
    console.log(`\n    FALLÓ: ${message}`);
  } finally {
    if (!opts.keepRaw) {
      await dropStagingTables({ deptCode: item.deptCode, tools, connectionString });
    }
    // La GDB descomprimida ocupa varias veces el ZIP y no aporta nada una vez
    // cargada: el ZIP con su SHA-256 es la evidencia que hay que conservar.
    await rm(join(WORK_DIR, item.deptCode), { recursive: true, force: true }).catch(() => undefined);
    report.totalMs = Date.now() - t0;
  }

  return report;
}

// ─── Convivencia con los datos de demostración ────────────────────────────────

/**
 * Despublica el corte sintético del catastro cuando el real ya cubre su municipio.
 *
 * Hace falta una decisión explícita porque la guarda de `meta.publish_snapshot`
 * no alcanza: esa guarda impide publicar un corte sintético cuando existe uno real
 * **del mismo dataset**, y aquí son datasets distintos (`demo-cadastre` frente a
 * `igac-cadastre-08`). Sin esto, los 528 predios sintéticos de Soledad y los reales
 * del mismo municipio estarían activos a la vez: la ficha mostraría predios que no
 * existen y el buscador los ofrecería mezclados con los de verdad.
 *
 * Se despublica en vez de borrar. El corte sigue en la base con
 * `status = 'superseded'`, así que se puede volver a él en un entorno de
 * desarrollo sin catastro real, y el rastro de que existió no se pierde.
 *
 * Al dejar de estar activo, `getSourceRefs` deja de devolver `synthetic: true`
 * para el municipio, y la banda de demostración de la UI —que se pinta a partir de
 * `meta.synthetic`— desaparece sola, sin tocar el front.
 */
async function retireDemoCadastreIfCovered(): Promise<{
  retired: boolean;
  municipalities: string[];
}> {
  const demoMunis = await query<{ muni_code: string }>(sql`
    SELECT DISTINCT p.muni_code
    FROM core.parcel p
    JOIN meta.snapshot s ON s.id = p.snapshot_id
    WHERE s.dataset_id = 'demo-cadastre' AND s.is_active
  `);
  if (demoMunis.length === 0) return { retired: false, municipalities: [] };

  const codes = demoMunis.map((m) => m.muni_code.trim());
  const covered = await query<{ muni_code: string }>(sql`
    SELECT DISTINCT p.muni_code
    FROM core.parcel p
    JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
    WHERE NOT s.is_synthetic
      AND s.dataset_id LIKE ${`${CADASTRE_DATASET_PREFIX}%`}
      AND p.muni_code = ANY(${codes}::text[])
  `);
  if (covered.length === 0) return { retired: false, municipalities: [] };

  // Se despublica el corte sintético completo, no municipio a municipio: un
  // snapshot es indivisible y dejarlo medio activo no es un estado que
  // `meta.snapshot` sepa representar.
  await execute(sql`
    UPDATE meta.snapshot
    SET is_active = FALSE, status = 'superseded'
    WHERE dataset_id = 'demo-cadastre' AND is_active
  `);

  return { retired: true, municipalities: covered.map((c) => c.muni_code.trim()) };
}

// ─── Informe de cobertura (regla 6) ───────────────────────────────────────────

/**
 * Cuenta con cifras qué parte del país queda cubierta y qué parte no, y por qué.
 *
 * Es la regla 6 llevada a números: «no hay datos» no es una respuesta aceptable si
 * se puede decir cuántos municipios son, quién es su gestor catastral y adónde
 * tiene que ir el usuario.
 */
async function coverageReport(): Promise<void> {
  const totals = await query<{
    municipios: number;
    con_predios: number;
    igac: number;
    no_igac: number;
    sin_gestor: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM core.municipality) AS municipios,
      (SELECT count(DISTINCT p.muni_code)::int
         FROM core.parcel p JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
         WHERE NOT s.is_synthetic) AS con_predios,
      (SELECT count(*)::int FROM core.cadastral_manager WHERE is_igac) AS igac,
      (SELECT count(*)::int FROM core.cadastral_manager WHERE NOT is_igac) AS no_igac,
      (SELECT count(*)::int FROM core.municipality m
         WHERE NOT EXISTS (SELECT 1 FROM core.cadastral_manager cm WHERE cm.muni_code = m.code)) AS sin_gestor
  `);
  const t = totals[0]!;

  console.log('\n\n════ Cobertura del país ════\n');
  console.log(`  Municipios en la DIVIPOLA:                   ${t.municipios}`);
  console.log(`  Con predios reales cargados:                 ${t.con_predios}`);
  console.log(`  Sin predios:                                 ${t.municipios - t.con_predios}`);

  if (t.igac + t.no_igac > 0) {
    console.log(`\n  Según core.cadastral_manager:`);
    console.log(`    · gestor IGAC:                            ${t.igac}`);
    console.log(`    · gestor propio (catastro descentralizado): ${t.no_igac}`);
    console.log(`    · sin gestor declarado:                   ${t.sin_gestor}`);
  } else {
    console.log(
      '\n  core.cadastral_manager está vacía: ejecuta `pnpm etl -- run igac-gestores-catastrales`\n' +
        '  para poder decirle al usuario quién gestiona cada municipio que no tenemos.',
    );
  }

  // Municipios de departamentos SIN GDB del IGAC: la cobertura que nunca va a
  // llegar por esta vía, y que hay que declarar como tal.
  const noGdb = await query<{ dept_code: string; name: string; municipios: number }>(sql`
    SELECT m.dept_code, d.name, count(*)::int AS municipios
    FROM core.municipality m
    JOIN core.department d ON d.code = m.dept_code
    WHERE m.dept_code = ANY(${DEPARTMENTS_WITHOUT_IGAC_GDB.map((x) => x.deptCode)}::text[])
    GROUP BY 1, 2 ORDER BY 1
  `);
  if (noGdb.length > 0) {
    console.log('\n  Departamentos que el IGAC NO publica (gestor catastral propio):');
    for (const r of noGdb) {
      const why = DEPARTMENTS_WITHOUT_IGAC_GDB.find((x) => x.deptCode === r.dept_code)?.reason ?? '';
      console.log(`    · ${r.dept_code} ${r.name}: ${r.municipios} municipios. ${why}`);
    }
    const sum = noGdb.reduce((s, r) => s + r.municipios, 0);
    console.log(
      `    Suman ${sum} municipios que NO se pueden cargar desde esta fuente. No es un fallo de la carga.`,
    );
  }

  // Municipios que el IGAC gestiona pero que aún no hemos cargado.
  const pending = await query<{ dept_code: string; name: string; n: number }>(sql`
    SELECT m.dept_code, d.name, count(*)::int AS n
    FROM core.municipality m
    JOIN core.department d ON d.code = m.dept_code
    WHERE NOT m.dept_code = ANY(${DEPARTMENTS_WITHOUT_IGAC_GDB.map((x) => x.deptCode)}::text[])
      AND NOT EXISTS (
        SELECT 1 FROM core.parcel p
        JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
        WHERE p.muni_code = m.code AND NOT s.is_synthetic
      )
    GROUP BY 1, 2 ORDER BY 3 DESC, 1
  `);
  if (pending.length > 0) {
    console.log('\n  Departamentos con GDB publicada pero sin cargar (o cargados a medias):');
    for (const r of pending) {
      console.log(`    · ${r.dept_code} ${r.name}: ${r.n} municipios pendientes`);
    }
  }
}

// ─── Programa ─────────────────────────────────────────────────────────────────

function selectDepartments(): DepartmentGdbItem[] {
  const byCode = new Map(IGAC_DEPARTMENT_GDB_ITEMS.map((i) => [i.deptCode, i]));

  if (has('all')) {
    // Los prioritarios primero: si la corrida se corta, lo cargado es lo que más
    // gente usa.
    const ordered = [
      ...PRIORITY_ORDER.map((c) => byCode.get(c)).filter((i): i is DepartmentGdbItem => !!i),
      ...IGAC_DEPARTMENT_GDB_ITEMS.filter((i) => !PRIORITY_ORDER.includes(i.deptCode)),
    ];
    // Atlántico primero de todo: es el departamento de referencia del proyecto.
    const atl = byCode.get('08')!;
    return [atl, ...ordered.filter((i) => i.deptCode !== '08')];
  }

  if (has('priority')) {
    return PRIORITY_ORDER.map((c) => byCode.get(c)).filter((i): i is DepartmentGdbItem => !!i);
  }

  const explicit = flag('dept');
  if (explicit) {
    const codes = explicit
      .split(',')
      .map((c) => c.trim().padStart(2, '0'))
      .filter(Boolean);
    const out: DepartmentGdbItem[] = [];
    for (const c of codes) {
      const item = byCode.get(c);
      if (!item) {
        const missing = DEPARTMENTS_WITHOUT_IGAC_GDB.find((d) => d.deptCode === c);
        if (missing) {
          console.error(
            `\nEl departamento ${c} (${missing.deptName}) no tiene base catastral pública del IGAC.\n` +
              `Motivo: ${missing.reason}\n` +
              'No es un error de la carga: es cobertura real (regla 6 de CLAUDE.md).',
          );
        } else {
          console.error(`\nNo hay ítem declarado para el departamento ${c}.`);
        }
        continue;
      }
      out.push(item);
    }
    return out;
  }

  return [];
}

function formatTable(reports: DepartmentReport[]): string {
  const rows = [
    'Dept  Nombre                Estado      Corte       Predios      Urb.        Rur.        Construc.   Muni  Tiempo',
    '────  ────────────────────  ──────────  ──────────  ───────────  ──────────  ──────────  ──────────  ────  ──────',
  ];
  for (const r of reports) {
    const parcels = r.parcelsUrban + r.parcelsRural;
    rows.push(
      [
        r.deptCode.padEnd(4),
        r.deptName.slice(0, 20).padEnd(20),
        r.status.slice(0, 10).padEnd(10),
        (r.cutDate ?? '-').padEnd(10),
        parcels.toLocaleString('es-CO').padStart(11),
        r.parcelsUrban.toLocaleString('es-CO').padStart(10),
        r.parcelsRural.toLocaleString('es-CO').padStart(10),
        r.buildings.toLocaleString('es-CO').padStart(10),
        String(r.municipalities).padStart(4),
        `${(r.totalMs / 1000).toFixed(0)}s`.padStart(6),
      ].join('  '),
    );
  }
  return rows.join('\n');
}

async function main(): Promise<void> {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definida. Copia .env.example a .env.');
  }

  /**
   * Pool propio con `statement_timeout` largo. El del producto está en 30 s,
   * pensado para consultas interactivas; un `INSERT … SELECT` que limpia y
   * reproyecta 600 000 polígonos tarda más que eso y se cancelaría a mitad.
   */
  setPool(
    createPool({
      connectionString,
      max: 4,
      statementTimeoutMs: 45 * 60 * 1000,
      applicationName: 'terracolombia-load-cadastre',
    }),
  );

  if (has('coverage')) {
    await coverageReport();
    return;
  }

  const departments = selectDepartments();
  if (departments.length === 0) {
    console.log(
      [
        '',
        'Carga de la Base Catastral Pública del IGAC',
        '',
        '  --dept=08            Un departamento (o varios: --dept=08,25,76)',
        '  --priority           Los 8 más poblados con GDB del IGAC',
        '  --all                Los 31 departamentos publicados',
        '  --coverage           Solo el informe de cobertura del país',
        '',
        '  --dry-run            Carga y valida, pero no publica',
        '  --keep-raw           Conserva las tablas de staging en `raw`',
        '  --skip-download      Usa el ZIP de disco sin consultar el ítem de ArcGIS',
        '',
        `Departamentos con GDB publicada (${IGAC_DEPARTMENT_GDB_ITEMS.length}):`,
        '  ' +
          IGAC_DEPARTMENT_GDB_ITEMS.map((i) => `${i.deptCode} ${i.deptName}`)
            .join(' · ')
            .replace(/(.{100}?) · /g, '$1\n  '),
        '',
        'SIN base catastral pública del IGAC (gestor catastral propio, regla 6):',
        ...DEPARTMENTS_WITHOUT_IGAC_GDB.map((d) => `  ${d.deptCode} ${d.deptName}: ${d.reason}`),
        '',
      ].join('\n'),
    );
    return;
  }

  const tools = resolveGdalTools();
  console.log('Carga de la Base Catastral Pública del IGAC\n');
  console.log(`  ogr2ogr:  ${tools.ogr2ogr}`);
  console.log(`  psql:     ${tools.psql}`);
  console.log(`  PROJ_LIB: ${tools.projLib || '(del sistema)'}`);
  console.log(`  Departamentos a cargar: ${departments.map((d) => d.deptCode).join(', ')}`);

  const opts = {
    dryRun: has('dry-run'),
    keepRaw: has('keep-raw'),
    skipDownload: has('skip-download'),
  };

  const startedAll = Date.now();
  const reports: DepartmentReport[] = [];
  for (const item of departments) {
    reports.push(await loadDepartment(item, tools, connectionString, opts));
  }

  // ─ Convivencia con la demostración ─
  const demo = await retireDemoCadastreIfCovered();
  if (demo.retired) {
    console.log(
      `\n  Corte sintético de catastro DESPUBLICADO: los municipios ${demo.municipalities.join(', ')} ` +
        'ya tienen datos reales. La banda de demostración desaparece sola de la UI.',
    );
  }

  // ─ Agregados e índice ─
  const published = reports.filter((r) => r.status === 'published');
  if (published.length > 0) {
    console.log('\n  Reconstruyendo el índice de búsqueda…');
    const indexed = await rebuildSearchIndex();
    console.log(`  ${indexed.toLocaleString('es-CO')} entradas en analytics.search_index`);
    // La vista municipal alimenta /coverage y la explicación de «por qué no hay resultados»;
    // sin refrescarla, la UI seguía diciendo que había predios en un solo municipio.
    await refreshMuniSummary();
    console.log('  Vista analytics.muni_summary refrescada.');
    console.log(
      '  Recuerda recalcular los agregados por celda: `pnpm etl -- aggregate --loaded`',
    );
  }

  // ─ Informe ─
  console.log('\n\n════ Resultado por departamento ════\n');
  console.log(formatTable(reports));

  const totals = reports.reduce(
    (acc, r) => ({
      parcels: acc.parcels + r.parcelsUrban + r.parcelsRural,
      urban: acc.urban + r.parcelsUrban,
      rural: acc.rural + r.parcelsRural,
      buildings: acc.buildings + r.buildings,
      munis: acc.munis + r.municipalities,
    }),
    { parcels: 0, urban: 0, rural: 0, buildings: 0, munis: 0 },
  );

  console.log(
    `\n  Total: ${totals.parcels.toLocaleString('es-CO')} predios ` +
      `(${totals.urban.toLocaleString('es-CO')} urbanos + ${totals.rural.toLocaleString('es-CO')} rurales), ` +
      `${totals.buildings.toLocaleString('es-CO')} construcciones, ` +
      `${totals.munis} municipios, en ${((Date.now() - startedAll) / 60000).toFixed(1)} minutos.`,
  );

  const failed = reports.filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    console.log(`\n  ${failed.length} departamento(s) fallaron:`);
    for (const f of failed) console.log(`    · ${f.deptCode} ${f.deptName}: ${f.error}`);
  }

  console.log('\n  Campos que quedan en NULL porque la fuente no los trae:');
  for (const f of CADASTRE_UNAVAILABLE_FIELDS) {
    console.log(`    · ${f.column}`);
  }
  console.log(
    '\n  AVISO: el avalúo catastral NO está en esta fuente. Cuando lo esté, recuerda que el avalúo\n' +
      '  catastral no es valor comercial (regla 5 de CLAUDE.md).',
  );

  await coverageReport();

  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());

// Se exporta para las pruebas: el CLI no debe ser la única puerta de entrada.
export { loadDepartment, retireDemoCadastreIfCovered, coverageReport, CADASTRE_LAYERS };
