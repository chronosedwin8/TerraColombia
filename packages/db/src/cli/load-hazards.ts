#!/usr/bin/env node
/**
 * Carga de amenazas naturales reales en `ctx.hazard` (SGC e IDEAM).
 *
 * POR QUÉ ESTE CARGADOR EXISTE
 * ───────────────────────────
 * `etl/config/datasets/environment.ts` declaraba el dataset `sgc-ideam-amenazas` con
 * `fieldMapping: NOT_INSPECTED` y `connector: 'manual'`, porque la Fase 0 nunca añadió los
 * servicios del SGC ni del IDEAM al registro de fuentes. La regla 2 de CLAUDE.md prohíbe
 * ingerir a ciegas, así que el semáforo de aptitud respondía «sin datos suficientes» en todo
 * el país. Aquí se cierran los tres huecos con servicios que SÍ responden, inspeccionados con
 * peticiones reales el 2026-09-21 (cada URL y cada nombre de campo están abajo, verbatim).
 *
 * LO QUE SE INSPECCIONÓ DE VERDAD (2026-09-21)
 * ────────────────────────────────────────────
 * 1) Directorio raíz del SGC: `https://srvags.sgc.gov.co/arcgis/rest/services?f=json`
 *    → responde 200 con 52 carpetas, entre ellas `SIMMA`, `Amenaza_Sismica`,
 *      `Zonas_amenaza_Sismica_NR10` y `Mapa_Nacional_Amenaza_Mov_Masa_100K`.
 *
 * 2) `SIMMA/CapasTematicasXEscalas/MapServer?f=json` → `capabilities: "Map,Query,Data"`,
 *    `copyrightText: "Servicio geologico Colombiano"`. Agrupa la zonificación de amenaza por
 *    movimientos en masa POR ESCALA, que es exactamente la honestidad que pide la regla 6.
 *    Conteos medidos capa por capa con `?where=1=1&returnCountOnly=true`:
 *      L10 1:2.000 (4 polígonos)      L14 1:50.000 (4)
 *      L11 1:5.000 (53)               L15 1:100.000 (890)   ← la que se carga
 *      L12 1:10.000 (9)               L16 1:500.000 (78)
 *      L13 1:25.000 (5 501)           L17 1:1.500.000 (5)
 *    y además «Amenazas por flujos» (flujos torrenciales / de detritos):
 *      L20 susceptibilidad 1:100.000 (1 205)  L22 1:2.000 (0)  L23 1:5.000 (8 350)
 *      L24 1:10.000 (0)  L25 1:25.000 (764)
 *    Campos REALES de las capas de amenaza: `OBJECTID, CATAME, LEYENDA, PLANCHA, MAPA`
 *    (`PLANCHA` solo aparece en la de 1:100.000). Campos de las de flujos:
 *    `OBJECTID, CATAMEFLU, LEYENDA`. La de susceptibilidad usa `SUSMM` (entero 1..5).
 *
 *    POR QUÉ SOLO SE CARGA LA DE 1:100.000: se midió el peso real de la descarga pidiendo 10
 *    entidades con geometría a cada capa (`geometryPrecision=6`, `f=geojson`):
 *      L15 1:100.000 → 24,9 MB / 10 entidades  ⇒ 890 entidades ≈ 2,2 GB
 *      L13 1:25.000  → 20,4 MB / 10 entidades  ⇒ 5 501 entidades ≈ 11 GB
 *      L11 1:5.000   → 12,0 MB / 10 entidades  ⇒ 53 entidades ≈ 63 MB
 *    Los polígonos de detalle son extraordinariamente densos y el servidor sirve a ~1 MB/s.
 *    Se carga la de 1:100.000, que es la única con cobertura regional real (256 planchas del
 *    índice 1:100.000, medido con `returnDistinctValues` sobre `PLANCHA`), y las demás quedan
 *    declaradas como PENDIENTES en `etl/config/datasets/environment.ts` con su peso medido.
 *    Para bajar el volumen a algo servible se usa `maxAllowableOffset` (ver GENERALIZATION).
 *
 * 3) `Zonas_amenaza_Sismica_NR10/Zonas_Amenaza_NSR_10/FeatureServer?f=json` → dos capas;
 *    la capa 1 `Zonas_amenaza` tiene 6 polígonos y campos REALES `OBJECTID, ID, VALOR`.
 *    Es la zonificación de amenaza sísmica del Reglamento NSR-10.
 *
 * 4) IDEAM, vía datos.gov.co (Socrata). `https://www.datos.gov.co/api/views/u8t2-ja2c.json`
 *    declara literalmente:
 *      name:        "Amenaza de Inundación Período de Retorno 100 Años 79 Centros Poblados"
 *      attribution: "Instituto de Hidrología, Meteorología y Estudios Ambientales - IDEAM,
 *                    Bogotá D.C."
 *      license:     "Creative Commons Attribution | Share Alike 4.0 International"
 *    Campos REALES: `the_geom, amenaza, cenpob, municipio, departamen, area_tot, ano,
 *    shape_leng, ruleid, shape_area, shape_len`.
 *
 * LO QUE NO SE PUDO CONSEGUIR (y por qué no se rellena con nada)
 * ─────────────────────────────────────────────────────────────
 *  - `geoservicios.ideam.gov.co` (el GeoServer del IDEAM) NO resuelve por DNS hoy: cero
 *    respuesta, ni por HTTP ni por HTTPS. El único camino al dato del IDEAM que respondió es
 *    datos.gov.co.
 *  - No existe capa nacional de amenaza por inundación. Lo que el IDEAM publica son 5 cortes
 *    por período de retorno (TR 2, 10, 20, 50 y 100 años) sobre 79, 35, 25, 36 y 79 centros
 *    poblados. Aquí se carga el de TR 100 años, que es el de mayor cobertura y el criterio
 *    de planificación habitual; los otros cuatro quedan anotados en `etl/config`.
 *  - NUNCA se rellena un hueco con «baja». La ausencia de estudio no entra a `ctx.hazard`:
 *    el municipio sin polígono simplemente no tiene fila, y la cobertura se declara en
 *    `meta.snapshot.stats` y en `meta.validation` con cifras.
 *
 * USO
 *   pnpm --filter @terracolombia/db load:hazards
 *   pnpm --filter @terracolombia/db load:hazards -- --only=flood
 *   pnpm --filter @terracolombia/db load:hazards -- --only=mass-movement --no-publish
 */
import { closePool, createPool, execute, query, queryOne, setPool, transaction } from '../pool.js';
import { loadEnv } from '../env.js';
import { sql } from '../sql.js';
import {
  clearValidations,
  createSnapshot,
  publishSnapshot,
  recordValidation,
  setSnapshotStatus,
  upsertDataset,
} from '../repositories/meta.js';

// ─── Argumentos ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
function has(name: string): boolean {
  return args.includes(`--${name}`);
}

type Target = 'mass-movement' | 'seismic' | 'flood';
const ONLY = flag('only') as Target | null;
const NO_PUBLISH = has('no-publish');

/** Fecha de la consulta. Es lo único cierto cuando la fuente no declara fecha de corte. */
const CONSULTED_ON = new Date().toISOString().slice(0, 10);

/**
 * El pool por omisión corta las consultas a los 30 s. Insertar un polígono de 2,5 MB con
 * `ST_MakeValid` y contar la cobertura contra los 1 122 municipios pasa de ahí sin problema, y
 * la consulta abortada tiraría la carga entera después de media hora de descarga. Se abre un
 * pool propio con un tope holgado; es un cargador de lote, no una petición de usuario.
 */
function openPoolWithLongTimeout(): void {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definida. Copia .env.example a .env.');
  }
  setPool(
    createPool({
      connectionString,
      max: 4,
      statementTimeoutMs: 900_000,
      applicationName: 'terracolombia-load-hazards',
    }),
  );
}

// ─── Normalización del nivel de amenaza ───────────────────────────────────────

/**
 * Mapeo de texto de la fuente a `ctx.hazard.level_rank` (1..5).
 *
 * Las claves NO son inventadas: son los valores que devuelven las fuentes, normalizados a
 * minúsculas sin acentos. Están tomados de:
 *  - `CATAME` / `CATAMEFLU` del SGC (SIMMA): el `drawingInfo.renderer.uniqueValueInfos` de las
 *    capas 13, 14, 15 y 23 declara exactamente {"Muy Alta", "Alta", "Media", "Baja"}.
 *  - `VALOR` de la zonificación NSR-10: el renderer declara {"Alta", "Intermedia", "Baja"}.
 *  - `amenaza` del IDEAM: medido con `$group=amenaza` sobre las cinco tablas de Socrata, el
 *    dominio real y completo es {"ALTA", "MEDIA", "BAJA"} (p. ej. en TR 100 años:
 *    ALTA 3 380 filas, MEDIA 17 832, BAJA 27 942).
 *
 * `muy baja` se incluye porque la escala ordinal de `ctx.hazard.level_rank` va de 1 a 5 y el
 * rango 1 tiene que existir; ninguna de las tres fuentes cargadas lo usa, y si apareciera
 * quedaría mapeado sin sorpresas. Un valor FUERA de esta tabla NO se adivina: la fila se carga
 * con `level_rank = NULL` (el CHECK de la tabla lo permite) y se reporta en `meta.validation`.
 */
const LEVEL_RANKS: Readonly<Record<string, number>> = {
  'muy baja': 1,
  baja: 2,
  media: 3,
  moderada: 3,
  intermedia: 3,
  alta: 4,
  'muy alta': 5,
};

/** Minúsculas, sin acentos, espacios colapsados. No cambia el valor que se guarda en `level`. */
function foldLevel(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rankOf(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  return LEVEL_RANKS[foldLevel(text)] ?? null;
}

// ─── Descarga con reintentos ──────────────────────────────────────────────────

interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
}
interface GeoJsonCollection {
  features?: GeoJsonFeature[];
  error?: { code: number; message: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Tope de tiempo duro por intento. Igual que en `load-admin-boundaries.ts`: con estos
 * servicios un `AbortController` solo no basta, la petición se queda colgada y el cargador
 * se para en seco sin error ni reintento.
 */
async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Tiempo agotado (${timeoutMs} ms) en ${label}`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, label: string, attempts = 4, timeoutMs = 120_000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withDeadline(
        async (signal) => {
          const res = await fetch(url, {
            signal,
            headers: {
              'User-Agent': process.env.ETL_USER_AGENT ?? 'TerraColombia/0.1',
              Accept: 'application/json',
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // Un bloqueo de WAF llega con 200 y cuerpo HTML: no es JSON y hay que reintentar.
          const body = JSON.parse(await res.text()) as T & { error?: { code: number; message: string } };
          if (body.error) throw new Error(`${body.error.code}: ${body.error.message}`);
          return body as T;
        },
        timeoutMs,
        label,
      );
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await sleep(2000 * attempt);
    }
  }
  throw new Error(
    `Se agotaron los ${attempts} intentos contra ${label}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

// ─── Declaración de las capas de origen ───────────────────────────────────────

const SGC_SIMMA =
  'https://srvags.sgc.gov.co/arcgis/rest/services/SIMMA/CapasTematicasXEscalas/MapServer';
const SGC_NSR10 =
  'https://srvags.sgc.gov.co/arcgis/rest/services/Zonas_amenaza_Sismica_NR10/Zonas_Amenaza_NSR_10/FeatureServer';
const IDEAM_FLOOD_TR100 = 'https://www.datos.gov.co/resource/u8t2-ja2c';

/**
 * Capa de un servicio ArcGIS con su escala declarada.
 *
 * `scale` es el texto que va a `ctx.hazard.scale`, y sale del NOMBRE de la capa en el
 * servicio (las capas se llaman literalmente «2K», «5K», «100K»… bajo los grupos
 * «Zonificación de Amenaza» y «Amenazas por flujos»). No se inventa ninguna escala.
 */
interface ArcgisHazardLayer {
  readonly layerId: number;
  readonly scale: string;
  /** Campo que trae la categoría de amenaza, tal como lo llama el servicio. */
  readonly levelField: 'CATAME' | 'CATAMEFLU';
  readonly outFields: readonly string[];
  /** Fenómeno concreto, para `attrs.fenomeno`. */
  readonly phenomenon: 'movimientos en masa' | 'flujos torrenciales o de detritos';
}

/**
 * Capa 15 del grupo «Zonificación de Amenaza»: la de 1:100.000, que es el Mapa Nacional de
 * Amenaza por Movimientos en Masa. Es la única con campo `PLANCHA` y la única con cobertura
 * regional real (256 planchas del índice 1:100.000).
 *
 * Dominio REAL de `CATAME` en esta capa, contado sobre las 890 filas el 2026-09-21 pidiendo
 * `returnGeometry=false`: Media 274, Alta 274, Muy Alta 203, Baja 139. Suman 890.
 *
 * Las otras capas del grupo (2K, 5K, 10K, 25K, 50K, 500K, 1500K) y las de flujos NO se cargan
 * hoy por peso de descarga; están medidas y declaradas en la cabecera de este archivo y en
 * `etl/config/datasets/environment.ts`. Añadirlas es añadir una entrada a esta lista.
 */
const SIMMA_HAZARD_LAYERS: readonly ArcgisHazardLayer[] = [
  {
    layerId: 15,
    scale: '1:100.000',
    levelField: 'CATAME',
    outFields: ['CATAME', 'LEYENDA', 'PLANCHA', 'MAPA'],
    phenomenon: 'movimientos en masa',
  },
];

// ─── Escritura en ctx.hazard ──────────────────────────────────────────────────

interface HazardRow {
  kind: 'mass_movement' | 'seismic' | 'flood' | 'wildfire' | 'volcanic' | 'tsunami';
  level: string | null;
  levelRank: number | null;
  source: string;
  scale: string | null;
  attrs: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

/**
 * Inserta un lote. La geometría entra por `core.clean_polygon`, que hace `ST_MakeValid`,
 * extrae solo superficies y promueve a MULTIPOLYGON en 4326 (las tres fuentes vienen en
 * EPSG:4686 y se piden reproyectadas a 4326 en el propio servicio, con `outSR=4326`).
 *
 * Una geometría que quede NULL tras el saneamiento NO se inserta: `ctx.hazard.geom` es
 * NOT NULL y una fila de amenaza sin polígono no significa nada.
 */
async function insertBatch(rows: readonly HazardRow[], snapshotId: number): Promise<number> {
  if (rows.length === 0) return 0;
  let written = 0;
  await transaction(async (client) => {
    for (const r of rows) {
      const q = sql`
        WITH src AS (
          SELECT core.clean_polygon(
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(r.geometry)}), 4326)
          ) AS g
        )
        INSERT INTO ctx.hazard (kind, level, level_rank, source, scale, attrs, geom, snapshot_id)
        SELECT ${r.kind}, ${r.level}, ${r.levelRank}, ${r.source}, ${r.scale},
               ${JSON.stringify(r.attrs)}::jsonb, src.g, ${snapshotId}
        FROM src
        WHERE src.g IS NOT NULL
      `.build();
      const res = await client.query(q.text, q.values);
      written += res.rowCount ?? 0;
    }
  });
  return written;
}

/** Resultado de cargar una fuente, para las validaciones y `stats`. */
interface LoadReport {
  fetched: number;
  written: number;
  /** Valores de nivel que llegaron y NO están en `LEVEL_RANKS`. */
  unmappedLevels: Record<string, number>;
  /** Filas cuya geometría no sobrevivió a `core.clean_polygon`. */
  emptyGeometry: number;
  /** Conteo por (escala, nivel), que es la cifra de cobertura honesta. */
  byScaleAndLevel: Record<string, number>;
}

function emptyReport(): LoadReport {
  return { fetched: 0, written: 0, unmappedLevels: {}, emptyGeometry: 0, byScaleAndLevel: {} };
}

function tally(report: LoadReport, scale: string | null, level: string | null): void {
  const key = `${scale ?? 'sin escala'} · ${level ?? 'sin nivel'}`;
  report.byScaleAndLevel[key] = (report.byScaleAndLevel[key] ?? 0) + 1;
}

// ─── 1. SGC · movimientos en masa y flujos (SIMMA) ────────────────────────────

/**
 * Las capas del SIMMA declaran `advancedQueryCapabilities.supportsPagination: false`, así que
 * `resultOffset` no sirve. Lo que sí responde es `returnIdsOnly=true`, que devuelve la lista
 * completa de OBJECTID; con ella se pide `OBJECTID IN (...)` en trozos. Es exacto y reanudable,
 * y no depende de que el servidor mantenga un orden.
 */
const OID_CHUNK = 10;

/**
 * GENERALIZATION — `maxAllowableOffset`, en grados porque se pide `outSR=4326`.
 *
 * 0,0005° ≈ 55 m en el ecuador. La tolerancia gráfica de un mapa 1:100.000 es de unos 50 m
 * (0,5 mm de dibujo), así que simplificar a 55 m está dentro de la exactitud declarada de la
 * propia fuente: no se pierde información que el mapa tuviera. Sin esto la capa pesa 2,2 GB
 * (medido: 24,9 MB por cada 10 entidades) y no hay forma de servirla.
 *
 * Queda registrado en `attrs.generalizacion_m` de cada fila y en `meta.snapshot.stats`, porque
 * la regla 4 obliga a que el usuario pueda saber que la geometría que ve está generalizada.
 */
const MAX_ALLOWABLE_OFFSET_DEG = 0.0005;
const MAX_ALLOWABLE_OFFSET_M_APPROX = 55;

async function fetchIds(baseUrl: string, layerId: number): Promise<number[]> {
  const url = `${baseUrl}/${layerId}/query?where=1%3D1&returnIdsOnly=true&f=json`;
  const body = await fetchJson<{ objectIds?: number[] }>(url, `${baseUrl}/${layerId} (ids)`);
  return body.objectIds ?? [];
}

async function loadArcgisHazardLayers(
  baseUrl: string,
  layers: readonly ArcgisHazardLayer[],
  kind: HazardRow['kind'],
  source: string,
  snapshotId: number,
  datasetUrl: string,
): Promise<LoadReport> {
  const report = emptyReport();

  for (const layer of layers) {
    const ids = await fetchIds(baseUrl, layer.layerId);
    if (ids.length === 0) {
      console.log(`  · capa ${layer.layerId} (${layer.scale}, ${layer.phenomenon}): 0 entidades`);
      continue;
    }
    const fields = layer.outFields.join(',');
    let written = 0;

    for (let i = 0; i < ids.length; i += OID_CHUNK) {
      const chunk = ids.slice(i, i + OID_CHUNK);
      const where = encodeURIComponent(`OBJECTID IN (${chunk.join(',')})`);
      const url =
        `${baseUrl}/${layer.layerId}/query?where=${where}` +
        `&outFields=${encodeURIComponent(fields)}&returnGeometry=true&outSR=4326` +
        `&geometryPrecision=6&maxAllowableOffset=${MAX_ALLOWABLE_OFFSET_DEG}&f=geojson`;
      const body = await fetchJson<GeoJsonCollection>(
        url,
        `${baseUrl}/${layer.layerId} (oid ${chunk[0]}…)`,
      );

      const rows: HazardRow[] = [];
      for (const f of body.features ?? []) {
        report.fetched++;
        if (!f.geometry) {
          report.emptyGeometry++;
          continue;
        }
        const props = f.properties ?? {};
        const rawLevel = props[layer.levelField];
        const level = rawLevel === null || rawLevel === undefined ? null : String(rawLevel).trim() || null;
        const rank = rankOf(level);
        if (level !== null && rank === null) {
          report.unmappedLevels[level] = (report.unmappedLevels[level] ?? 0) + 1;
        }
        tally(report, layer.scale, level);
        rows.push({
          kind,
          level,
          levelRank: rank,
          source,
          scale: layer.scale,
          attrs: {
            fenomeno: layer.phenomenon,
            campo_nivel_origen: layer.levelField,
            capa_origen: `${baseUrl}/${layer.layerId}`,
            // Valores tal como los trae la fuente, sin renombrar. `LEYENDA` es el texto que el
            // SGC pone en la leyenda del mapa y es lo que se puede citar en el informe.
            leyenda: props.LEYENDA ?? null,
            plancha: props.PLANCHA ?? null,
            mapa: props.MAPA ?? null,
            generalizacion_m: MAX_ALLOWABLE_OFFSET_M_APPROX,
            dataset_url: datasetUrl,
          },
          geometry: f.geometry,
        });
      }
      const n = await insertBatch(rows, snapshotId);
      written += n;
      report.emptyGeometry += rows.length - n;
      process.stdout.write(
        `\r  · capa ${layer.layerId} (${layer.scale}, ${layer.phenomenon}): ${written}/${ids.length}   `,
      );
    }
    report.written += written;
    process.stdout.write('\n');
  }
  return report;
}

// ─── 2. SGC · amenaza sísmica NSR-10 ──────────────────────────────────────────

/**
 * Capa 1 `Zonas_amenaza` del FeatureServer de zonas NSR-10: 6 polígonos, campos
 * `OBJECTID, ID, VALOR`, con `VALOR` ∈ {Alta, Intermedia, Baja}.
 *
 * La escala NO la declara el servicio. Se guarda el texto del reglamento de origen, que es
 * lo único afirmable, y no una escala inventada.
 */
const NSR10_SCALE = 'Zonificación nacional del Reglamento NSR-10 (el servicio no declara escala)';

async function loadSeismicNsr10(snapshotId: number): Promise<LoadReport> {
  const report = emptyReport();
  const url =
    `${SGC_NSR10}/1/query?where=1%3D1&outFields=${encodeURIComponent('ID,VALOR')}` +
    `&returnGeometry=true&outSR=4326&geometryPrecision=7&f=geojson`;
  const body = await fetchJson<GeoJsonCollection>(url, `${SGC_NSR10}/1`);

  const rows: HazardRow[] = [];
  for (const f of body.features ?? []) {
    report.fetched++;
    if (!f.geometry) {
      report.emptyGeometry++;
      continue;
    }
    const props = f.properties ?? {};
    const level = props.VALOR === null || props.VALOR === undefined ? null : String(props.VALOR).trim() || null;
    const rank = rankOf(level);
    if (level !== null && rank === null) {
      report.unmappedLevels[level] = (report.unmappedLevels[level] ?? 0) + 1;
    }
    tally(report, NSR10_SCALE, level);
    rows.push({
      kind: 'seismic',
      level,
      levelRank: rank,
      source: 'SGC',
      scale: NSR10_SCALE,
      attrs: {
        fenomeno: 'amenaza sísmica',
        campo_nivel_origen: 'VALOR',
        id_origen: props.ID ?? null,
        capa_origen: `${SGC_NSR10}/1`,
        reglamento: 'NSR-10 (Reglamento Colombiano de Construcción Sismo Resistente)',
      },
      geometry: f.geometry,
    });
  }
  const written = await insertBatch(rows, snapshotId);
  report.written = written;
  report.emptyGeometry += rows.length - written;
  console.log(`  · zonas NSR-10: ${written}/${report.fetched}`);
  return report;
}

// ─── 3. IDEAM · amenaza por inundación, TR 100 años ───────────────────────────

/**
 * Socrata sí pagina de verdad (`$limit` + `$offset` con `$order=:id`). 49 154 filas en
 * páginas de 1 000: es lento pero determinista.
 *
 * `the_geom` llega ya en EPSG:4326 (Socrata almacena en WGS 84), así que no se reproyecta.
 */
const SOCRATA_PAGE = 1000;

async function loadIdeamFloodTr100(snapshotId: number): Promise<LoadReport> {
  const report = emptyReport();
  const select = 'the_geom,amenaza,cenpob,municipio,departamen,area_tot,ano';
  const scale =
    'Centro poblado, período de retorno 100 años (el IDEAM no declara escala cartográfica)';

  for (let offset = 0; ; offset += SOCRATA_PAGE) {
    const url =
      `${IDEAM_FLOOD_TR100}.geojson?%24select=${encodeURIComponent(select)}` +
      `&%24order=%3Aid&%24limit=${SOCRATA_PAGE}&%24offset=${offset}`;
    const body = await fetchJson<GeoJsonCollection>(url, `${IDEAM_FLOOD_TR100} (offset ${offset})`);
    const features = body.features ?? [];
    if (features.length === 0) break;

    const rows: HazardRow[] = [];
    for (const f of features) {
      report.fetched++;
      if (!f.geometry) {
        report.emptyGeometry++;
        continue;
      }
      const props = f.properties ?? {};
      const level =
        props.amenaza === null || props.amenaza === undefined ? null : String(props.amenaza).trim() || null;
      const rank = rankOf(level);
      if (level !== null && rank === null) {
        report.unmappedLevels[level] = (report.unmappedLevels[level] ?? 0) + 1;
      }
      tally(report, scale, level);
      rows.push({
        kind: 'flood',
        level,
        levelRank: rank,
        source: 'IDEAM',
        scale,
        attrs: {
          fenomeno: 'inundación fluvial',
          campo_nivel_origen: 'amenaza',
          periodo_retorno_anios: 100,
          // Nombres, no códigos: el dataset del IDEAM no trae DIVIPOLA. Se guardan tal cual
          // para que el informe pueda citarlos; la resolución a código se hace por geometría.
          centro_poblado: props.cenpob ?? null,
          municipio_nombre: props.municipio ?? null,
          departamento_nombre: props.departamen ?? null,
          // `ano` es el año del estudio del centro poblado (observado entre 2010 y 2019).
          anio_estudio: props.ano ?? null,
          area_total_origen: props.area_tot ?? null,
          dataset_url: `${IDEAM_FLOOD_TR100}.json`,
        },
        geometry: f.geometry,
      });
    }
    const n = await insertBatch(rows, snapshotId);
    report.written += n;
    report.emptyGeometry += rows.length - n;
    process.stdout.write(`\r  · IDEAM inundación TR100: ${report.written} polígonos   `);
    if (features.length < SOCRATA_PAGE) break;
  }
  process.stdout.write('\n');
  return report;
}

// ─── Validaciones y cobertura ─────────────────────────────────────────────────

/**
 * Cobertura honesta (regla 6). Se cuenta contra `core.municipality`, que ya tiene geometría,
 * cuántos municipios quedan tocados por el corte. Lo que NO está tocado se declara como
 * «sin estudio», jamás como «amenaza baja».
 */
async function coverageOf(snapshotId: number): Promise<{
  munis_con_dato: number;
  munis_totales: number;
  area_poligonos_km2: number;
}> {
  // `sum(core.area_m2(...))`, NO `area_m2(ST_Union(...))`: disolver decenas de miles de
  // polígonos densos cuesta minutos y aquí no hace falta. Dentro de una misma capa de
  // zonificación los polígonos no se solapan, así que la suma ES el área cubierta; si alguna
  // capa futura solapara, el número quedaría por encima y así se nombra la clave.
  const row = await queryOne<{
    munis_con_dato: number;
    munis_totales: number;
    area_poligonos_km2: number;
  }>(sql`
    SELECT
      (SELECT count(DISTINCT m.code)::int
         FROM core.municipality m
         JOIN ctx.hazard h ON h.snapshot_id = ${snapshotId}
                          AND m.geom && h.geom AND ST_Intersects(m.geom, h.geom)
        WHERE m.geom IS NOT NULL) AS munis_con_dato,
      (SELECT count(*)::int FROM core.municipality) AS munis_totales,
      (SELECT round((sum(core.area_m2(h.geom)) / 1000000)::numeric, 1)
         FROM ctx.hazard h WHERE h.snapshot_id = ${snapshotId}) AS area_poligonos_km2
  `);
  return row ?? { munis_con_dato: 0, munis_totales: 0, area_poligonos_km2: 0 };
}

async function runValidations(
  snapshotId: number,
  report: LoadReport,
  coverage: Awaited<ReturnType<typeof coverageOf>>,
): Promise<void> {
  await clearValidations(snapshotId);

  const unmapped = Object.entries(report.unmappedLevels);
  await recordValidation({
    snapshotId,
    checkName: 'hazard_level_domain',
    severity: unmapped.length > 0 ? 'warning' : 'info',
    passed: unmapped.length === 0,
    affectedRows: unmapped.reduce((a, [, n]) => a + n, 0),
    message:
      unmapped.length === 0
        ? `Todos los niveles de amenaza se mapearon a level_rank 1..5 con la tabla documentada en el cargador.`
        : `Hay valores de nivel que no están en la tabla de mapeo: se cargaron con level_rank NULL, no se adivinaron.`,
    sample: unmapped.map(([value, n]) => ({ valor: value, filas: n })),
  });

  await recordValidation({
    snapshotId,
    checkName: 'invalid_geometry',
    severity: report.emptyGeometry > 0 ? 'warning' : 'info',
    passed: report.emptyGeometry === 0,
    affectedRows: report.emptyGeometry,
    message: `${report.emptyGeometry} polígonos no sobrevivieron a core.clean_polygon y no se cargaron.`,
  });

  // Cobertura: es `warning` a propósito. Un corte que solo cubre parte del país es válido y
  // se publica; lo que no es admisible es publicarlo sin dejar la cifra por escrito.
  await recordValidation({
    snapshotId,
    checkName: 'coverage_partial',
    severity: coverage.munis_con_dato < coverage.munis_totales ? 'warning' : 'info',
    passed: coverage.munis_con_dato >= coverage.munis_totales,
    affectedRows: coverage.munis_totales - coverage.munis_con_dato,
    message:
      `Cobertura del corte: ${coverage.munis_con_dato} de ${coverage.munis_totales} municipios ` +
      `tienen al menos un polígono; ${coverage.area_poligonos_km2} km² en polígonos de amenaza ` +
      `(medidos en EPSG:9377). ` +
      `Los municipios sin polígono NO tienen amenaza baja: no tienen estudio, y la UI debe decirlo.`,
    sample: Object.entries(report.byScaleAndLevel).map(([k, n]) => ({ escala_y_nivel: k, filas: n })),
  });

  const outside = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ctx.hazard
    WHERE snapshot_id = ${snapshotId}
      AND NOT ST_Intersects(geom, ST_MakeEnvelope(-82.0, -4.5, -66.5, 13.6, 4326))
  `);
  await recordValidation({
    snapshotId,
    checkName: 'outside_colombia',
    severity: (outside?.n ?? 0) > 0 ? 'error' : 'info',
    passed: (outside?.n ?? 0) === 0,
    affectedRows: outside?.n ?? 0,
    message:
      (outside?.n ?? 0) === 0
        ? 'Todos los polígonos caen dentro de la extensión de Colombia.'
        : 'Hay polígonos fuera de Colombia: revisa la reproyección antes de publicar.',
  });
}

// ─── Datasets ─────────────────────────────────────────────────────────────────

interface SourceDefinition {
  readonly target: Target;
  readonly datasetId: string;
  readonly source: string;
  readonly name: string;
  readonly description: string;
  readonly license: string;
  readonly attribution: string;
  readonly url: string;
  readonly connector: string;
  readonly format: string;
  readonly sourceSrid: number;
  readonly shareAlike: boolean;
  readonly notes: string;
  /** Fecha de corte a registrar en `meta.snapshot`. */
  readonly cutDate: string;
  readonly load: (snapshotId: number) => Promise<LoadReport>;
}

const SOURCES: readonly SourceDefinition[] = [
  {
    target: 'mass-movement',
    datasetId: 'sgc-amenaza-movimientos-masa',
    source: 'SGC',
    name: 'Amenaza por movimientos en masa, escala 1:100.000 (SIMMA)',
    description:
      'Zonificación de amenaza por movimientos en masa del Servicio Geológico Colombiano a ' +
      'escala 1:100.000, publicada en el SIMMA por planchas del índice 1:100.000. Categorías ' +
      'Muy Alta, Alta, Media y Baja en el campo CATAME. NO es cobertura nacional homogénea: ' +
      'cubre las 256 planchas con estudio. A esta escala el dato orienta pero NO sustituye un ' +
      'estudio de detalle. La geometría se sirve generalizada a unos 55 m, por debajo de la ' +
      'tolerancia gráfica de un mapa 1:100.000.',
    license:
      'NO_DECLARADA por el servicio. `copyrightText` dice literalmente "Servicio geologico ' +
      'Colombiano". Se registra el régimen general de datos abiertos del Estado colombiano ' +
      '(Ley 1712 de 2014); PENDIENTE confirmar con el SGC antes de redistribuir el dato derivado.',
    attribution:
      'Fuente: Servicio Geológico Colombiano (SGC), SIMMA — Zonificación de amenaza por ' +
      'movimientos en masa, escala 1:100.000',
    url: SGC_SIMMA,
    connector: 'arcgis-rest',
    format: 'geojson',
    sourceSrid: 4686,
    shareAlike: false,
    notes:
      'Verificado el 2026-09-21 con peticiones reales. El servicio no declara fecha de corte ni ' +
      'licencia: la fecha registrada es la de consulta. La capa declara supportsPagination=false, ' +
      'así que se pagina por listas de OBJECTID obtenidas con returnIdsOnly. Es el Mapa Nacional ' +
      'de Amenaza por Movimientos en Masa (el servicio hermano ' +
      'Mapa_Nacional_Amenaza_Mov_Masa_100K lo fecha en 2015) y la única capa del grupo con ' +
      'campo PLANCHA. 890 polígonos sobre 256 planchas del índice 1:100.000. La geometría se ' +
      'pide con maxAllowableOffset=0,0005° (~55 m) porque sin generalizar la capa pesa ~2,2 GB; ' +
      'la generalización queda registrada en attrs.generalizacion_m. PENDIENTES por peso: las ' +
      'capas de 1:25.000 (5 501 polígonos, ~11 GB) y de flujos a 1:5.000 (8 350 polígonos). ' +
      'NO se añade ningún polígono por omisión donde no hay estudio.',
    cutDate: CONSULTED_ON,
    load: (snapshotId) =>
      loadArcgisHazardLayers(
        SGC_SIMMA,
        SIMMA_HAZARD_LAYERS,
        'mass_movement',
        'SGC',
        snapshotId,
        SGC_SIMMA,
      ),
  },
  {
    target: 'seismic',
    datasetId: 'sgc-amenaza-sismica-nsr10',
    source: 'SGC',
    name: 'Zonas de amenaza sísmica (NSR-10)',
    description:
      'Zonificación de amenaza sísmica del Reglamento Colombiano de Construcción Sismo ' +
      'Resistente NSR-10, publicada por el Servicio Geológico Colombiano. Tres categorías en ' +
      'el campo VALOR: Alta, Intermedia y Baja.',
    license:
      'NO_DECLARADA por el servicio (`copyrightText` vacío en este FeatureServer). Se registra ' +
      'el régimen general de datos abiertos del Estado colombiano (Ley 1712 de 2014); ' +
      'PENDIENTE confirmar con el SGC.',
    attribution: 'Fuente: Servicio Geológico Colombiano (SGC), Zonas de amenaza sísmica NSR-10',
    url: SGC_NSR10,
    connector: 'arcgis-rest',
    format: 'geojson',
    sourceSrid: 4686,
    shareAlike: false,
    notes:
      'Verificado el 2026-09-21: 6 polígonos, campos OBJECTID, ID, VALOR. El servicio no declara ' +
      'fecha de corte; el NSR-10 es el Reglamento vigente desde 2010. La escala no se declara y ' +
      'no se inventa. Es zonificación de reglamento: sirve para el diseño estructural exigible, ' +
      'no para microzonificación de un predio.',
    cutDate: CONSULTED_ON,
    load: loadSeismicNsr10,
  },
  {
    target: 'flood',
    datasetId: 'ideam-amenaza-inundacion-tr100',
    source: 'IDEAM',
    name: 'Amenaza por inundación, período de retorno 100 años (79 centros poblados)',
    description:
      'Mapas de zonificación de amenaza por inundación del IDEAM para un período de retorno de ' +
      '100 años en 79 centros poblados, con categorías ALTA, MEDIA y BAJA en el campo `amenaza`. ' +
      'NO es una capa nacional: cubre únicamente los centros poblados estudiados. El IDEAM ' +
      'publica además los períodos de retorno de 2, 10, 20 y 50 años, sobre 79, 35, 25 y 36 ' +
      'centros poblados respectivamente.',
    license: 'Creative Commons Attribution | Share Alike 4.0 International (declarada por el dataset)',
    attribution:
      'Fuente: Instituto de Hidrología, Meteorología y Estudios Ambientales - IDEAM, Bogotá D.C., ' +
      'Amenaza de Inundación Período de Retorno 100 Años, CC BY-SA 4.0',
    url: `${IDEAM_FLOOD_TR100}.json`,
    connector: 'socrata',
    format: 'geojson',
    sourceSrid: 4326,
    shareAlike: true,
    notes:
      'Verificado el 2026-09-21. El GeoServer del IDEAM (geoservicios.ideam.gov.co) NO resuelve ' +
      'por DNS: datos.gov.co es el único camino que respondió. El dataset no trae código ' +
      'DIVIPOLA, solo nombres de municipio y centro poblado; el enlace al municipio se hace por ' +
      'geometría. El campo `ano` (año del estudio del centro poblado) va entre 2010 y 2019: ' +
      'medido con $group. La fecha de corte registrada es la última actualización de filas que ' +
      'declara Socrata.',
    // `rowsUpdatedAt` de la vista de Socrata = 1754398542 (época en segundos) = 2025-08-05.
    cutDate: '2025-08-05',
    load: loadIdeamFloodTr100,
  },
];

// ─── Despublicación del corte sintético equivalente ───────────────────────────

/**
 * `demo-hazards` es el corte de demostración que sembró `db:seed` (ADR-006). Cuando ya hay
 * amenazas reales no pueden convivir dos capas activas del mismo tema: la API mezclaría un
 * polígono inventado con uno del SGC y ninguna advertencia salvaría eso.
 *
 * No se borran las filas sintéticas: se desactiva el corte, que es lo que la API mira. Así el
 * dato de demostración sigue disponible para las pruebas sin llegar nunca al usuario.
 */
async function retireSyntheticSnapshot(datasetId: string): Promise<boolean> {
  const n = await execute(sql`
    UPDATE meta.snapshot
    SET is_active = FALSE, status = 'superseded'
    WHERE dataset_id = ${datasetId} AND is_active AND is_synthetic
  `);
  return n > 0;
}

// ─── Principal ────────────────────────────────────────────────────────────────

async function loadOne(def: SourceDefinition): Promise<void> {
  console.log(`\n── ${def.datasetId} · ${def.name}`);
  console.log(`   ${def.url}`);

  await upsertDataset({
    id: def.datasetId,
    source: def.source,
    name: def.name,
    description: def.description,
    license: def.license,
    attribution: def.attribution,
    url: def.url,
    frequency: 'eventual',
    connector: def.connector,
    format: def.format,
    source_srid: def.sourceSrid,
    target_table: 'ctx.hazard',
    share_alike: def.shareAlike,
    notes: def.notes,
  });

  const snapshot = await createSnapshot({
    datasetId: def.datasetId,
    cutDate: def.cutDate,
    isSynthetic: false, // El dato es real.
    sourceUrl: def.url,
    stageMethod: def.connector,
  });

  // Reejecutar el mismo día reutiliza el corte (la clave es dataset + cut_date): hay que
  // vaciarlo antes o las filas se duplicarían.
  const removed = await execute(sql`DELETE FROM ctx.hazard WHERE snapshot_id = ${snapshot.id}`);
  if (removed > 0) console.log(`   (se vaciaron ${removed} filas de una corrida anterior del mismo corte)`);

  await setSnapshotStatus(snapshot.id, 'downloading');
  const report = await def.load(snapshot.id);
  const coverage = await coverageOf(snapshot.id);
  await runValidations(snapshot.id, report, coverage);

  await setSnapshotStatus(snapshot.id, 'transformed', {
    rowCount: report.written,
    stats: {
      fecha_de_consulta: CONSULTED_ON,
      fecha_de_corte_registrada: def.cutDate,
      licencia_declarada_por_la_fuente: def.license,
      entidades_descargadas: report.fetched,
      poligonos_cargados: report.written,
      poligonos_sin_geometria_utilizable: report.emptyGeometry,
      niveles_sin_mapeo: report.unmappedLevels,
      filas_por_escala_y_nivel: report.byScaleAndLevel,
      cobertura: coverage,
      advertencia:
        'Indicador de contexto. No es un estudio de riesgo ni un concepto técnico. La ausencia ' +
        'de polígono significa ausencia de estudio, NO ausencia de amenaza.',
    },
  });

  if (NO_PUBLISH) {
    console.log(`   corte ${snapshot.id} dejado en 'transformed' (--no-publish).`);
    return;
  }
  await publishSnapshot(snapshot.id);
  console.log(
    `   publicado corte ${snapshot.id}: ${report.written} polígonos, ` +
      `${coverage.munis_con_dato}/${coverage.munis_totales} municipios, ` +
      `${coverage.area_poligonos_km2} km².`,
  );
}

async function main(): Promise<void> {
  loadEnv();
  openPoolWithLongTimeout();
  const targets = ONLY ? SOURCES.filter((s) => s.target === ONLY) : SOURCES;
  if (targets.length === 0) {
    console.error(
      `--only=${ONLY} no corresponde a ninguna fuente. Usa: mass-movement | seismic | flood.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Cargando amenazas naturales reales (SGC / IDEAM) en ctx.hazard');

  for (const def of targets) {
    await loadOne(def);
  }

  // Solo se retira la demostración si el corte real quedó publicado de verdad.
  if (!NO_PUBLISH) {
    const real = await queryOne<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM meta.snapshot
      WHERE dataset_id IN ('sgc-amenaza-movimientos-masa', 'sgc-amenaza-sismica-nsr10',
                           'ideam-amenaza-inundacion-tr100')
        AND is_active AND NOT is_synthetic
    `);
    if ((real?.n ?? 0) > 0) {
      const retired = await retireSyntheticSnapshot('demo-hazards');
      console.log(
        retired
          ? '\nCorte sintético `demo-hazards` despublicado: ya no conviven dos capas de amenaza activas.'
          : '\nNo había corte sintético `demo-hazards` activo que despublicar.',
      );
    }
  }

  const summary = await query<{ kind: string; source: string; scale: string; n: number }>(sql`
    SELECT h.kind, h.source, coalesce(h.scale, 'sin escala') AS scale, count(*)::int AS n
    FROM ctx.hazard h
    JOIN meta.snapshot s ON s.id = h.snapshot_id AND s.is_active
    GROUP BY 1, 2, 3 ORDER BY 1, 3
  `);
  console.log('\nctx.hazard activo:');
  for (const r of summary) {
    console.log(`  ${r.kind.padEnd(14)} ${r.source.padEnd(6)} ${r.scale.padEnd(70)} ${r.n}`);
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error('\nLa carga de amenazas falló:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
