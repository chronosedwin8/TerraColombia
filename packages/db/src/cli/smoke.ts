#!/usr/bin/env node
/**
 * Comprobación rápida de extremo a extremo de la capa de datos.
 * No sustituye a los tests; sirve para verificar en un equipo nuevo que la base responde.
 */
import { closePool, healthCheck, query } from '../pool.js';
import { sql } from '../sql.js';
import { loadEnv } from '../env.js';
import { getCoverage, getMunicipality, municipalityAt } from '../repositories/admin.js';
import { getParcel, getParcelBuildings, parcelAt, parcelStatsIn, queryParcels } from '../repositories/parcel.js';
import { searchText } from '../repositories/search.js';
import { nearby, populationIn } from '../repositories/context.js';
import { rebuildCellsForMunicipality, refreshMuniSummary } from '../repositories/analytics.js';
import { renderTile } from '../repositories/tiles.js';
import { getSourceRefs } from '../repositories/meta.js';

const DEMO_MUNI = '08758';

async function main(): Promise<void> {
  loadEnv();
  const results: Array<[string, string]> = [];
  const check = (name: string, ok: boolean, detail: string) =>
    results.push([ok ? 'OK  ' : 'FALLA', `${name}: ${detail}`]);

  const health = await healthCheck();
  check('salud', health.ok, `postgis ${health.postgis}, h3 ${health.h3}, 9377 ${health.srid9377}`);

  const muni = await getMunicipality(DEMO_MUNI);
  check('municipio', Boolean(muni), muni ? `${muni.name}, ${muni.dept_name}` : 'no encontrado');

  const coverage = await getCoverage(DEMO_MUNI);
  check('cobertura', coverage.status !== 'unknown', `${coverage.status} · ${coverage.cadastralManager}`);

  const coverageOther = await getCoverage('11001');
  check(
    'cobertura no-IGAC',
    coverageOther.isIgac === false && Boolean(coverageOther.message),
    `${coverageOther.cadastralManager} → "${(coverageOther.message ?? '').slice(0, 60)}…"`,
  );

  const firstParcel = await query<{ npn: string }>(sql`
    SELECT p.npn FROM core.parcel p
    JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
    WHERE p.muni_code = ${DEMO_MUNI} ORDER BY p.npn LIMIT 1
  `);
  const npn = firstParcel[0]?.npn;
  check('hay predios', Boolean(npn), npn ?? 'ninguno');

  if (npn) {
    const parcel = await getParcel(npn, { withGeometry: true });
    check(
      'ficha de predio',
      Boolean(parcel && parcel.area_geom_m2 && parcel.is_synthetic),
      parcel
        ? `${parcel.npn} · ${parcel.area_geom_m2} m² · ${parcel.economic_use} · sintético=${parcel.is_synthetic}`
        : 'nulo',
    );

    const buildings = await getParcelBuildings(npn);
    check('construcciones', true, `${buildings.length} registradas`);

    const at = parcel?.lng && parcel.lat ? await parcelAt(parcel.lng, parcel.lat) : null;
    check('predio por clic', at?.npn === npn, at?.npn ?? 'no encontrado');

    const muniAt = parcel?.lng && parcel.lat ? await municipalityAt(parcel.lng, parcel.lat) : null;
    check('municipio por punto', Boolean(muniAt), muniAt?.name ?? 'no encontrado');
  }

  const q = await queryParcels({
    scope: { municipality: DEMO_MUNI },
    where: { zone: 'urbano', area_m2: { gte: 100 } },
    near: [],
    sort: 'area_m2:desc',
    limit: 10,
    geometry: 'centroid',
  });
  check('consulta DSL', q.rows.length > 0, `${q.rows.length} predios, cursor=${q.nextCursor ? 'sí' : 'no'}`);

  const qNear = await queryParcels({
    scope: { municipality: DEMO_MUNI },
    where: {},
    near: [{ layer: 'school', max_m: 800, invert: false }],
    sort: 'area_m2:desc',
    limit: 5,
    geometry: 'none',
  });
  check('DSL con proximidad', true, `${qNear.rows.length} predios a menos de 800 m de un colegio`);

  const search = await searchText('soledad', { limit: 5 });
  check('búsqueda', search.length > 0, search.map((s) => `${s.label} (${s.kind})`).join(', '));

  const searchTypo = await searchText('bogotá d.c', { limit: 3 });
  check('búsqueda con acento', searchTypo.length > 0, searchTypo[0]?.label ?? 'sin resultados');

  const near = muni?.lng && muni.lat ? await nearby(-74.771, 10.912, 1500, [], 5) : [];
  check('nearby', near.length > 0, `${near.length} elementos, más cercano a ${near[0]?.distance_m?.toFixed(0)} m`);

  const zone = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [-74.776, 10.908],
        [-74.766, 10.908],
        [-74.766, 10.918],
        [-74.776, 10.918],
        [-74.776, 10.908],
      ],
    ],
  };
  const stats = await parcelStatsIn(zone);
  check(
    'estadísticas de zona',
    (stats?.n_parcels ?? 0) > 0,
    `${stats?.n_parcels} predios, ${Math.round((stats?.area_sum_m2 ?? 0) / 10000)} ha`,
  );

  const pop = await populationIn(zone);
  check('población en zona', true, `${pop?.pop_total ?? 'NO_DISPONIBLE'} habitantes (${pop?.n_blocks ?? 0} manzanas)`);

  const cells = await rebuildCellsForMunicipality(DEMO_MUNI, 8);
  check('agregados H3', cells > 0, `${cells} celdas res 8`);

  await refreshMuniSummary();
  check('vista municipal', true, 'refrescada');

  const z = 15;
  const tx = Math.floor(((-74.771 + 180) / 360) * 2 ** z);
  const latRad = (10.912 * Math.PI) / 180;
  const ty = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
  );
  const tile = await renderTile('parcel', z, tx, ty);
  check('tesela MVT de predios', tile.length > 0, `${tile.length} bytes en z${z}/${tx}/${ty}`);

  const tileH3 = await renderTile('h3', 12, Math.floor(((-74.771 + 180) / 360) * 2 ** 12), Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** 12,
  ));
  check('tesela MVT H3', tileH3.length > 0, `${tileH3.length} bytes`);

  const tileTooLow = await renderTile('parcel', 10, 1, 1);
  check(
    'zoom por debajo del mínimo',
    tileTooLow.length === 0,
    'los predios no se sirven por debajo de z14',
  );

  const sources = await getSourceRefs(['demo-cadastre', 'dane-divipola']);
  check(
    'procedencia',
    sources.length === 2 && sources.every((s) => s.attribution.length > 0),
    sources.map((s) => `${s.source}@${s.cutDate}`).join(', '),
  );

  console.log('');
  for (const [status, line] of results) console.log(`${status}  ${line}`);
  const failed = results.filter(([s]) => s === 'FALLA').length;
  console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());
