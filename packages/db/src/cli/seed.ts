#!/usr/bin/env node
/**
 * Semilla reproducible.
 *
 * Carga, en este orden:
 *  1. Departamentos (DIVIPOLA, lista fija verificada).
 *  2. Municipios (DIVIPOLA real desde datos.gov.co; si no hay red, solo los departamentos).
 *  3. Gestores catastrales conocidos distintos del IGAC.
 *  4. Planes y catálogo de capas.
 *  5. Municipio de demostración con predios SINTÉTICOS marcados (`is_synthetic = true`).
 *
 * Banderas: `--no-demo` omite el paso 5. `--offline` no intenta descargar DIVIPOLA.
 */
import { closePool, execute, query, queryOne, transaction } from '../pool.js';
import { sql } from '../sql.js';
import { loadEnv } from '../env.js';
import { DEPARTMENTS, NON_IGAC_MANAGERS } from '../seed/departments.js';
import { DIVIPOLA_DATASET, fetchDivipola } from '../seed/divipola.js';
import { LAYERS } from '../seed/layers.js';
import {
  DEFAULT_DEMO,
  buildingRing,
  centroidOf,
  generateDemoFacilities,
  generateDemoParcels,
} from '../seed/demo-cadastre.js';
import { PLANS } from '@terracolombia/shared';

const args = new Set(process.argv.slice(2));
const WITH_DEMO = !args.has('--no-demo');
const OFFLINE = args.has('--offline');

const DEMO_DATASETS = {
  cadastre: {
    id: 'demo-cadastre',
    source: 'DEMO',
    name: 'Catastro de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution:
      'DATOS DE DEMOSTRACIÓN generados por TerraColombia. No provienen del IGAC ni de ningún gestor catastral.',
    frequency: 'irregular',
    connector: 'manual',
    format: 'synthetic',
  },
  facilities: {
    id: 'demo-facilities',
    source: 'DEMO',
    name: 'Equipamientos de demostración (datos sintéticos)',
    license: 'NO_DISPONIBLE',
    attribution: 'DATOS DE DEMOSTRACIÓN generados por TerraColombia.',
    frequency: 'irregular',
    connector: 'manual',
    format: 'synthetic',
  },
} as const;

async function seedDatasets(): Promise<void> {
  const rows = [
    {
      ...DIVIPOLA_DATASET,
      description: 'Códigos y nombres oficiales de departamentos y municipios.',
      share_alike: false,
      source_srid: 4326,
      target_table: 'core.municipality',
    },
    ...Object.values(DEMO_DATASETS).map((d) => ({
      ...d,
      url: null,
      description: 'Datos sintéticos para desarrollo, pruebas y demostración. Nunca son datos reales.',
      share_alike: false,
      source_srid: 4326,
      target_table: null,
    })),
  ];

  for (const d of rows) {
    await execute(sql`
      INSERT INTO meta.dataset (id, source, name, description, license, attribution, url, frequency,
                                connector, format, source_srid, target_table, share_alike, updated_at)
      VALUES (${d.id}, ${d.source}, ${d.name}, ${d.description}, ${d.license}, ${d.attribution},
              ${d.url ?? null}, ${d.frequency}, ${d.connector}, ${d.format}, ${d.source_srid},
              ${d.target_table}, ${d.share_alike}, now())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, license = EXCLUDED.license,
        attribution = EXCLUDED.attribution, url = EXCLUDED.url, updated_at = now()
    `);
  }
  console.log(`  · ${rows.length} datasets declarados en meta.dataset`);
}

async function ensureSnapshot(
  datasetId: string,
  cutDate: string,
  isSynthetic: boolean,
): Promise<number> {
  const row = await queryOne<{ id: number }>(sql`
    INSERT INTO meta.snapshot (dataset_id, cut_date, is_synthetic, status, stage_method)
    VALUES (${datasetId}, ${cutDate}::date, ${isSynthetic}, 'transformed', 'manual')
    ON CONFLICT (dataset_id, cut_date) DO UPDATE SET status = 'transformed'
    RETURNING id
  `);
  return row!.id;
}

async function seedDepartments(): Promise<void> {
  for (const d of DEPARTMENTS) {
    await execute(sql`
      INSERT INTO core.department (code, name, region)
      VALUES (${d.code}, ${d.name}, ${d.region})
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, region = EXCLUDED.region
    `);
  }
  console.log(`  · ${DEPARTMENTS.length} departamentos`);
}

async function seedMunicipalities(snapshotId: number): Promise<number> {
  if (OFFLINE) {
    console.log('  · municipios: omitidos (--offline)');
    return 0;
  }
  let rows: Awaited<ReturnType<typeof fetchDivipola>>;
  try {
    rows = await fetchDivipola();
  } catch (err) {
    console.warn(
      `  · municipios: no se pudo descargar DIVIPOLA (${err instanceof Error ? err.message : String(err)}).`,
    );
    console.warn('    La base queda con departamentos solamente. Vuelve a ejecutar con red.');
    return 0;
  }

  const known = new Set(DEPARTMENTS.map((d) => d.code));
  let inserted = 0;
  let skipped = 0;

  await transaction(async (client) => {
    for (const m of rows) {
      if (!known.has(m.deptCode)) {
        skipped++;
        continue;
      }
      await client.query(
        `INSERT INTO core.municipality (code, dept_code, name, category, centroid, snapshot_id)
         VALUES ($1, $2, $3, $4,
                 CASE WHEN $5::double precision IS NULL OR $6::double precision IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($5, $6), 4326) END,
                 $7)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           centroid = COALESCE(EXCLUDED.centroid, core.municipality.centroid),
           snapshot_id = EXCLUDED.snapshot_id`,
        [m.code, m.deptCode, m.name, m.kind, m.lng, m.lat, snapshotId],
      );
      inserted++;
    }
  });

  // La cabecera municipal se aproxima al punto DIVIPOLA hasta que el ETL cargue el MGN.
  await execute(sql`UPDATE core.municipality SET seat_point = centroid WHERE seat_point IS NULL`);

  console.log(`  · ${inserted} municipios${skipped > 0 ? ` (${skipped} con departamento desconocido)` : ''}`);
  return inserted;
}

async function seedCadastralManagers(): Promise<void> {
  // Por omisión, el IGAC es el gestor de todos los municipios cargados, con cobertura
  // `none` hasta que el ETL cargue predios. La UI lo dirá tal cual.
  const igac = await execute(sql`
    INSERT INTO core.cadastral_manager (muni_code, manager_name, is_igac, coverage_status, available_layers, manager_url, notes)
    SELECT
      m.code,
      'Instituto Geográfico Agustín Codazzi (IGAC)',
      TRUE,
      'none',
      ARRAY['municipality','department']::text[],
      'https://www.igac.gov.co/',
      'Asignación por omisión. Debe verificarse contra la habilitación vigente de gestores catastrales.'
    FROM core.municipality m
    ON CONFLICT (muni_code) DO NOTHING
  `);

  for (const g of NON_IGAC_MANAGERS) {
    await execute(sql`
      INSERT INTO core.cadastral_manager (muni_code, manager_name, is_igac, coverage_status, available_layers, manager_url, notes)
      SELECT ${g.muniCode}, ${g.managerName}, FALSE, 'none',
             ARRAY['municipality','department']::text[], ${g.managerUrl}, ${g.notes}
      WHERE EXISTS (SELECT 1 FROM core.municipality WHERE code = ${g.muniCode})
      ON CONFLICT (muni_code) DO UPDATE SET
        manager_name = EXCLUDED.manager_name, is_igac = FALSE,
        manager_url = EXCLUDED.manager_url, notes = EXCLUDED.notes, updated_at = now()
    `);
  }
  console.log(`  · gestores catastrales: ${igac} por omisión IGAC, ${NON_IGAC_MANAGERS.length} explícitos`);
}

async function seedPlans(): Promise<void> {
  // La tabla `app.plan` la crea Prisma. Si aún no existe, se avisa y se continúa.
  const exists = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'plan'
  `);
  if (!exists || exists.n === 0) {
    console.log('  · planes: omitidos (falta `prisma db push` para crear el esquema app)');
    return;
  }
  for (const p of Object.values(PLANS)) {
    await execute(sql`
      INSERT INTO app.plan (code, name, monthly_price_cop, unit_price_cop, monthly_credits, entitlements, is_public, sort_order, updated_at)
      VALUES (${p.code}, ${p.name}, ${p.monthlyPriceCop}, ${p.unitPriceCop}, ${p.monthlyCredits},
              ${JSON.stringify(p.entitlements)}::jsonb, ${p.code !== 'enterprise'},
              ${Object.keys(PLANS).indexOf(p.code) * 10}, now())
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name, monthly_price_cop = EXCLUDED.monthly_price_cop,
        unit_price_cop = EXCLUDED.unit_price_cop, monthly_credits = EXCLUDED.monthly_credits,
        entitlements = EXCLUDED.entitlements, updated_at = now()
    `);
  }
  console.log(`  · ${Object.keys(PLANS).length} planes`);
}

async function seedLayers(): Promise<void> {
  for (const l of LAYERS) {
    await execute(sql`
      INSERT INTO meta.layer (id, dataset_id, name, description, geometry_type, min_zoom, max_zoom,
                              legend, glossary_ids, min_plan, sort_order, is_enabled)
      VALUES (${l.id}, ${l.datasetId}, ${l.name}, ${l.description}, ${l.geometryType},
              ${l.minZoom}, ${l.maxZoom}, ${JSON.stringify(l.legend)}::jsonb,
              ${l.glossaryIds}, ${l.minPlan}, ${l.sortOrder}, TRUE)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        legend = EXCLUDED.legend, glossary_ids = EXCLUDED.glossary_ids,
        min_zoom = EXCLUDED.min_zoom, max_zoom = EXCLUDED.max_zoom,
        min_plan = EXCLUDED.min_plan, sort_order = EXCLUDED.sort_order
    `);
  }
  console.log(`  · ${LAYERS.length} capas en el catálogo`);
}

function ringToWkt(ring: Array<[number, number]>): string {
  return `MULTIPOLYGON(((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(',')})))`;
}

async function seedDemo(): Promise<void> {
  const muni = await queryOne<{ code: string; name: string }>(sql`
    SELECT code, name FROM core.municipality WHERE code = ${DEFAULT_DEMO.muniCode}
  `);
  if (!muni) {
    console.log(
      `  · demostración: omitida (el municipio ${DEFAULT_DEMO.muniCode} no está cargado; ejecuta la semilla con red)`,
    );
    return;
  }

  const cutDate = '2026-09-01';
  const cadastreSnapshot = await ensureSnapshot(DEMO_DATASETS.cadastre.id, cutDate, true);
  const facilitiesSnapshot = await ensureSnapshot(DEMO_DATASETS.facilities.id, cutDate, true);

  // Idempotencia: se borra lo anterior de este snapshot antes de recargar.
  await execute(sql`DELETE FROM core.building WHERE snapshot_id = ${cadastreSnapshot}`);
  await execute(sql`DELETE FROM core.parcel WHERE snapshot_id = ${cadastreSnapshot}`);
  await execute(sql`DELETE FROM ctx.school WHERE snapshot_id = ${facilitiesSnapshot}`);
  await execute(sql`DELETE FROM ctx.health_facility WHERE snapshot_id = ${facilitiesSnapshot}`);
  await execute(sql`DELETE FROM ctx.poi WHERE snapshot_id = ${facilitiesSnapshot}`);

  const parcels = generateDemoParcels();

  await transaction(async (client) => {
    for (const p of parcels) {
      const wkt = ringToWkt(p.ring);
      const [clng, clat] = centroidOf(p.ring);
      await client.query(
        `INSERT INTO core.parcel (
           npn, dept_code, muni_code, zone, sector, commune, neighborhood, block_or_vereda,
           terrain, condition, building_code, floor_code, unit_code, is_ph, matrix_npn,
           area_geom_m2, area_reported_m2, built_area_m2, economic_use, address, address_fold,
           cadastral_value, valuation_year, attrs, geom, centroid, h3_r9, h3_r8,
           snapshot_id, valid_from
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, '0', '00', '00', '0000', FALSE, $1,
           core.area_m2(core.clean_polygon(ST_GeomFromText($10, 4326))),
           $11, $12, $13, $14, public.tc_fold($14), $15, $16,
           jsonb_build_object('origen', 'demostracion', 'aviso',
             'Predio sintetico generado para desarrollo y pruebas. No corresponde a ningun predio real.'),
           core.clean_polygon(ST_GeomFromText($10, 4326)),
           ST_SetSRID(ST_MakePoint($17, $18), 4326),
           h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($17, $18), 4326), 9),
           h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($17, $18), 4326), 8),
           $19, $20::date
         )
         ON CONFLICT (dept_code, npn, snapshot_id) DO NOTHING`,
        [
          p.npn,
          p.deptCode,
          p.muniCode,
          p.zone,
          p.sector,
          p.commune,
          p.neighborhood,
          p.blockOrVereda,
          p.terrain,
          wkt,
          p.areaReportedM2,
          p.builtAreaM2,
          p.economicUse,
          p.address,
          p.cadastralValue,
          p.valuationYear,
          clng,
          clat,
          cadastreSnapshot,
          cutDate,
        ],
      );

      for (const b of p.buildings) {
        await client.query(
          `INSERT INTO core.building (dept_code, parcel_npn, muni_code, building_ref, floors,
                                      built_area_m2, use, built_year, attrs, geom, snapshot_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL,
                   jsonb_build_object('origen','demostracion'),
                   core.clean_polygon(ST_GeomFromText($8, 4326)), $9)`,
          [
            p.deptCode,
            p.npn,
            p.muniCode,
            b.ref,
            b.floors,
            b.builtAreaM2,
            b.use,
            ringToWkt(buildingRing(p)),
            cadastreSnapshot,
          ],
        );
      }
    }
  });

  const facilities = generateDemoFacilities();
  await transaction(async (client) => {
    for (const s of facilities.schools) {
      await client.query(
        `INSERT INTO ctx.school (dane_code, name, muni_code, sector, levels, location_kind,
                                 enrollment, enrollment_year, attrs, geom, h3_r9, snapshot_id)
         VALUES (NULL, $1, $2, $3, $4, 'urbana', $5, 2025,
                 jsonb_build_object('origen','demostracion'),
                 ST_SetSRID(ST_MakePoint($6, $7), 4326),
                 h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($6, $7), 4326), 9), $8)`,
        [s.name, DEFAULT_DEMO.muniCode, s.sector, s.levels, s.enrollment, s.lng, s.lat, facilitiesSnapshot],
      );
    }
    for (const h of facilities.health) {
      await client.query(
        `INSERT INTO ctx.health_facility (reps_code, name, muni_code, level, nature, services,
                                          attrs, geom, h3_r9, snapshot_id)
         VALUES (NULL, $1, $2, $3, $4, $5, jsonb_build_object('origen','demostracion'),
                 ST_SetSRID(ST_MakePoint($6, $7), 4326),
                 h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($6, $7), 4326), 9), $8)`,
        [h.name, DEFAULT_DEMO.muniCode, h.level, h.nature, h.services, h.lng, h.lat, facilitiesSnapshot],
      );
    }
    for (const p of facilities.pois) {
      await client.query(
        `INSERT INTO ctx.poi (osm_id, osm_type, category, subcategory, name, muni_code, tags,
                              geom, h3_r9, snapshot_id)
         VALUES (NULL, NULL, $1, $2, $3, $4, jsonb_build_object('origen','demostracion'),
                 ST_SetSRID(ST_MakePoint($5, $6), 4326),
                 h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($5, $6), 4326), 9), $7)`,
        [p.category, p.subcategory, p.name, DEFAULT_DEMO.muniCode, p.lng, p.lat, facilitiesSnapshot],
      );
    }
  });

  await seedDemoContext(cutDate);

  await execute(sql`SELECT meta.publish_snapshot(${cadastreSnapshot})`);
  await execute(sql`SELECT meta.publish_snapshot(${facilitiesSnapshot})`);

  await execute(sql`
    UPDATE core.cadastral_manager
    SET coverage_status = 'partial',
        source_id = ${DEMO_DATASETS.cadastre.id},
        last_cut_date = ${cutDate}::date,
        available_layers = ARRAY['parcel','building','school','health_facility','poi']::text[],
        notes = 'Cargado con datos de DEMOSTRACIÓN sintéticos. No son datos del IGAC.',
        updated_at = now()
    WHERE muni_code = ${DEFAULT_DEMO.muniCode}
  `);

  console.log(
    `  · demostración: ${parcels.length} predios sintéticos en ${muni.name} (${DEFAULT_DEMO.muniCode}), ` +
      `${facilities.schools.length} colegios, ${facilities.health.length} IPS, ${facilities.pois.length} POIs`,
  );
  console.log('    AVISO: estos datos son sintéticos. La API los marca con meta.synthetic = true.');
}

async function main(): Promise<void> {
  loadEnv();
  console.log('Sembrando TerraColombia\n');

  await seedDatasets();
  await seedDepartments();
  const divipolaSnapshot = await ensureSnapshot(DIVIPOLA_DATASET.id, '2026-01-01', false);
  const nMunis = await seedMunicipalities(divipolaSnapshot);
  if (nMunis > 0) await execute(sql`SELECT meta.publish_snapshot(${divipolaSnapshot})`);
  await seedCadastralManagers();
  await seedPlans();
  await seedLayers();
  if (WITH_DEMO) await seedDemo();

  const idx = await query<{ rebuild_search_index: number }>(
    sql`SELECT analytics.rebuild_search_index()`,
  );
  console.log(`  · índice de búsqueda: ${idx[0]?.rebuild_search_index ?? 0} entradas`);

  await execute(sql`REFRESH MATERIALIZED VIEW analytics.muni_summary`);
  console.log('  · vista analytics.muni_summary refrescada');

  console.log('\nSemilla completa.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());
