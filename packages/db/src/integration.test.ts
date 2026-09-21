import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';
import { closePool, healthCheck, query, queryOne, queryWithTimeout } from './pool.js';
import { sql } from './sql.js';
import { getCoverage, getMunicipality, municipalityAt } from './repositories/admin.js';
import { getParcel, parcelAt, parcelStatsIn, queryParcels } from './repositories/parcel.js';
import { searchText } from './repositories/search.js';
import { nearby } from './repositories/context.js';
import { getSourceRefs } from './repositories/meta.js';
import { renderTile } from './repositories/tiles.js';

/**
 * Pruebas de integración contra PostgreSQL + PostGIS reales.
 *
 * Se saltan si no hay `DATABASE_URL`, para que `pnpm test` siga funcionando en una máquina
 * sin base. En CI, el job de integración levanta `postgis/postgis` y las ejecuta.
 */
loadEnv();
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const DEMO_MUNI = '08758';

d('base de datos', () => {
  beforeAll(async () => {
    const h = await healthCheck();
    if (!h.postgres) throw new Error('No hay conexión a PostgreSQL para las pruebas de integración');
  });

  afterAll(async () => {
    await closePool();
  });

  it('tiene PostGIS, h3 y EPSG:9377', async () => {
    const h = await healthCheck();
    expect(h.postgis).toBeTruthy();
    expect(h.h3).toBe(true);
    expect(h.srid9377).toBe(true);
  });

  it('core.parcel está particionada por departamento', async () => {
    const r = await queryOne<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = 'core.parcel'::regclass
    `);
    // 33 departamentos DIVIPOLA + la partición por defecto.
    expect(r?.n).toBeGreaterThanOrEqual(34);
  });

  it('el área en EPSG:9377 sale en metros creíbles', async () => {
    // 0,01° × 0,01° cerca del ecuador ≈ 1,22 km².
    const r = await queryOne<{ area: number }>(sql`
      SELECT core.area_m2(ST_SetSRID(ST_MakeEnvelope(-74.1, 4.65, -74.09, 4.66), 4326)) AS area
    `);
    expect(r?.area).toBeGreaterThan(1_100_000);
    expect(r?.area).toBeLessThan(1_350_000);
  });

  it('la distancia en 9377 coincide con la separación real', async () => {
    // 0,01° de longitud a 4,65° de latitud ≈ 1.110 m.
    const r = await queryOne<{ d: number }>(sql`
      SELECT core.distance_m(
        ST_SetSRID(ST_MakePoint(-74.10, 4.65), 4326),
        ST_SetSRID(ST_MakePoint(-74.09, 4.65), 4326)
      ) AS d
    `);
    expect(r?.d).toBeGreaterThan(1050);
    expect(r?.d).toBeLessThan(1170);
  });

  it('las funciones de NPN descomponen igual que packages/geo', async () => {
    const r = await queryOne<{ muni: string; es_ph: boolean; valido: boolean }>(sql`
      SELECT core.npn_muni_code('087580101010200010001000000000') AS muni,
             core.npn_is_ph('087580101010200010001101030402') AS es_ph,
             core.npn_is_valid('087580101010200010001000000000') AS valido
    `);
    expect(r?.muni).toBe('08758');
    expect(r?.es_ph).toBe(true);
    expect(r?.valido).toBe(true);
  });

  it('npn_normalize devuelve NULL para el código anterior de 20 dígitos', async () => {
    // Regla 2: no se inventa una conversión que no existe.
    const r = await queryOne<{ n30: string | null; n20: string | null; legacy: boolean }>(sql`
      SELECT core.npn_normalize('08758-0101-0102-0001-0001-0-00-00-0000') AS n30,
             core.npn_normalize('08758010101020001') AS n20,
             core.npn_is_legacy('08758010101020001000') AS legacy
    `);
    expect(r?.n30).toBe('087580101010200010001000000000');
    expect(r?.n20).toBeNull();
    expect(r?.legacy).toBe(true);
  });

  it('clean_polygon sanea una geometría autointersectada', async () => {
    const r = await queryOne<{ valido: boolean }>(sql`
      SELECT ST_IsValid(core.clean_polygon(
        ST_GeomFromText('POLYGON((0 0, 1 1, 1 0, 0 1, 0 0))', 4326)
      )) AS valido
    `);
    expect(r?.valido).toBe(true);
  });

  it('overlap_pct devuelve el porcentaje de solape', async () => {
    const r = await queryOne<{ pct: number }>(sql`
      SELECT core.overlap_pct(
        ST_SetSRID(ST_MakeEnvelope(0, 0, 1, 1), 4326),
        ST_SetSRID(ST_MakeEnvelope(0, 0, 0.5, 1), 4326)
      ) AS pct
    `);
    expect(r?.pct).toBeGreaterThan(48);
    expect(r?.pct).toBeLessThan(52);
  });

  it('geom_iou de dos geometrías idénticas es 1', async () => {
    const r = await queryOne<{ iou: number }>(sql`
      SELECT core.geom_iou(
        ST_SetSRID(ST_MakeEnvelope(0, 0, 1, 1), 4326),
        ST_SetSRID(ST_MakeEnvelope(0, 0, 1, 1), 4326)
      ) AS iou
    `);
    expect(r?.iou).toBe(1);
  });

  it('tc_fold normaliza para la búsqueda', async () => {
    const r = await queryOne<{ f: string }>(sql`SELECT public.tc_fold('Bogotá D.C.') AS f`);
    expect(r?.f).toBe('BOGOTA D.C.');
  });

  it('meta.publish_snapshot rechaza publicar con validaciones de error', async () => {
    // Se crea un dataset y un corte de prueba, se le añade un error y se intenta publicar.
    await query(sql`
      INSERT INTO meta.dataset (id, source, name, license, attribution, frequency)
      VALUES ('test-publish-guard', 'TEST', 'Prueba de guarda', 'NO_DISPONIBLE', 'Prueba', 'eventual')
      ON CONFLICT (id) DO NOTHING
    `);
    const snap = await queryOne<{ id: number }>(sql`
      INSERT INTO meta.snapshot (dataset_id, cut_date, status)
      VALUES ('test-publish-guard', '2026-01-01', 'transformed')
      ON CONFLICT (dataset_id, cut_date) DO UPDATE SET status = 'transformed'
      RETURNING id
    `);
    await query(sql`DELETE FROM meta.validation WHERE snapshot_id = ${snap!.id}`);
    await query(sql`
      INSERT INTO meta.validation (snapshot_id, check_name, severity, passed, message)
      VALUES (${snap!.id}, 'prueba', 'error', FALSE, 'Error de prueba')
    `);

    await expect(query(sql`SELECT meta.publish_snapshot(${snap!.id})`)).rejects.toThrow();

    // Limpieza: sin la validación de error, sí publica.
    await query(sql`DELETE FROM meta.validation WHERE snapshot_id = ${snap!.id}`);
    await query(sql`SELECT meta.publish_snapshot(${snap!.id})`);
    const active = await queryOne<{ is_active: boolean }>(sql`
      SELECT is_active FROM meta.snapshot WHERE id = ${snap!.id}
    `);
    expect(active?.is_active).toBe(true);
    await query(sql`DELETE FROM meta.dataset WHERE id = 'test-publish-guard'`);
  });

  it('queryWithTimeout aborta una consulta que se pasa del tiempo', async () => {
    await expect(queryWithTimeout(sql`SELECT pg_sleep(3)`, 300)).rejects.toThrow();
  });
});

d('repositorios sobre el municipio de demostración', () => {
  afterAll(async () => {
    await closePool();
  });

  it('hay municipios cargados de DIVIPOLA', async () => {
    const r = await queryOne<{ n: number }>(sql`SELECT count(*)::int AS n FROM core.municipality`);
    expect(r?.n).toBeGreaterThan(1000);
  });

  it('devuelve la ficha del municipio de demostración', async () => {
    const m = await getMunicipality(DEMO_MUNI);
    expect(m?.name).toBe('Soledad');
    expect(m?.dept_name).toBe('Atlántico');
  });

  it('la cobertura de un municipio no-IGAC explica por qué no hay predios', async () => {
    const c = await getCoverage('11001');
    expect(c.isIgac).toBe(false);
    expect(c.message).toBeTruthy();
    expect(c.message!.length).toBeGreaterThan(60);
  });

  it('municipalityAt declara cuándo resolvió por proximidad', async () => {
    const m = await municipalityAt(-74.771, 10.912);
    expect(m).toBeTruthy();
    expect(['polygon', 'nearest_centroid']).toContain(m!.match);
  });

  it('la búsqueda encuentra municipios con y sin tildes', async () => {
    const conTilde = await searchText('bogotá', { limit: 3 });
    const sinTilde = await searchText('bogota', { limit: 3 });
    expect(conTilde.length).toBeGreaterThan(0);
    expect(sinTilde.length).toBeGreaterThan(0);
    expect(conTilde[0]?.ref).toBe(sinTilde[0]?.ref);
  });

  it('la búsqueda tolera un error de tecleo', async () => {
    const hits = await searchText('medelin', { limit: 5 });
    expect(hits.some((h) => h.label.toLowerCase().startsWith('medell'))).toBe(true);
  });

  it('la ficha de predio marca el corte sintético', async () => {
    const first = await query<{ npn: string }>(sql`
      SELECT p.npn FROM core.parcel p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      WHERE p.muni_code = ${DEMO_MUNI} ORDER BY p.npn LIMIT 1
    `);
    if (first.length === 0) return; // sin semilla de demostración
    const parcel = await getParcel(first[0]!.npn);
    expect(parcel).toBeTruthy();
    expect(parcel!.is_synthetic).toBe(true);
    expect(parcel!.area_geom_m2).toBeGreaterThan(0);
  });

  it('el predio se puede localizar por su propio centroide', async () => {
    const first = await query<{ npn: string; lng: number; lat: number }>(sql`
      SELECT p.npn, ST_X(p.centroid) AS lng, ST_Y(p.centroid) AS lat
      FROM core.parcel p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      WHERE p.muni_code = ${DEMO_MUNI} AND p.centroid IS NOT NULL
      ORDER BY p.npn LIMIT 1
    `);
    if (first.length === 0) return;
    const hit = await parcelAt(first[0]!.lng, first[0]!.lat);
    expect(hit?.npn).toBe(first[0]!.npn);
  });

  it('el DSL filtra por zona y área', async () => {
    const r = await queryParcels({
      scope: { municipality: DEMO_MUNI },
      where: { zone: 'urbano', area_m2: { gte: 100 } },
      near: [],
      sort: 'area_m2:desc',
      limit: 5,
      geometry: 'centroid',
    });
    for (const row of r.rows) {
      expect(row.zone).toBe('01');
      expect(row.area_geom_m2).toBeGreaterThanOrEqual(100);
    }
  });

  it('el DSL ordena de mayor a menor área', async () => {
    const r = await queryParcels({
      scope: { municipality: DEMO_MUNI },
      where: {},
      near: [],
      sort: 'area_m2:desc',
      limit: 10,
      geometry: 'none',
    });
    const areas = r.rows.map((x) => x.area_geom_m2 ?? 0);
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i - 1]!).toBeGreaterThanOrEqual(areas[i]!);
    }
  });

  it('el cursor devuelve una página distinta sin repetir predios', async () => {
    const base = {
      scope: { municipality: DEMO_MUNI },
      where: {},
      near: [],
      sort: 'area_m2:desc' as const,
      limit: 5,
      geometry: 'none' as const,
    };
    const first = await queryParcels(base);
    if (!first.nextCursor) return;
    const second = await queryParcels({ ...base, cursor: first.nextCursor });
    const firstNpns = new Set(first.rows.map((r) => r.npn));
    for (const row of second.rows) expect(firstNpns.has(row.npn)).toBe(false);
  });

  it('nearby ordena por distancia creciente', async () => {
    const rows = await nearby(-74.771, 10.912, 2000, [], 10);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.distance_m).toBeLessThanOrEqual(rows[i]!.distance_m);
    }
  });

  it('las estadísticas de zona cuadran entre sí', async () => {
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
    if (!stats || stats.n_parcels === 0) return;
    expect(stats.n_urban + stats.n_rural).toBe(stats.n_parcels);
    expect(stats.n_with_building).toBeLessThanOrEqual(stats.n_parcels);
  });

  it('la procedencia trae atribución y licencia de cada dataset', async () => {
    const refs = await getSourceRefs(['dane-divipola', 'demo-cadastre']);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) {
      expect(r.attribution.length).toBeGreaterThan(10);
      expect(r.license.length).toBeGreaterThan(2);
    }
  });

  it('la tesela de predios respeta el zoom mínimo', async () => {
    const baja = await renderTile('parcel', 10, 300, 500);
    expect(baja.length).toBe(0);
  });

  it('la tesela de predios devuelve datos donde hay predios', async () => {
    const z = 15;
    const x = Math.floor(((-74.771 + 180) / 360) * 2 ** z);
    const latRad = (10.912 * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
    );
    const tile = await renderTile('parcel', z, x, y);
    const hasParcels = await queryOne<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM core.parcel p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      WHERE p.muni_code = ${DEMO_MUNI}
    `);
    if ((hasParcels?.n ?? 0) > 0) expect(tile.length).toBeGreaterThan(0);
  });

  it('la tesela nunca publica columnas fuera de la lista blanca', async () => {
    // Se comprueba sobre la definición, que es lo que gobierna la consulta.
    const { TILE_LAYERS } = await import('./repositories/tiles.js');
    const prohibidas = ['attrs', 'address', 'address_fold', 'cadastral_value'];
    for (const [id, def] of Object.entries(TILE_LAYERS)) {
      for (const col of def.columns) {
        expect(prohibidas, `la capa ${id} no debe publicar ${col}`).not.toContain(col);
      }
    }
  });

  /**
   * El worker traía su propia versión reducida del resolutor, que solo entendía `polygon` y
   * `radius`. Una petición con `kind: 'municipality'` se aceptaba con 202 y el trabajo moría
   * diciendo que el ámbito no era utilizable: analizar un municipio completo funcionaba
   * cuando el área era pequeña y fallaba cuando era grande, que es cuando hay que encolarlo.
   * Ahora los dos usan `resolveAreaScope`, y esta prueba comprueba que resuelve los cuatro.
   */
  it('resuelve los cuatro ámbitos del DSL, no solo polígono y radio', async () => {
    const { resolveAreaScope } = await import('./repositories/area-scope.js');
    const LIMITE = 5000;

    const radio = await resolveAreaScope(
      { kind: 'radius', center: [-74.771, 10.912], radiusM: 500 },
      LIMITE,
    );
    expect(radio.areaKm2).toBeGreaterThan(0);

    const poligono = await resolveAreaScope(
      {
        kind: 'polygon',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.78, 10.9],
              [-74.76, 10.9],
              [-74.76, 10.92],
              [-74.78, 10.92],
              [-74.78, 10.9],
            ],
          ],
        },
      },
      LIMITE,
    );
    expect(poligono.areaKm2).toBeGreaterThan(0);

    // La isócrona se aproxima por distancia y DEBE declararlo: sin ese aviso, el usuario
    // creería que es un alcance por red vial.
    const isocrona = await resolveAreaScope(
      { kind: 'isochrone', center: [-74.771, 10.912], minutes: 10, mode: 'walk' },
      LIMITE,
    );
    expect(isocrona.areaKm2).toBeGreaterThan(0);
    expect(isocrona.warnings.join(' ')).toMatch(/no es una isócrona por red vial/i);

    // El municipio depende de que su límite esté cargado. Si no lo está, la respuesta
    // correcta es un error explícito de cobertura, no un ámbito vacío.
    const tieneLimite = await queryOne<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM core.municipality WHERE code = ${DEMO_MUNI} AND geom IS NOT NULL
    `);
    if ((tieneLimite?.n ?? 0) > 0) {
      const muni = await resolveAreaScope({ kind: 'municipality', muniCode: DEMO_MUNI }, LIMITE);
      expect(muni.areaKm2).toBeGreaterThan(0);
      expect(muni.muniCode).toBe(DEMO_MUNI);
    } else {
      await expect(
        resolveAreaScope({ kind: 'municipality', muniCode: DEMO_MUNI }, LIMITE),
      ).rejects.toThrow(/límite geográfico/i);
    }
  });
});