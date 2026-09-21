import { execute } from '../pool.js';
import { sql } from '../sql.js';
import { DEFAULT_DEMO } from './demo-cadastre.js';
import {
  DEMO_CONTEXT_DATASETS,
  generateDemoAgriculturalFrontier,
  generateDemoCensusBlocks,
  generateDemoHazards,
  generateDemoProtectedArea,
  generateDemoRelief,
  generateDemoRoads,
  generateDemoSoils,
  generateDemoUrbanPerimeter,
  lineToWkt,
  ringToWkt,
} from './demo-context.js';

/**
 * Carga las capas de contexto de demostración.
 *
 * Sin suelos, amenazas, población ni relieve, la aptitud de terreno responde "sin datos
 * suficientes" para todo —que es lo correcto— y el producto no se puede revisar. Estas capas
 * permiten verlo funcionando de punta a punta.
 *
 * Son SINTÉTICAS y van en cortes con `is_synthetic = true`: la API marca `meta.synthetic`,
 * la interfaz muestra la banda de demostración y `meta.publish_snapshot` impide que tapen un
 * corte real del mismo dataset.
 */
export async function loadDemoContext(
  cutDate: string,
  ensureSnapshot: (datasetId: string, cutDate: string, isSynthetic: boolean) => Promise<number>,
): Promise<string> {
  for (const d of DEMO_CONTEXT_DATASETS) {
    await execute(sql`
      INSERT INTO meta.dataset (id, source, name, description, license, attribution, frequency,
                                connector, format, source_srid, target_table, share_alike, updated_at)
      VALUES (${d.id}, ${d.source}, ${d.name},
              'Datos sintéticos para desarrollo, pruebas y demostración. Nunca son datos reales.',
              ${d.license}, ${d.attribution}, ${d.frequency}, ${d.connector}, ${d.format},
              4326, ${d.targetTable}, FALSE, now())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, attribution = EXCLUDED.attribution, updated_at = now()
    `);
  }

  const snapshots: Record<string, number> = {};
  for (const d of DEMO_CONTEXT_DATASETS) {
    snapshots[d.id] = await ensureSnapshot(d.id, cutDate, true);
  }

  // ─── Suelos ───────────────────────────────────────────────────────────────
  // La misma banda alimenta tres capas: unidad cartográfica, capacidad de uso y vocación.
  // Es como lo publica el IGAC: un polígono de suelo con varios atributos temáticos.
  const soilSnap = snapshots['demo-soils']!;
  await execute(sql`DELETE FROM ctx.soil_unit WHERE snapshot_id = ${soilSnap}`);
  await execute(sql`DELETE FROM ctx.land_capability WHERE snapshot_id = ${soilSnap}`);
  await execute(sql`DELETE FROM ctx.land_vocation WHERE snapshot_id = ${soilSnap}`);

  const soils = generateDemoSoils();
  for (const u of soils) {
    const wkt = ringToWkt(u.ring);
    await execute(sql`
      INSERT INTO ctx.soil_unit (symbol, description, slope_range, climate, attrs, geom, snapshot_id)
      VALUES (${u.symbol}, ${u.description}, ${u.slopeRange}, ${u.climate},
              jsonb_build_object('origen', 'demostracion'),
              core.clean_polygon(ST_GeomFromText(${wkt}, 4326)), ${soilSnap})
    `);
    await execute(sql`
      INSERT INTO ctx.land_capability (class_code, subclass, description, attrs, geom, snapshot_id)
      VALUES (${u.capabilityClass}, ${u.subclass}, ${u.description},
              jsonb_build_object('origen', 'demostracion'),
              core.clean_polygon(ST_GeomFromText(${wkt}, 4326)), ${soilSnap})
    `);
    await execute(sql`
      INSERT INTO ctx.land_vocation (vocation, use_class, description, attrs, geom, snapshot_id)
      VALUES (${u.vocation}, ${u.useClass}, ${u.description},
              jsonb_build_object('origen', 'demostracion'),
              core.clean_polygon(ST_GeomFromText(${wkt}, 4326)), ${soilSnap})
    `);
  }

  // ─── Amenazas ─────────────────────────────────────────────────────────────
  const hazardSnap = snapshots['demo-hazards']!;
  await execute(sql`DELETE FROM ctx.hazard WHERE snapshot_id = ${hazardSnap}`);
  const hazards = generateDemoHazards();
  for (const h of hazards) {
    await execute(sql`
      INSERT INTO ctx.hazard (kind, level, level_rank, source, scale, attrs, geom, snapshot_id)
      VALUES (${h.kind}, ${h.level}, ${h.levelRank}, 'DEMO', ${h.scale},
              jsonb_build_object('origen', 'demostracion'),
              core.clean_polygon(ST_GeomFromText(${ringToWkt(h.ring)}, 4326)), ${hazardSnap})
    `);
  }

  // ─── Frontera agrícola ────────────────────────────────────────────────────
  const frontierSnap = snapshots['demo-agricultural-frontier']!;
  await execute(sql`DELETE FROM ctx.agricultural_frontier WHERE snapshot_id = ${frontierSnap}`);
  const frontier = generateDemoAgriculturalFrontier();
  for (const f of frontier) {
    await execute(sql`
      INSERT INTO ctx.agricultural_frontier (category, attrs, geom, snapshot_id)
      VALUES (${f.category}, jsonb_build_object('origen', 'demostracion'),
              core.clean_polygon(ST_GeomFromText(${ringToWkt(f.ring)}, 4326)), ${frontierSnap})
    `);
  }

  // ─── Manzanas censales ────────────────────────────────────────────────────
  const censusSnap = snapshots['demo-census']!;
  await execute(sql`DELETE FROM ctx.census_block WHERE snapshot_id = ${censusSnap}`);
  const blocks = generateDemoCensusBlocks();
  for (const b of blocks) {
    const wkt = ringToWkt(b.ring);
    await execute(sql`
      INSERT INTO ctx.census_block (code, muni_code, kind, pop_total, households, dwellings,
                                    age_bands, attrs, geom, centroid, h3_r9, snapshot_id)
      VALUES (${b.code}, ${DEFAULT_DEMO.muniCode}, 'urbano', ${b.popTotal}, ${b.households},
              ${b.dwellings}, ${JSON.stringify(b.ageBands)}::jsonb,
              jsonb_build_object('origen', 'demostracion'),
              core.clean_polygon(ST_GeomFromText(${wkt}, 4326)),
              ST_PointOnSurface(core.clean_polygon(ST_GeomFromText(${wkt}, 4326))),
              h3_lat_lng_to_cell(
                ST_PointOnSurface(core.clean_polygon(ST_GeomFromText(${wkt}, 4326))), 9),
              ${censusSnap})
      ON CONFLICT (code, snapshot_id) DO NOTHING
    `);
  }

  // ─── Vías ─────────────────────────────────────────────────────────────────
  const roadSnap = snapshots['demo-roads']!;
  await execute(sql`DELETE FROM ctx.road WHERE snapshot_id = ${roadSnap}`);
  const roads = generateDemoRoads();
  for (const r of roads) {
    await execute(sql`
      INSERT INTO ctx.road (osm_id, class, name, surface, is_paved, lanes, maxspeed_kmh,
                            muni_code, tags, geom, snapshot_id)
      VALUES (NULL, ${r.class}, ${r.name}, ${r.surface}, ${r.isPaved}, ${r.lanes},
              ${r.maxspeedKmh}, ${DEFAULT_DEMO.muniCode},
              jsonb_build_object('origen', 'demostracion'),
              ST_Multi(ST_GeomFromText(${lineToWkt(r.line)}, 4326)), ${roadSnap})
    `);
  }

  // ─── Relieve por celda H3 ─────────────────────────────────────────────────
  const reliefSnap = snapshots['demo-relief']!;
  await execute(sql`DELETE FROM ctx.elevation_cell WHERE snapshot_id = ${reliefSnap}`);
  const relief = generateDemoRelief();
  for (const c of relief) {
    await execute(sql`
      INSERT INTO ctx.elevation_cell (h3, res, elevation_min_m, elevation_mean_m, elevation_max_m,
                                      slope_mean_pct, slope_max_pct, snapshot_id)
      VALUES (h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326), ${c.res}),
              ${c.res}, ${c.elevationMinM}, ${c.elevationMeanM}, ${c.elevationMaxM},
              ${c.slopeMeanPct}, ${c.slopeMaxPct}, ${reliefSnap})
      ON CONFLICT (h3, snapshot_id) DO NOTHING
    `);
  }

  // ─── Perímetro urbano ─────────────────────────────────────────────────────
  const urbanSnap = snapshots['demo-urban-perimeter']!;
  await execute(sql`DELETE FROM core.urban_perimeter WHERE snapshot_id = ${urbanSnap}`);
  await execute(sql`
    INSERT INTO core.urban_perimeter (muni_code, name, attrs, geom, snapshot_id)
    VALUES (${DEFAULT_DEMO.muniCode}, 'Perímetro urbano de demostración',
            jsonb_build_object('origen', 'demostracion'),
            core.clean_polygon(
              ST_GeomFromText(${ringToWkt(generateDemoUrbanPerimeter())}, 4326)),
            ${urbanSnap})
  `);

  // ─── Área protegida ───────────────────────────────────────────────────────
  const protectedSnap = snapshots['demo-protected']!;
  await execute(sql`DELETE FROM ctx.protected_area WHERE snapshot_id = ${protectedSnap}`);
  const pa = generateDemoProtectedArea();
  await execute(sql`
    INSERT INTO ctx.protected_area (runap_id, name, category, is_restrictive, authority,
                                    attrs, geom, snapshot_id)
    VALUES (NULL, ${pa.name}, ${pa.category}, TRUE, ${pa.authority},
            jsonb_build_object('origen', 'demostracion'),
            core.clean_polygon(ST_GeomFromText(${ringToWkt(pa.ring)}, 4326)), ${protectedSnap})
  `);

  for (const id of Object.keys(snapshots)) {
    await execute(sql`SELECT meta.publish_snapshot(${snapshots[id]!})`);
  }

  return (
    `${soils.length} bandas de suelo (unidad, capacidad y vocación), ${hazards.length} amenazas, ` +
    `${blocks.length} manzanas censales, ${roads.length} vías, ${relief.length} celdas de relieve, ` +
    `${frontier.length} categorías de frontera agrícola, perímetro urbano y un área protegida`
  );
}
