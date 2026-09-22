#!/usr/bin/env node
/**
 * Carga nacional de OpenStreetMap: red vial (`ctx.road`) y puntos de interés (`ctx.poi`)
 * desde el extracto de Colombia de Geofabrik.
 *
 * Datasets: `osm-vias-colombia` y `osm-poi-colombia` (ver `etl/config/datasets/osm.ts`).
 * Herramienta: lector propio de `.osm.pbf` (`../seed/osm-pbf.ts`). El por qué está en
 * ADR-010 de `docs/DECISIONES.md`: en esta máquina no hay `osmium` ni `osm2pgsql`, y el
 * driver OSM de GDAL obliga a pasar por `other_tags` en hstore y por un SQLite temporal,
 * sin control sobre el descarte de etiquetas de contacto antes de escribir.
 *
 * Cómo funciona (dos pasadas sobre el fichero, sin cargar OSM entero en memoria):
 *   1. `--inspect`: recorre el extracto y escribe el histograma real de claves y valores en
 *      `data-catalog/osm/etiquetas-observadas.json`. Es la evidencia de la regla 2: el mapeo
 *      de `../seed/osm-tags.ts` solo declara valores que salen de ahí.
 *   2. Pasada 1: selecciona los ways con `highway` de la red vehicular y los elementos con
 *      etiqueta de POI, y anota qué nodos hacen falta para las geometrías.
 *   3. Pasada 2: resuelve las coordenadas de esos nodos (y solo de esos).
 *   4. Carga por lotes con transacciones acotadas, asigna `muni_code` cruzando con
 *      `core.municipality` y publica el snapshot.
 *
 * Uso:
 *   pnpm --filter @terracolombia/db load:osm -- --inspect
 *   pnpm --filter @terracolombia/db load:osm
 *   pnpm --filter @terracolombia/db load:osm -- --only=roads --batch=2000
 *
 * El extracto pesa 330 MB y la pasada 1 guarda ~1 M de vías en memoria: conviene correrlo con
 * `NODE_OPTIONS=--max-old-space-size=8192`.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, execute, query, queryOne, transaction } from '../pool.js';
import { loadEnv } from '../env.js';
import { sql } from '../sql.js';
import {
  createSnapshot,
  publishSnapshot,
  recordPiiDiscard,
  recordValidation,
  setSnapshotStatus,
  upsertDataset,
} from '../repositories/meta.js';
import { readOsmHeader, readOsmPbf, type OsmWayView } from '../seed/osm-pbf.js';
import {
  OSM_ATTRIBUTION,
  OSM_EXTRACT_URL,
  OSM_LICENSE,
  OSM_POIS_DATASET,
  OSM_ROADS_DATASET,
  POI_CLASSIFIER_KEYS,
  POI_TAG_KEYS,
  ROAD_CLASSES,
  ROAD_TAG_KEYS,
  classifyPoi,
  filterTags,
  roadFromTags,
  safeName,
} from '../seed/osm-tags.js';

// ─── Argumentos ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const has = (name: string): boolean => args.includes(`--${name}`);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PBF_PATH = resolve(
  flag('pbf') ?? resolve(REPO_ROOT, 'data/downloads/osm/colombia-latest.osm.pbf'),
);
const ONLY = flag('only'); // 'roads' | 'pois' | null
const INSPECT = has('inspect');
/** Filas por sentencia de inserción. 2 000 vías ≈ 3 MB de WKT: cabe de sobra en un lote. */
const BATCH = Math.max(200, Math.min(10_000, Number(flag('batch') ?? '2000')));
const EVIDENCE_FILE = 'data-catalog/osm/etiquetas-observadas.json';
/** Deja los POIs y vías sintéticos de la siembra de demostración donde están. */
const KEEP_DEMO = has('keep-demo');

// ─── Utilidades ───────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(msg);
}

function fmt(n: number): string {
  return n.toLocaleString('es-CO');
}

/** Coordenada a texto con 7 decimales (≈1 cm), que es la precisión del formato PBF. */
function coord(v: number): string {
  return v.toFixed(7);
}

// ─── Estructuras de la pasada 1 ───────────────────────────────────────────────

interface RoadStore {
  osmId: number[];
  klass: string[];
  name: (string | null)[];
  surface: (string | null)[];
  isPaved: (boolean | null)[];
  lanes: (number | null)[];
  maxspeed: (number | null)[];
  tagsJson: string[];
  refStart: number[];
  refCount: number[];
}

interface PoiRowStore {
  osmId: number[];
  osmType: string[];
  category: string[];
  subcategory: (string | null)[];
  name: (string | null)[];
  tagsJson: string[];
  lon: number[];
  lat: number[];
}

interface PoiWayStore {
  osmId: number[];
  category: string[];
  subcategory: (string | null)[];
  name: (string | null)[];
  tagsJson: string[];
  refStart: number[];
  refCount: number[];
}

function emptyRoadStore(): RoadStore {
  return {
    osmId: [],
    klass: [],
    name: [],
    surface: [],
    isPaved: [],
    lanes: [],
    maxspeed: [],
    tagsJson: [],
    refStart: [],
    refCount: [],
  };
}

interface ScanResult {
  roads: RoadStore;
  poiPoints: PoiRowStore;
  poiWays: PoiWayStore;
  /** Referencias a nodos, concatenadas: las vías y los POIs de tipo way apuntan aquí. */
  refs: number[];
  neededIds: number[];
  /** Conteo por clase de `highway` ingerida. */
  roadClassCounts: Map<string, number>;
  /** Conteo por categoría de POI. */
  poiCategoryCounts: Map<string, number>;
  /** Etiquetas de POI presentes pero sin mapeo declarado: se reportan, no se ingieren. */
  unmappedPoiTags: Map<string, number>;
  /** Etiquetas excluidas a propósito, con el motivo. */
  excludedPoiTags: Map<string, number>;
  /**
   * Claves de PII descartadas, con su conteo, SEPARADAS por tabla destino: una vía y un POI
   * no traen las mismas etiquetas y el log de `meta.pii_discard_log` es por snapshot.
   */
  piiDropped: {
    roads: Map<string, { ruleId: string; n: number }>;
    pois: Map<string, { ruleId: string; n: number }>;
  };
  /** Nombres descartados porque contenían un teléfono o un correo, por tabla destino. */
  piiNames: { roads: Map<string, number>; pois: Map<string, number> };
  stats: ReturnType<typeof readOsmPbf>;
}

function bump(m: Map<string, number>, k: string): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

/**
 * Pasada 1: selecciona vías y POIs, y acumula las referencias de nodos necesarias.
 * No resuelve geometría: en el PBF los nodos van antes que los ways, así que las
 * coordenadas se buscan en la pasada 2.
 */
function scan(buf: Buffer, want: { roads: boolean; pois: boolean }): ScanResult {
  const roads = emptyRoadStore();
  const poiPoints: PoiRowStore = {
    osmId: [],
    osmType: [],
    category: [],
    subcategory: [],
    name: [],
    tagsJson: [],
    lon: [],
    lat: [],
  };
  const poiWays: PoiWayStore = {
    osmId: [],
    category: [],
    subcategory: [],
    name: [],
    tagsJson: [],
    refStart: [],
    refCount: [],
  };
  const refs: number[] = [];
  const neededIds: number[] = [];
  const roadClassCounts = new Map<string, number>();
  const poiCategoryCounts = new Map<string, number>();
  const unmappedPoiTags = new Map<string, number>();
  const excludedPoiTags = new Map<string, number>();
  const piiDropped = {
    roads: new Map<string, { ruleId: string; n: number }>(),
    pois: new Map<string, { ruleId: string; n: number }>(),
  };
  const piiNames = { roads: new Map<string, number>(), pois: new Map<string, number>() };

  const notePii = (
    target: 'roads' | 'pois',
    dropped: Array<{ key: string; ruleId: string }>,
  ): void => {
    const into = piiDropped[target];
    for (const d of dropped) {
      const prev = into.get(d.key);
      if (prev) prev.n++;
      else into.set(d.key, { ruleId: d.ruleId, n: 1 });
    }
  };

  /** Clasifica y guarda un POI cuya geometría es un punto (nodo). */
  const takePoiNode = (
    id: number,
    lat: number,
    lon: number,
    tags: Record<string, string>,
  ): void => {
    const verdict = classifyPoi((k) => tags[k]);
    if (verdict.kind === 'unmapped') {
      bump(unmappedPoiTags, verdict.tag);
      return;
    }
    if (verdict.kind === 'excluded') {
      bump(excludedPoiTags, verdict.tag);
      return;
    }
    if (verdict.kind === 'none') return;

    const { kept, piiDropped: dropped } = filterTags(tags, [...POI_TAG_KEYS, verdict.poi.key]);
    notePii('pois', dropped);
    const nameCheck = safeName(tags.name);
    if (nameCheck.piiRuleId !== null) bump(piiNames.pois, nameCheck.piiRuleId);

    poiPoints.osmId.push(id);
    poiPoints.osmType.push('n');
    poiPoints.category.push(verdict.poi.category);
    poiPoints.subcategory.push(verdict.poi.subcategory);
    poiPoints.name.push(nameCheck.name);
    poiPoints.tagsJson.push(JSON.stringify(kept));
    poiPoints.lon.push(lon);
    poiPoints.lat.push(lat);
    bump(poiCategoryCounts, verdict.poi.category);
  };

  const takeWayRefs = (way: OsmWayView): { start: number; count: number } => {
    const wayRefs = way.refs();
    const start = refs.length;
    for (const r of wayRefs) {
      refs.push(r);
      neededIds.push(r);
    }
    return { start, count: wayRefs.length };
  };

  const stats = readOsmPbf(buf, {
    nodeTags: want.pois,
    progressEvery: 1000,
    onProgress: (s) =>
      log(
        `    · bloques ${fmt(s.blocks)} · nodos ${fmt(s.nodes)} · ways ${fmt(s.ways)} · ` +
          `${(s.elapsedMs / 1000).toFixed(0)} s`,
      ),
    onNode: want.pois
      ? (id, lat, lon, tags) => {
          if (tags === null) return;
          takePoiNode(id, lat, lon, tags);
        }
      : undefined,
    onWay: (way) => {
      // Vía: se decide con `highway` sin construir el objeto de etiquetas.
      const highway = way.value('highway');
      if (want.roads && highway !== undefined && ROAD_CLASSES.has(highway)) {
        const tags = way.tags();
        const attrs = roadFromTags((k) => tags[k]);
        if (attrs !== null) {
          const { kept, piiDropped: dropped } = filterTags(tags, ROAD_TAG_KEYS);
          notePii('roads', dropped);
          const nameCheck = safeName(attrs.name ?? undefined);
          if (nameCheck.piiRuleId !== null) bump(piiNames.roads, nameCheck.piiRuleId);
          const span = takeWayRefs(way);
          roads.osmId.push(way.id);
          roads.klass.push(attrs.klass);
          roads.name.push(nameCheck.name);
          roads.surface.push(attrs.surface);
          roads.isPaved.push(attrs.isPaved);
          roads.lanes.push(attrs.lanes);
          roads.maxspeed.push(attrs.maxspeedKmh);
          roads.tagsJson.push(JSON.stringify(kept));
          roads.refStart.push(span.start);
          roads.refCount.push(span.count);
          bump(roadClassCounts, attrs.klass);
        }
        return; // una vía no se cuenta además como POI
      }
      if (!want.pois) return;

      // POI dibujado como polígono o línea (supermercados, hoteles, parques…).
      let hasClassifier = false;
      for (const key of POI_CLASSIFIER_KEYS) {
        if (way.hasKey(key)) {
          hasClassifier = true;
          break;
        }
      }
      if (!hasClassifier) return;
      const tags = way.tags();
      const verdict = classifyPoi((k) => tags[k]);
      if (verdict.kind === 'unmapped') {
        bump(unmappedPoiTags, verdict.tag);
        return;
      }
      if (verdict.kind === 'excluded') {
        bump(excludedPoiTags, verdict.tag);
        return;
      }
      if (verdict.kind === 'none') return;

      const { kept, piiDropped: dropped } = filterTags(tags, [...POI_TAG_KEYS, verdict.poi.key]);
      notePii('pois', dropped);
      const nameCheck = safeName(tags.name);
      if (nameCheck.piiRuleId !== null) bump(piiNames.pois, nameCheck.piiRuleId);
      const span = takeWayRefs(way);
      poiWays.osmId.push(way.id);
      poiWays.category.push(verdict.poi.category);
      poiWays.subcategory.push(verdict.poi.subcategory);
      poiWays.name.push(nameCheck.name);
      poiWays.tagsJson.push(JSON.stringify(kept));
      poiWays.refStart.push(span.start);
      poiWays.refCount.push(span.count);
      bump(poiCategoryCounts, verdict.poi.category);
    },
  });

  return {
    roads,
    poiPoints,
    poiWays,
    refs,
    neededIds,
    roadClassCounts,
    poiCategoryCounts,
    unmappedPoiTags,
    excludedPoiTags,
    piiDropped,
    piiNames,
    stats,
  };
}

// ─── Pasada 2: coordenadas de los nodos necesarios ────────────────────────────

interface NodeIndex {
  ids: Float64Array;
  lon: Float64Array;
  lat: Float64Array;
  filled: Uint8Array;
  resolved: number;
}

/** Ordena y quita duplicados. Los ids de OSM caben en un `number` sin perder precisión. */
function uniqueSorted(values: number[]): Float64Array {
  const arr = Float64Array.from(values);
  arr.sort();
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i === 0 || arr[i] !== arr[i - 1]) {
      arr[n++] = arr[i]!;
    }
  }
  return arr.slice(0, n);
}

function indexOfId(ids: Float64Array, id: number): number {
  let lo = 0;
  let hi = ids.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = ids[mid]!;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function resolveNodes(buf: Buffer, neededIds: number[]): NodeIndex {
  const ids = uniqueSorted(neededIds);
  const idx: NodeIndex = {
    ids,
    lon: new Float64Array(ids.length),
    lat: new Float64Array(ids.length),
    filled: new Uint8Array(ids.length),
    resolved: 0,
  };
  readOsmPbf(buf, {
    // Solo hacen falta coordenadas: no se decodifican las etiquetas de los nodos.
    nodeTags: false,
    progressEvery: 2000,
    onProgress: (s) => log(`    · nodos leídos ${fmt(s.nodes)} · resueltos ${fmt(idx.resolved)}`),
    onNode: (id, lat, lon) => {
      const at = indexOfId(ids, id);
      if (at === -1 || idx.filled[at] === 1) return;
      idx.lon[at] = lon;
      idx.lat[at] = lat;
      idx.filled[at] = 1;
      idx.resolved++;
    },
  });
  return idx;
}

/** WKT de la línea de un way, o `null` si le faltan nodos o degenera en un punto. */
function lineWkt(
  refs: number[],
  start: number,
  count: number,
  nodes: NodeIndex,
): { wkt: string | null; missing: number } {
  const parts: string[] = [];
  let missing = 0;
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  for (let i = 0; i < count; i++) {
    const at = indexOfId(nodes.ids, refs[start + i]!);
    if (at === -1 || nodes.filled[at] === 0) {
      missing++;
      continue;
    }
    const x = nodes.lon[at]!;
    const y = nodes.lat[at]!;
    // Nodos repetidos seguidos producen segmentos de longitud cero.
    if (x === lastX && y === lastY) continue;
    parts.push(`${coord(x)} ${coord(y)}`);
    lastX = x;
    lastY = y;
  }
  if (parts.length < 2) return { wkt: null, missing };
  return { wkt: `LINESTRING(${parts.join(',')})`, missing };
}

/**
 * Punto representativo de un POI dibujado como way.
 *
 * Si el way es un anillo cerrado, se usa el centroide del polígono (fórmula del área, no la
 * media de vértices: la media se desplaza hacia donde hay más vértices). Si es una línea
 * abierta, se usa el punto medio de la lista de vértices.
 */
function wayCentroid(
  refs: number[],
  start: number,
  count: number,
  nodes: NodeIndex,
): { lon: number; lat: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < count; i++) {
    const at = indexOfId(nodes.ids, refs[start + i]!);
    if (at === -1 || nodes.filled[at] === 0) continue;
    xs.push(nodes.lon[at]!);
    ys.push(nodes.lat[at]!);
  }
  if (xs.length === 0) return null;
  if (xs.length < 3) return { lon: xs[0]!, lat: ys[0]! };

  const closed = xs[0] === xs[xs.length - 1] && ys[0] === ys[ys.length - 1];
  if (closed && xs.length >= 4) {
    let area2 = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const cross = xs[i]! * ys[i + 1]! - xs[i + 1]! * ys[i]!;
      area2 += cross;
      cx += (xs[i]! + xs[i + 1]!) * cross;
      cy += (ys[i]! + ys[i + 1]!) * cross;
    }
    if (Math.abs(area2) > 1e-14) {
      return { lon: cx / (3 * area2), lat: cy / (3 * area2) };
    }
  }
  const mid = Math.floor(xs.length / 2);
  return { lon: xs[mid]!, lat: ys[mid]! };
}

// ─── Inserción ────────────────────────────────────────────────────────────────

/**
 * Ejecuta una sentencia pesada en su propia transacción con un `statement_timeout` amplio.
 * El pool viene con 30 s, que es lo correcto para la API y demasiado corto para un lote.
 */
async function heavy(builder: ReturnType<typeof sql>, timeoutMs = 600_000): Promise<number> {
  return transaction(async (client) => {
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`);
    const q = builder.build();
    const res = await client.query(q.text, q.values);
    return res.rowCount ?? 0;
  });
}

interface RoadLoadOutcome {
  inserted: number;
  skippedNoGeometry: number;
  waysWithMissingNodes: number;
}

async function insertRoads(
  scanned: ScanResult,
  nodes: NodeIndex,
  snapshotId: number,
): Promise<RoadLoadOutcome> {
  const r = scanned.roads;
  const total = r.osmId.length;
  let inserted = 0;
  let skippedNoGeometry = 0;
  let waysWithMissingNodes = 0;

  let batch = {
    ids: [] as number[],
    klass: [] as string[],
    name: [] as (string | null)[],
    surface: [] as (string | null)[],
    paved: [] as (boolean | null)[],
    lanes: [] as (number | null)[],
    maxspeed: [] as (number | null)[],
    tags: [] as string[],
    wkt: [] as string[],
  };
  const reset = (): void => {
    batch = {
      ids: [],
      klass: [],
      name: [],
      surface: [],
      paved: [],
      lanes: [],
      maxspeed: [],
      tags: [],
      wkt: [],
    };
  };

  const flush = async (): Promise<void> => {
    if (batch.ids.length === 0) return;
    const n = await heavy(sql`
      INSERT INTO ctx.road (osm_id, class, name, surface, is_paved, lanes, maxspeed_kmh,
                            tags, geom, snapshot_id)
      SELECT t.osm_id, t.klass, t.name, t.surface, t.is_paved, t.lanes, t.maxspeed,
             t.tags::jsonb, ST_Multi(ST_GeomFromText(t.wkt, 4326)), ${snapshotId}
      FROM unnest(
        ${batch.ids}::bigint[], ${batch.klass}::text[], ${batch.name}::text[],
        ${batch.surface}::text[], ${batch.paved}::boolean[], ${batch.lanes}::int[],
        ${batch.maxspeed}::int[], ${batch.tags}::text[], ${batch.wkt}::text[]
      ) AS t(osm_id, klass, name, surface, is_paved, lanes, maxspeed, tags, wkt)
    `);
    inserted += n;
    reset();
    if (inserted % (BATCH * 25) === 0) {
      log(`    · vías insertadas ${fmt(inserted)} de ${fmt(total)}`);
    }
  };

  for (let i = 0; i < total; i++) {
    const geom = lineWkt(scanned.refs, r.refStart[i]!, r.refCount[i]!, nodes);
    if (geom.missing > 0) waysWithMissingNodes++;
    if (geom.wkt === null) {
      skippedNoGeometry++;
      continue;
    }
    batch.ids.push(r.osmId[i]!);
    batch.klass.push(r.klass[i]!);
    batch.name.push(r.name[i]!);
    batch.surface.push(r.surface[i]!);
    batch.paved.push(r.isPaved[i]!);
    batch.lanes.push(r.lanes[i]!);
    batch.maxspeed.push(r.maxspeed[i]!);
    batch.tags.push(r.tagsJson[i]!);
    batch.wkt.push(geom.wkt);
    if (batch.ids.length >= BATCH) await flush();
  }
  await flush();
  return { inserted, skippedNoGeometry, waysWithMissingNodes };
}

interface PoiLoadOutcome {
  insertedPoints: number;
  insertedWays: number;
  skippedNoGeometry: number;
}

async function insertPois(
  scanned: ScanResult,
  nodes: NodeIndex,
  snapshotId: number,
): Promise<PoiLoadOutcome> {
  let insertedPoints = 0;
  let insertedWays = 0;
  let skippedNoGeometry = 0;

  let batch = {
    ids: [] as number[],
    types: [] as string[],
    cats: [] as string[],
    subs: [] as (string | null)[],
    names: [] as (string | null)[],
    tags: [] as string[],
    lon: [] as number[],
    lat: [] as number[],
  };
  const reset = (): void => {
    batch = { ids: [], types: [], cats: [], subs: [], names: [], tags: [], lon: [], lat: [] };
  };

  const flush = async (): Promise<number> => {
    if (batch.ids.length === 0) return 0;
    const n = await heavy(sql`
      INSERT INTO ctx.poi (osm_id, osm_type, category, subcategory, name, tags, geom, h3_r9,
                           snapshot_id)
      SELECT t.osm_id, t.osm_type, t.category, t.subcategory, t.name, t.tags::jsonb,
             ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326),
             h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326), 9),
             ${snapshotId}
      FROM unnest(
        ${batch.ids}::bigint[], ${batch.types}::text[], ${batch.cats}::text[],
        ${batch.subs}::text[], ${batch.names}::text[], ${batch.tags}::text[],
        ${batch.lon}::double precision[], ${batch.lat}::double precision[]
      ) AS t(osm_id, osm_type, category, subcategory, name, tags, lon, lat)
    `);
    reset();
    return n;
  };

  const p = scanned.poiPoints;
  for (let i = 0; i < p.osmId.length; i++) {
    batch.ids.push(p.osmId[i]!);
    batch.types.push('n');
    batch.cats.push(p.category[i]!);
    batch.subs.push(p.subcategory[i]!);
    batch.names.push(p.name[i]!);
    batch.tags.push(p.tagsJson[i]!);
    batch.lon.push(p.lon[i]!);
    batch.lat.push(p.lat[i]!);
    if (batch.ids.length >= BATCH) insertedPoints += await flush();
  }
  insertedPoints += await flush();
  log(`    · POIs de nodo insertados ${fmt(insertedPoints)}`);

  const w = scanned.poiWays;
  for (let i = 0; i < w.osmId.length; i++) {
    const c = wayCentroid(scanned.refs, w.refStart[i]!, w.refCount[i]!, nodes);
    if (c === null) {
      skippedNoGeometry++;
      continue;
    }
    batch.ids.push(w.osmId[i]!);
    batch.types.push('w');
    batch.cats.push(w.category[i]!);
    batch.subs.push(w.subcategory[i]!);
    batch.names.push(w.name[i]!);
    batch.tags.push(w.tagsJson[i]!);
    batch.lon.push(c.lon);
    batch.lat.push(c.lat);
    if (batch.ids.length >= BATCH) insertedWays += await flush();
  }
  insertedWays += await flush();
  log(`    · POIs de polígono insertados ${fmt(insertedWays)}`);

  return { insertedPoints, insertedWays, skippedNoGeometry };
}

// ─── muni_code por cruce espacial ─────────────────────────────────────────────

/**
 * Asigna `muni_code` cruzando con `core.municipality`, que ya tiene la geometría real de los
 * 1 121 municipios con límite publicado por el IGAC.
 *
 * Para una vía se usa el punto medio de la línea: una vía puede atravesar varios municipios y
 * `ctx.road.muni_code` es una sola columna. Queda documentado en el snapshot para que nadie lea
 * la columna como "la vía está entera dentro de ese municipio".
 */
async function assignRoadMuni(snapshotId: number): Promise<{ assigned: number; total: number }> {
  const bounds = await queryOne<{ lo: number; hi: number; n: number }>(sql`
    SELECT COALESCE(min(id), 0) AS lo, COALESCE(max(id), 0) AS hi, count(*)::int AS n
    FROM ctx.road WHERE snapshot_id = ${snapshotId}
  `);
  if (!bounds || bounds.n === 0) return { assigned: 0, total: 0 };

  const step = 50_000;
  let assigned = 0;
  for (let lo = bounds.lo; lo <= bounds.hi; lo += step) {
    const hi = lo + step;
    assigned += await heavy(sql`
      WITH batch AS (
        SELECT id, ST_LineInterpolatePoint(ST_GeometryN(geom, 1), 0.5) AS pt
        FROM ctx.road
        WHERE snapshot_id = ${snapshotId} AND id >= ${lo} AND id < ${hi}
      )
      UPDATE ctx.road r
      SET muni_code = m.code
      FROM batch b
      JOIN core.municipality m ON m.geom && b.pt AND ST_Intersects(m.geom, b.pt)
      WHERE r.id = b.id
    `);
    log(`    · muni_code de vías: ${fmt(assigned)} asignados`);
  }
  return { assigned, total: bounds.n };
}

async function assignPoiMuni(snapshotId: number): Promise<{ assigned: number; total: number }> {
  const bounds = await queryOne<{ lo: number; hi: number; n: number }>(sql`
    SELECT COALESCE(min(id), 0) AS lo, COALESCE(max(id), 0) AS hi, count(*)::int AS n
    FROM ctx.poi WHERE snapshot_id = ${snapshotId}
  `);
  if (!bounds || bounds.n === 0) return { assigned: 0, total: 0 };

  const step = 100_000;
  let assigned = 0;
  for (let lo = bounds.lo; lo <= bounds.hi; lo += step) {
    const hi = lo + step;
    assigned += await heavy(sql`
      UPDATE ctx.poi p
      SET muni_code = m.code
      FROM core.municipality m
      WHERE p.snapshot_id = ${snapshotId} AND p.id >= ${lo} AND p.id < ${hi}
        AND m.geom && p.geom AND ST_Intersects(m.geom, p.geom)
    `);
    log(`    · muni_code de POIs: ${fmt(assigned)} asignados`);
  }
  return { assigned, total: bounds.n };
}

// ─── Validaciones ─────────────────────────────────────────────────────────────

async function validateTable(
  snapshotId: number,
  table: 'ctx.road' | 'ctx.poi',
  bboxCheckId: string,
): Promise<{ invalid: number; outside: number }> {
  await execute(sql`DELETE FROM meta.validation WHERE snapshot_id = ${snapshotId}`);

  const counts =
    table === 'ctx.road'
      ? await queryOne<{ invalid: number; outside: number }>(sql`
          SELECT
            count(*) FILTER (WHERE NOT ST_IsValid(geom))::int AS invalid,
            count(*) FILTER (WHERE NOT ST_Intersects(geom, ST_MakeEnvelope(-82.0, -4.5, -66.5, 13.6, 4326)))::int AS outside
          FROM ctx.road WHERE snapshot_id = ${snapshotId}
        `)
      : await queryOne<{ invalid: number; outside: number }>(sql`
          SELECT
            count(*) FILTER (WHERE NOT ST_IsValid(geom))::int AS invalid,
            count(*) FILTER (WHERE NOT ST_Intersects(geom, ST_MakeEnvelope(-82.0, -4.5, -66.5, 13.6, 4326)))::int AS outside
          FROM ctx.poi WHERE snapshot_id = ${snapshotId}
        `);

  const invalid = counts?.invalid ?? 0;
  const outside = counts?.outside ?? 0;

  await recordValidation({
    snapshotId,
    checkName: 'invalid_geometry',
    severity: invalid > 0 ? 'warning' : 'info',
    passed: invalid === 0,
    affectedRows: invalid,
    message: `${invalid} geometrías inválidas en ${table}.`,
  });
  const outsideSample =
    outside === 0
      ? []
      : table === 'ctx.road'
        ? await query(sql`
            SELECT osm_id, class, round(ST_X(ST_Centroid(geom))::numeric, 4) AS lon,
                   round(ST_Y(ST_Centroid(geom))::numeric, 4) AS lat
            FROM ctx.road WHERE snapshot_id = ${snapshotId}
              AND NOT ST_Intersects(geom, ST_MakeEnvelope(-82.0, -4.5, -66.5, 13.6, 4326))
            LIMIT 20
          `)
        : await query(sql`
            SELECT osm_id, category, subcategory, muni_code,
                   round(ST_X(geom)::numeric, 4) AS lon, round(ST_Y(geom)::numeric, 4) AS lat
            FROM ctx.poi WHERE snapshot_id = ${snapshotId}
              AND NOT ST_Intersects(geom, ST_MakeEnvelope(-82.0, -4.5, -66.5, 13.6, 4326))
            LIMIT 20
          `);

  await recordValidation({
    snapshotId,
    checkName: bboxCheckId,
    severity: outside > 0 ? 'warning' : 'info',
    passed: outside === 0,
    affectedRows: outside,
    message:
      outside === 0
        ? `Todas las geometrías de ${table} caen dentro de la extensión de Colombia ` +
          '(incluye San Andrés y Providencia).'
        : `${outside} geometrías de ${table} caen fuera de la envolvente de referencia ` +
          '(-82,0 −4,5 −66,5 13,6): el extracto de Geofabrik recorta por bbox y arrastra ' +
          'elementos del otro lado de la frontera, y la envolvente tampoco cubre los cayos ' +
          'del norte (Serranilla, Bajo Nuevo). Ninguna queda con `muni_code`, así que no ' +
          'entran en ningún indicador municipal.',
    sample: outsideSample,
  });
  return { invalid, outside };
}

// ─── Inspección (evidencia de la regla 2) ─────────────────────────────────────

function runInspection(buf: Buffer): void {
  const CLASSIFIERS = [...POI_CLASSIFIER_KEYS, 'healthcare'];
  const nodeKeys = new Map<string, number>();
  const wayKeys = new Map<string, number>();
  const highwayValues = new Map<string, number>();
  const classValues = new Map<string, number>();
  const surfaceValues = new Map<string, number>();
  const surfaceByClass = new Map<string, { total: number; withSurface: number }>();

  const stats = readOsmPbf(buf, {
    nodeTags: true,
    progressEvery: 2000,
    onProgress: (s) => log(`    · bloques ${fmt(s.blocks)} · ${(s.elapsedMs / 1000).toFixed(0)} s`),
    onNode: (_id, _lat, _lon, tags) => {
      if (tags === null) return;
      for (const [k, v] of Object.entries(tags)) {
        bump(nodeKeys, k);
        if (CLASSIFIERS.includes(k)) bump(classValues, `${k}=${v}`);
      }
    },
    onWay: (way) => {
      const tags = way.tags();
      for (const [k, v] of Object.entries(tags)) {
        bump(wayKeys, k);
        if (CLASSIFIERS.includes(k)) bump(classValues, `${k}=${v}`);
      }
      const hw = tags.highway;
      if (hw === undefined) return;
      bump(highwayValues, hw);
      const s = surfaceByClass.get(hw) ?? { total: 0, withSurface: 0 };
      s.total++;
      if (tags.surface !== undefined) {
        s.withSurface++;
        bump(surfaceValues, tags.surface);
      }
      surfaceByClass.set(hw, s);
    },
  });

  const top = (m: Map<string, number>, n: number): Array<[string, number]> =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const out = {
    aviso:
      'Evidencia de la regla 2 de CLAUDE.md: histograma REAL de etiquetas del extracto. ' +
      'El mapeo declarado en packages/db/src/seed/osm-tags.ts solo usa valores de aquí.',
    extracto: OSM_EXTRACT_URL,
    licencia: OSM_LICENSE,
    atribucion: OSM_ATTRIBUTION,
    inspeccionadoEn: new Date().toISOString(),
    estadisticas: stats,
    clavesDeNodo: top(nodeKeys, 250),
    clavesDeWay: top(wayKeys, 250),
    valoresDeHighway: top(highwayValues, 120),
    valoresClasificadores: top(classValues, 1200),
    valoresDeSurface: top(surfaceValues, 120),
    surfacePorClase: [...surfaceByClass.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([k, v]) => ({
        clase: k,
        vias: v.total,
        conSurface: v.withSurface,
        pctConSurface: Number(((100 * v.withSurface) / v.total).toFixed(1)),
      })),
  };
  const path = resolve(REPO_ROOT, EVIDENCE_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  log(`\n  Evidencia escrita en ${EVIDENCE_FILE}`);
  log(
    `  ${fmt(stats.nodes)} nodos · ${fmt(stats.taggedNodes)} con etiquetas · ` +
      `${fmt(stats.ways)} ways · ${fmt(stats.relations)} relaciones`,
  );
}

// ─── Programa ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();
  const startedAt = Date.now();

  if (!existsSync(PBF_PATH)) {
    throw new Error(
      `No existe el extracto ${PBF_PATH}.\n` +
        `Descárgalo antes con:\n  curl -L -o data/downloads/osm/colombia-latest.osm.pbf ${OSM_EXTRACT_URL}`,
    );
  }

  log('Carga de OpenStreetMap — red vial y puntos de interés de Colombia\n');
  log(`  extracto: ${PBF_PATH}`);
  const buf = readFileSync(PBF_PATH);
  log(`  tamaño: ${fmt(Math.round(buf.length / 1e6))} MB`);

  // Integridad: el md5 que publica Geofabrik junto al fichero.
  const md5 = createHash('md5').update(buf).digest('hex');
  const md5SidecarPath = `${PBF_PATH}.md5`;
  let md5Published: string | null = null;
  if (existsSync(md5SidecarPath)) {
    md5Published = readFileSync(md5SidecarPath, 'utf8').trim().split(/\s+/)[0] ?? null;
  }
  const md5Ok = md5Published === null ? null : md5Published === md5;
  const sha256 = createHash('sha256').update(buf).digest('hex');
  log(
    `  md5: ${md5} ${md5Ok === null ? '(sin .md5 publicado para comparar)' : md5Ok ? '✔ coincide con el .md5 de Geofabrik' : '✘ NO coincide'}`,
  );
  if (md5Ok === false) {
    throw new Error(
      'El md5 del fichero no coincide con el que publica Geofabrik: la descarga está ' +
        'corrupta o incompleta. No se ingiere nada.',
    );
  }

  const header = readOsmHeader(buf);
  const cutDate = (header.replicationTimestamp ?? new Date().toISOString()).slice(0, 10);
  log(
    `  corte declarado por el fichero: ${cutDate} (${header.replicationTimestamp ?? 'sin sello'})`,
  );
  log(`  programa que lo escribió: ${header.writingProgram ?? 'NO_DISPONIBLE'}`);
  log(`  bbox: ${JSON.stringify(header.bbox)}\n`);

  if (INSPECT) {
    log('  Modo inspección: no se escribe nada en la base.\n');
    runInspection(buf);
    return;
  }

  const wantRoads = ONLY !== 'pois';
  const wantPois = ONLY !== 'roads';

  // ── Pasada 1 ──
  log('  Pasada 1/2 · seleccionando vías y POIs del extracto');
  const scanned = scan(buf, { roads: wantRoads, pois: wantPois });
  log(
    `    → ${fmt(scanned.roads.osmId.length)} vías, ` +
      `${fmt(scanned.poiPoints.osmId.length)} POIs de nodo, ` +
      `${fmt(scanned.poiWays.osmId.length)} POIs de polígono, ` +
      `${fmt(scanned.neededIds.length)} referencias a nodos ` +
      `(${(scanned.stats.elapsedMs / 1000).toFixed(0)} s)\n`,
  );

  // ── Pasada 2 ──
  log('  Pasada 2/2 · resolviendo coordenadas de los nodos necesarios');
  const nodes = resolveNodes(buf, scanned.neededIds);
  const unresolved = nodes.ids.length - nodes.resolved;
  log(
    `    → ${fmt(nodes.resolved)} de ${fmt(nodes.ids.length)} nodos resueltos` +
      `${unresolved > 0 ? ` · ${fmt(unresolved)} sin coordenada en el extracto` : ''}\n`,
  );

  // ── Datasets y snapshots ──
  for (const d of [OSM_ROADS_DATASET, OSM_POIS_DATASET]) {
    await upsertDataset({
      id: d.id,
      source: d.source,
      name: d.name,
      description: d.description,
      license: d.license,
      attribution: d.attribution,
      url: d.url,
      frequency: d.frequency,
      connector: d.connector,
      format: d.format,
      source_srid: d.sourceSrid,
      target_table: d.targetTable,
      share_alike: d.shareAlike, // ODbL 1.0 = compartir-igual (regla 4)
      notes: d.notes,
    });
  }

  const commonStats = {
    extracto: OSM_EXTRACT_URL,
    fichero: 'colombia-latest.osm.pbf',
    md5: md5,
    md5_publicado_por_geofabrik: md5Published ?? 'NO_DISPONIBLE',
    sha256,
    corte_declarado_por_el_fichero: header.replicationTimestamp,
    escrito_por: header.writingProgram,
    herramienta_de_carga: 'lector propio de PBF (packages/db/src/seed/osm-pbf.ts), ADR-010',
    licencia: OSM_LICENSE,
    atribucion: OSM_ATTRIBUTION,
    share_alike: true,
    nodos_en_el_extracto: scanned.stats.nodes,
    ways_en_el_extracto: scanned.stats.ways,
    relaciones_en_el_extracto: scanned.stats.relations,
    relaciones_ingeridas: 0,
    nota_relaciones:
      'Las relaciones (multipolígonos) NO se ingieren: 37 868 en el extracto, y armar su ' +
      'geometría exige ensamblar los ways miembros. Queda declarado como faltante.',
  };

  /** Etiquetas de PII descartadas en la tabla indicada, para `meta.snapshot.stats`. */
  const piiStats = (target: 'roads' | 'pois') => ({
    etiquetas_pii_descartadas: Object.fromEntries(
      [...scanned.piiDropped[target].entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([k, v]) => [k, v.n]),
    ),
    nombres_descartados_por_pii: Object.fromEntries(scanned.piiNames[target]),
  });

  let roadSummary: Record<string, unknown> | null = null;
  let poiSummary: Record<string, unknown> | null = null;

  // ── Vías ──
  if (wantRoads) {
    log('  Cargando ctx.road');
    const snap = await createSnapshot({
      datasetId: OSM_ROADS_DATASET.id,
      cutDate,
      isSynthetic: false,
      sourceUrl: OSM_EXTRACT_URL,
      checksum: sha256,
      stageMethod: 'node-pbf',
    });
    await setSnapshotStatus(snap.id, 'staged');
    // Idempotencia: recargar el mismo corte no duplica filas.
    const deleted = await heavy(sql`DELETE FROM ctx.road WHERE snapshot_id = ${snap.id}`);
    if (deleted > 0) log(`    · ${fmt(deleted)} filas previas de este corte eliminadas`);

    const outcome = await insertRoads(scanned, nodes, snap.id);
    log(`    → ${fmt(outcome.inserted)} vías insertadas`);
    // Sin estadísticas frescas el planificador cree que la tabla sigue teniendo 4 filas y
    // elige planes absurdos para el cruce espacial que viene a continuación.
    await execute('ANALYZE ctx.road');
    const muni = await assignRoadMuni(snap.id);
    const checks = await validateTable(snap.id, 'ctx.road', 'osm-bbox');

    await recordValidation({
      snapshotId: snap.id,
      checkName: 'osm-checksum',
      severity: 'info',
      passed: md5Ok === true,
      message:
        md5Ok === true
          ? `md5 del extracto verificado contra el .md5 de Geofabrik (${md5}).`
          : `md5 del extracto: ${md5}. Geofabrik no publicó .md5 para comparar.`,
    });
    await recordValidation({
      snapshotId: snap.id,
      checkName: 'road-class-domain',
      severity: 'info',
      passed: true,
      affectedRows: outcome.inserted,
      message:
        'Distribución de `highway=*` ingerida: ' +
        [...scanned.roadClassCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${fmt(v)}`)
          .join(', ') +
        '. En Colombia no existe ninguna vía `highway=motorway`: la red principal es `trunk`.',
      sample: [...scanned.roadClassCounts.entries()].map(([clase, n]) => ({ clase, n })),
    });
    await recordValidation({
      snapshotId: snap.id,
      checkName: 'orphan_geometry',
      severity: outcome.skippedNoGeometry > 0 ? 'warning' : 'info',
      passed: outcome.skippedNoGeometry === 0,
      affectedRows: outcome.skippedNoGeometry,
      message:
        `${fmt(outcome.skippedNoGeometry)} vías descartadas por no tener dos vértices con ` +
        `coordenada en el extracto; ${fmt(outcome.waysWithMissingNodes)} vías perdieron algún ` +
        'vértice (ways que cruzan la frontera del recorte de Geofabrik).',
    });

    const surface = await queryOne<{
      total: number;
      con_surface: number;
      pavimentadas: number;
    }>(sql`
      SELECT count(*)::int AS total,
             count(surface)::int AS con_surface,
             count(*) FILTER (WHERE is_paved)::int AS pavimentadas
      FROM ctx.road WHERE snapshot_id = ${snap.id}
    `);
    const sinMuni = await queryOne<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM ctx.road WHERE snapshot_id = ${snap.id} AND muni_code IS NULL
    `);

    roadSummary = {
      ...commonStats,
      ...piiStats('roads'),
      filas: outcome.inserted,
      vias_por_clase: Object.fromEntries(scanned.roadClassCounts),
      vias_con_surface: surface?.con_surface ?? 0,
      vias_pavimentadas_segun_surface: surface?.pavimentadas ?? 0,
      nota_is_paved:
        '`is_paved` se deriva SOLO de la etiqueta `surface`. Sin `surface` queda NULL: no se ' +
        'infiere por clase de vía. Esto afecta a `dist_paved_road_m` y a `road_access_score`, ' +
        'que declararán el faltante en vez de suponer pavimento.',
      muni_code_asignado: muni.assigned,
      muni_code_nulo: sinMuni?.n ?? 0,
      nota_muni_code:
        'El municipio se asigna por el PUNTO MEDIO de la vía. Una vía puede atravesar varios ' +
        'municipios: `muni_code` indica dónde está su punto medio, no que esté contenida.',
      geometrias_invalidas: checks.invalid,
      geometrias_fuera_de_colombia: checks.outside,
      clases_de_highway_excluidas:
        'footway, path, pedestrian, steps, bridleway, cycleway, corridor, construction, ' +
        'proposed, planned, busway, ladder, raceway, platform, bus_stop, services, rest_area, ' +
        'elevator, escape, emergency_access_point y valores erróneos de tecleo.',
    };

    await setSnapshotStatus(snap.id, 'transformed', {
      rowCount: outcome.inserted,
      stats: roadSummary,
    });
    await logPiiDiscards(scanned, 'roads', snap.id, OSM_ROADS_DATASET.id, 'ways con highway=*');
    await publishSnapshot(snap.id);
    log(`    ✔ snapshot ${snap.id} publicado (corte ${cutDate})\n`);

    if (!KEEP_DEMO) await retireDemoRoads();
  }

  // ── POIs ──
  if (wantPois) {
    log('  Cargando ctx.poi');
    const snap = await createSnapshot({
      datasetId: OSM_POIS_DATASET.id,
      cutDate,
      isSynthetic: false,
      sourceUrl: OSM_EXTRACT_URL,
      checksum: sha256,
      stageMethod: 'node-pbf',
    });
    await setSnapshotStatus(snap.id, 'staged');
    const deleted = await heavy(sql`DELETE FROM ctx.poi WHERE snapshot_id = ${snap.id}`);
    if (deleted > 0) log(`    · ${fmt(deleted)} filas previas de este corte eliminadas`);

    const outcome = await insertPois(scanned, nodes, snap.id);
    await execute('ANALYZE ctx.poi');
    const muni = await assignPoiMuni(snap.id);
    const checks = await validateTable(snap.id, 'ctx.poi', 'osm-bbox');

    const unmapped = [...scanned.unmappedPoiTags.entries()].sort((a, b) => b[1] - a[1]);
    await recordValidation({
      snapshotId: snap.id,
      checkName: 'poi-category-mapping',
      severity: unmapped.length > 0 ? 'warning' : 'info',
      passed: unmapped.length === 0,
      affectedRows: unmapped.reduce((a, [, n]) => a + n, 0),
      message:
        `${fmt(outcome.insertedPoints + outcome.insertedWays)} POIs mapeados a las 7 categorías ` +
        `del producto. ${unmapped.length} etiquetas aparecieron sin mapeo declarado y NO se ` +
        'ingirieron (se reportan para revisión, no se muestran).',
      sample: unmapped.slice(0, 50).map(([tag, n]) => ({ tag, n })),
    });
    await recordValidation({
      snapshotId: snap.id,
      checkName: 'poi-no-personal-tags',
      severity: 'info',
      passed: true,
      affectedRows: [...scanned.piiDropped.pois.values()].reduce((a, v) => a + v.n, 0),
      message:
        'Etiquetas de contacto y dirección descartadas antes de escribir (lista blanca en ' +
        'osm-tags.ts): ' +
        [...scanned.piiDropped.pois.entries()]
          .sort((a, b) => b[1].n - a[1].n)
          .slice(0, 15)
          .map(([k, v]) => `${k} ${fmt(v.n)}`)
          .join(', ') +
        '. En ctx.poi solo hay categoría, subcategoría, nombre del establecimiento y las ' +
        'etiquetas de la lista blanca.',
    });

    const sinMuni = await queryOne<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM ctx.poi WHERE snapshot_id = ${snap.id} AND muni_code IS NULL
    `);

    poiSummary = {
      ...commonStats,
      ...piiStats('pois'),
      filas: outcome.insertedPoints + outcome.insertedWays,
      poi_de_nodo: outcome.insertedPoints,
      poi_de_poligono: outcome.insertedWays,
      nota_poligonos:
        'Los POIs dibujados como polígono se guardan en su centroide (fórmula del área). ' +
        '`ctx.poi.geom` es `geometry(Point,4326)`.',
      poi_por_categoria: Object.fromEntries(scanned.poiCategoryCounts),
      etiquetas_sin_mapeo: Object.fromEntries(unmapped.slice(0, 100)),
      etiquetas_excluidas_a_proposito: Object.fromEntries(
        [...scanned.excludedPoiTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100),
      ),
      nota_educacion_salud:
        'amenity=school/college/university/kindergarten y hospital/clinic/doctors/dentist NO ' +
        'se ingieren: las fuentes oficiales son el MEN (ctx.school) y el REPS ' +
        '(ctx.health_facility). Ingerirlas duplicaría los conteos.',
      muni_code_asignado: muni.assigned,
      muni_code_nulo: sinMuni?.n ?? 0,
      geometrias_invalidas: checks.invalid,
      geometrias_fuera_de_colombia: checks.outside,
      nota_cobertura:
        'La cobertura de OSM es desigual: alta en ciudades grandes y baja en zonas rurales. ' +
        'Un conteo bajo de POIs puede significar poco comercio o poco mapeo (regla 6).',
    };

    await setSnapshotStatus(snap.id, 'transformed', {
      rowCount: outcome.insertedPoints + outcome.insertedWays,
      stats: poiSummary,
    });
    await logPiiDiscards(
      scanned,
      'pois',
      snap.id,
      OSM_POIS_DATASET.id,
      'nodos y ways con amenity/shop/…',
    );
    await publishSnapshot(snap.id);
    log(`    ✔ snapshot ${snap.id} publicado (corte ${cutDate})\n`);

    if (!KEEP_DEMO) await retireDemoPois();
  }

  // ── Informe final ──
  await report(cutDate, startedAt, wantRoads, wantPois);
}

/**
 * Registra en `meta.pii_discard_log` qué claves se descartaron y cuántas veces (nunca el
 * valor, regla 3). Borra primero lo anterior del mismo snapshot para que recargar el corte no
 * acumule conteos duplicados.
 */
async function logPiiDiscards(
  scanned: ScanResult,
  target: 'roads' | 'pois',
  snapshotId: number,
  datasetId: string,
  layer: string,
): Promise<void> {
  await execute(sql`DELETE FROM meta.pii_discard_log WHERE snapshot_id = ${snapshotId}`);
  for (const [key, { n }] of scanned.piiDropped[target]) {
    await recordPiiDiscard({
      snapshotId,
      datasetId,
      sourceLayer: layer,
      columnName: key,
      reason: 'blocklist_pattern',
      occurrences: n,
    });
  }
  for (const [ruleId, n] of scanned.piiNames[target]) {
    await recordPiiDiscard({
      snapshotId,
      datasetId,
      sourceLayer: layer,
      columnName: `name (heurística ${ruleId})`,
      reason: 'content_heuristic',
      occurrences: n,
    });
  }
}

/**
 * Retira las 4 vías sintéticas de la siembra de demostración.
 *
 * `demo-roads` existe porque no había red vial real. Ahora la hay, y las consultas del
 * producto filtran por `is_active` sin distinguir fuentes: dejar los dos cortes activos
 * mezclaría 4 vías inventadas con el dato nacional. El snapshot se marca `superseded` y sus
 * filas se borran; el dataset y su linaje se conservan. `pnpm db:seed` las volvería a crear.
 */
async function retireDemoRoads(): Promise<void> {
  const n = await execute(sql`
    DELETE FROM ctx.road WHERE snapshot_id IN (
      SELECT id FROM meta.snapshot WHERE dataset_id = 'demo-roads'
    )
  `);
  await execute(sql`
    UPDATE meta.snapshot SET is_active = FALSE, status = 'superseded',
      error_message = NULL
    WHERE dataset_id = 'demo-roads'
  `);
  if (n > 0) log(`    · ${n} vías sintéticas de demo-roads retiradas (las reemplaza OSM)`);
}

/**
 * Retira los POIs sintéticos de `demo-facilities`. Ese snapshot sigue activo porque también
 * tiene los colegios e IPS de demostración, que no son de este dataset: solo se borran sus
 * filas de `ctx.poi`.
 */
async function retireDemoPois(): Promise<void> {
  const n = await execute(sql`
    DELETE FROM ctx.poi WHERE snapshot_id IN (
      SELECT id FROM meta.snapshot WHERE is_synthetic
    )
  `);
  if (n > 0) log(`    · ${n} POIs sintéticos retirados (los reemplaza OSM)`);
}

async function report(
  cutDate: string,
  startedAt: number,
  wantRoads: boolean,
  wantPois: boolean,
): Promise<void> {
  log('─'.repeat(78));
  log(`Resumen de la carga (corte ${cutDate})`);
  log('─'.repeat(78));

  if (wantRoads) {
    const byClass = await query<{ class: string; n: number; pav: number }>(sql`
      SELECT r.class, count(*)::int AS n, count(*) FILTER (WHERE r.is_paved)::int AS pav
      FROM ctx.road r
      JOIN meta.snapshot s ON s.id = r.snapshot_id AND s.is_active
      GROUP BY r.class ORDER BY n DESC
    `);
    log('\nVías por clase (snapshot activo):');
    for (const row of byClass) {
      log(`  ${row.class.padEnd(16)} ${fmt(row.n).padStart(9)}  pavimentadas: ${fmt(row.pav)}`);
    }
  }

  if (wantPois) {
    const byCat = await query<{ category: string; n: number }>(sql`
      SELECT p.category, count(*)::int AS n
      FROM ctx.poi p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      GROUP BY p.category ORDER BY n DESC
    `);
    log('\nPOIs por categoría (snapshot activo):');
    for (const row of byCat) log(`  ${row.category.padEnd(16)} ${fmt(row.n).padStart(9)}`);
  }

  const dept = await query<{
    dept_code: string;
    dept_name: string;
    roads: number;
    pois: number;
    munis_con_via: number;
    munis: number;
  }>(sql`
    WITH m AS (
      SELECT m.code, m.dept_code FROM core.municipality m
    ),
    r AS (
      SELECT muni_code, count(*)::int AS n FROM ctx.road r
      JOIN meta.snapshot s ON s.id = r.snapshot_id AND s.is_active
      WHERE muni_code IS NOT NULL GROUP BY muni_code
    ),
    p AS (
      SELECT muni_code, count(*)::int AS n FROM ctx.poi p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      WHERE muni_code IS NOT NULL GROUP BY muni_code
    )
    SELECT d.code AS dept_code, d.name AS dept_name,
           COALESCE(sum(r.n), 0)::int AS roads,
           COALESCE(sum(p.n), 0)::int AS pois,
           count(r.muni_code)::int AS munis_con_via,
           count(m.code)::int AS munis
    FROM core.department d
    JOIN m ON m.dept_code = d.code
    LEFT JOIN r ON r.muni_code = m.code
    LEFT JOIN p ON p.muni_code = m.code
    GROUP BY d.code, d.name
    ORDER BY d.code
  `);

  log('\nCobertura por departamento (regla 6):');
  log(
    `  ${'cód'.padEnd(4)} ${'departamento'.padEnd(30)} ${'vías'.padStart(9)} ${'POIs'.padStart(8)}  municipios con vía`,
  );
  for (const d of dept) {
    log(
      `  ${d.dept_code.padEnd(4)} ${d.dept_name.slice(0, 30).padEnd(30)} ` +
        `${fmt(d.roads).padStart(9)} ${fmt(d.pois).padStart(8)}  ${d.munis_con_via}/${d.munis}`,
    );
  }

  log(`\nTiempo total: ${((Date.now() - startedAt) / 1000 / 60).toFixed(1)} min`);
  log(`Atribución obligatoria: ${OSM_ATTRIBUTION} · licencia ${OSM_LICENSE} (compartir-igual)`);
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error('\nFalló la carga de OSM:', err instanceof Error ? err.message : err);
    await closePool();
    process.exitCode = 1;
  });
