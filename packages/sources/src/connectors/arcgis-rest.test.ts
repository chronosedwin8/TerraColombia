import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpClient } from './http.js';
import {
  crawlCatalog,
  effectivePageSize,
  esriGeometryToGeoJson,
  esriResponseToGeoJson,
  getCount,
  getExtent,
  iterateFeatures,
  layerSrid,
  normalizeRestRoot,
  objectIdFieldOf,
  parseCapabilities,
  parseQueryFormats,
  ringsToMultiPolygon,
  supportsGeoJson,
  type ArcgisLayerInfo,
} from './arcgis-rest.js';

// ─── Doble de `fetch` ─────────────────────────────────────────────────────────

interface Recorded {
  url: string;
  params: URLSearchParams;
}

/**
 * `fetch` simulado. `routes` es una lista de [predicado, respuesta]; la primera
 * que coincida gana. Registra cada URL pedida para poder afirmar sobre la
 * paginación.
 */
function makeFetch(
  routes: readonly [(url: URL) => boolean, () => unknown][],
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), params: url.searchParams });
    for (const [match, body] of routes) {
      if (match(url)) {
        const payload = JSON.stringify(body());
        return new Response(payload, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'tc-arcgis-'));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function client(fetchImpl: typeof fetch): HttpClient {
  // Sin caché y sin esperas: los tests no deben tocar disco ni dormir.
  return new HttpClient({
    fetchImpl,
    noCache: true,
    concurrency: 4,
    minHostIntervalMs: 0,
    baseDelayMs: 1,
    maxDelayMs: 2,
    maxRetries: 1,
    cacheDir,
    onEvent: () => undefined,
  });
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

describe('normalizeRestRoot', () => {
  it('quita parámetros y barras finales', () => {
    expect(normalizeRestRoot('https://x/rest/services?f=json')).toBe('https://x/rest/services');
    expect(normalizeRestRoot('https://x/rest/services//')).toBe('https://x/rest/services');
  });
});

describe('parseCapabilities', () => {
  it('parsea la cadena real del IGAC', () => {
    const caps = parseCapabilities('Query,Map,Data');
    expect([...caps].sort()).toEqual(['data', 'map', 'query']);
    expect(caps.has('query')).toBe(true);
    expect(caps.has('editing')).toBe(false);
  });

  it('tolera espacios, vacíos y undefined', () => {
    expect([...parseCapabilities(' Query , Map ,, ')].sort()).toEqual(['map', 'query']);
    expect(parseCapabilities(undefined).size).toBe(0);
    expect(parseCapabilities('').size).toBe(0);
  });
});

describe('parseQueryFormats', () => {
  it('parsea "JSON, geoJSON, PBF" del IGAC', () => {
    const f = parseQueryFormats('JSON, geoJSON, PBF');
    expect([...f].sort()).toEqual(['geojson', 'json', 'pbf']);
  });

  it('supportsGeoJson depende del formato declarado', () => {
    expect(supportsGeoJson({ supportedQueryFormats: 'JSON, geoJSON, PBF' })).toBe(true);
    expect(supportsGeoJson({ supportedQueryFormats: 'JSON' })).toBe(false);
    expect(supportsGeoJson({})).toBe(false);
  });
});

describe('layerSrid / objectIdFieldOf / effectivePageSize', () => {
  const layer: ArcgisLayerInfo = {
    id: 4,
    name: 'U_TERRENO',
    sourceSpatialReference: { wkid: 4686, latestWkid: 4686 },
    maxRecordCount: 2000,
    fields: [
      { name: 'FID', type: 'esriFieldTypeOID' },
      { name: 'CODIGO', type: 'esriFieldTypeString', length: 30 },
    ],
  };

  it('prefiere latestWkid', () => {
    expect(layerSrid({ ...layer, sourceSpatialReference: { wkid: 102100, latestWkid: 3857 } })).toBe(3857);
  });

  it('cae al CRS del servicio si la capa no lo declara', () => {
    expect(layerSrid({ id: 0, name: 'x' }, { spatialReference: { wkid: 4686 } })).toBe(4686);
    expect(layerSrid({ id: 0, name: 'x' })).toBeNull();
  });

  it('deduce el campo OID del tipo esriFieldTypeOID', () => {
    expect(objectIdFieldOf(layer)).toBe('FID');
    expect(objectIdFieldOf({ id: 0, name: 'x', objectIdField: 'OBJECTID' })).toBe('OBJECTID');
    expect(objectIdFieldOf({ id: 0, name: 'x', fields: [] })).toBeNull();
  });

  it('nunca supera el maxRecordCount del servicio', () => {
    expect(effectivePageSize(layer, 50_000)).toBe(2000);
    expect(effectivePageSize(layer, 5)).toBe(5);
    expect(effectivePageSize(layer)).toBe(2000);
    expect(effectivePageSize({ id: 0, name: 'x' })).toBe(1000);
  });
});

// ─── Conversión esri → GeoJSON ────────────────────────────────────────────────

describe('esriGeometryToGeoJson', () => {
  it('convierte puntos', () => {
    expect(esriGeometryToGeoJson({ x: -74.07, y: 4.6 })).toEqual({
      type: 'Point',
      coordinates: [-74.07, 4.6],
    });
  });

  it('convierte líneas simples y múltiples', () => {
    expect(
      esriGeometryToGeoJson({
        paths: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      }),
    ).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });
    const multi = esriGeometryToGeoJson({
      paths: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    });
    expect(multi?.type).toBe('MultiLineString');
  });

  it('convierte anillos a MultiPolygon cerrando el anillo', () => {
    const geom = esriGeometryToGeoJson({
      rings: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
        ],
      ],
    });
    expect(geom?.type).toBe('MultiPolygon');
    if (geom?.type === 'MultiPolygon') {
      const ring = geom.coordinates[0]?.[0];
      expect(ring?.[0]).toEqual(ring?.[ring.length - 1]);
    }
  });

  it('convierte un envelope a polígono', () => {
    const geom = esriGeometryToGeoJson({ xmin: -1, ymin: -1, xmax: 1, ymax: 1 });
    expect(geom?.type).toBe('Polygon');
  });

  it('devuelve null para geometría ausente o no reconocida', () => {
    expect(esriGeometryToGeoJson(null)).toBeNull();
    expect(esriGeometryToGeoJson({})).toBeNull();
    expect(esriGeometryToGeoJson({ x: Number.NaN, y: 0 })).toBeNull();
  });
});

describe('ringsToMultiPolygon', () => {
  it('asigna los agujeros al exterior anterior', () => {
    // Exterior horario (Esri) + agujero antihorario
    const exterior = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ];
    const hole = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ];
    const polys = ringsToMultiPolygon([exterior, hole]);
    expect(polys).toHaveLength(1);
    expect(polys[0]).toHaveLength(2);
  });

  it('separa dos exteriores en dos polígonos', () => {
    const a = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    const b = [
      [5, 5],
      [5, 6],
      [6, 6],
      [6, 5],
      [5, 5],
    ];
    expect(ringsToMultiPolygon([a, b])).toHaveLength(2);
  });
});

describe('esriResponseToGeoJson', () => {
  it('usa objectIdFieldName como id del feature', () => {
    const features = esriResponseToGeoJson({
      objectIdFieldName: 'FID',
      features: [{ attributes: { FID: 7, CODIGO: 'abc' }, geometry: { x: 1, y: 2 } }],
    });
    expect(features[0]?.id).toBe(7);
    expect(features[0]?.properties.CODIGO).toBe('abc');
    expect(features[0]?.geometry).toEqual({ type: 'Point', coordinates: [1, 2] });
  });
});

// ─── Catálogo ─────────────────────────────────────────────────────────────────

describe('crawlCatalog', () => {
  const root = 'https://mapas.test/server/rest/services';

  it('recorre carpetas y construye las URL de servicio', async () => {
    const { fetchImpl, calls } = makeFetch([
      [
        (u) => u.pathname.endsWith('/services') && !u.pathname.includes('catastro'),
        () => ({
          currentVersion: 11.3,
          folders: ['catastro', 'Utilities'],
          services: [{ name: 'Dato_Fundamental_Catastro', type: 'MapServer' }],
        }),
      ],
      [
        (u) => u.pathname.endsWith('/catastro'),
        () => ({
          folders: [],
          // ArcGIS devuelve el nombre ya prefijado con la carpeta.
          services: [{ name: 'catastro/Gestores_Catastrales', type: 'MapServer' }],
        }),
      ],
    ]);

    const result = await crawlCatalog(client(fetchImpl), root, { excludeFolders: ['Utilities'] });

    expect(result.currentVersion).toBe(11.3);
    expect(result.folders).toEqual(['catastro']);
    expect(result.services.map((s) => s.url)).toEqual([
      `${root}/Dato_Fundamental_Catastro/MapServer`,
      `${root}/catastro/Gestores_Catastrales/MapServer`,
    ]);
    // No debe pedir la carpeta excluida.
    expect(calls.some((c) => c.url.includes('Utilities'))).toBe(false);
  });

  it('respeta maxDepth', async () => {
    const { fetchImpl, calls } = makeFetch([
      [() => true, () => ({ folders: ['a'], services: [] })],
    ]);
    await crawlCatalog(client(fetchImpl), root, { maxDepth: 0 });
    expect(calls).toHaveLength(1);
  });

  it('no aborta si una carpeta falla y lo reporta', async () => {
    const errors: string[] = [];
    const { fetchImpl } = makeFetch([
      [
        (u) => u.pathname.endsWith('/services'),
        () => ({ folders: ['roto'], services: [{ name: 'ok', type: 'MapServer' }] }),
      ],
      // `roto` cae al 404 del doble de fetch.
    ]);
    const result = await crawlCatalog(client(fetchImpl), root, {
      onFolderError: (folder) => errors.push(folder),
    });
    expect(errors).toEqual(['roto']);
    expect(result.services).toHaveLength(1);
  });
});

// ─── Conteo y extensión ───────────────────────────────────────────────────────

describe('getCount / getExtent', () => {
  const layerUrl = 'https://mapas.test/server/rest/services/X/MapServer/0';

  it('devuelve el conteo cuando el servicio responde', async () => {
    const { fetchImpl, calls } = makeFetch([[() => true, () => ({ count: 4321 })]]);
    expect(await getCount(client(fetchImpl), layerUrl)).toBe(4321);
    expect(calls[0]?.params.get('returnCountOnly')).toBe('true');
    expect(calls[0]?.params.get('returnGeometry')).toBe('false');
  });

  it('devuelve null si el servicio responde con error de ArcGIS', async () => {
    const { fetchImpl } = makeFetch([
      [() => true, () => ({ error: { code: 400, message: 'Unable to complete operation.' } })],
    ]);
    expect(await getCount(client(fetchImpl), layerUrl)).toBeNull();
  });

  /*
   * El servidor de mapas, cuando no puede atender, responde HTTP 200 con un cuerpo JSON
   * válido de la forma `{"status":"error","messages":[…]}`, que NO es la forma `error`
   * documentada. Esa segunda forma no se comprobaba: pasaba como respuesta buena y una
   * consulta de identificadores devolvía lista vacía, que el cargador leyó como «esta capa no
   * tiene entidades». Con eso se publicó un corte de amenazas con cero polígonos —afirmar que
   * no hay amenaza en el país cuando el servidor estaba caído—. Un error de red disfrazado de
   * dato es el peor fallo posible aquí.
   */
  it('trata `status: error` como fallo, no como respuesta vacía', async () => {
    const { fetchImpl } = makeFetch([
      [
        () => true,
        () => ({
          status: 'error',
          messages: ['Could not access any server machines. Please contact your administrator.'],
        }),
      ],
    ]);
    expect(await getCount(client(fetchImpl), layerUrl)).toBeNull();
  });

  it('devuelve la extensión y el wkid', async () => {
    const { fetchImpl } = makeFetch([
      [
        () => true,
        () => ({
          extent: {
            xmin: -81.7,
            ymin: -0.05,
            xmax: -67.9,
            ymax: 12.6,
            spatialReference: { wkid: 4686, latestWkid: 4686 },
          },
        }),
      ],
    ]);
    const extent = await getExtent(client(fetchImpl), layerUrl);
    expect(extent?.xmin).toBeCloseTo(-81.7);
    expect(extent?.spatialReference?.latestWkid).toBe(4686);
  });
});

// ─── Paginación ───────────────────────────────────────────────────────────────

describe('iterateFeatures — paginación', () => {
  const layerUrl = 'https://mapas.test/server/rest/services/X/MapServer/0';

  const paginatedLayer: ArcgisLayerInfo = {
    id: 0,
    name: 'PAGINABLE',
    maxRecordCount: 2,
    supportedQueryFormats: 'JSON, geoJSON',
    capabilities: 'Query,Map,Data',
    objectIdField: 'OBJECTID',
    fields: [{ name: 'OBJECTID', type: 'esriFieldTypeOID' }],
    advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true },
  };

  /** Capa como las del IGAC: sin paginación declarada. */
  const noPaginationLayer: ArcgisLayerInfo = {
    id: 4,
    name: 'U_TERRENO',
    maxRecordCount: 2,
    supportedQueryFormats: 'JSON, geoJSON, PBF',
    capabilities: 'Query,Map,Data',
    fields: [
      { name: 'FID', type: 'esriFieldTypeOID' },
      { name: 'CODIGO', type: 'esriFieldTypeString', length: 30 },
    ],
    advancedQueryCapabilities: {
      supportsPagination: false,
      supportsOrderBy: false,
      supportsStatistics: false,
    },
  };

  function geojsonPage(ids: readonly number[], idField = 'OBJECTID'): unknown {
    return {
      type: 'FeatureCollection',
      features: ids.map((id) => ({
        type: 'Feature',
        geometry: null,
        properties: { [idField]: id, CODIGO: `c${id}` },
      })),
    };
  }

  it('usa resultOffset cuando la capa declara supportsPagination', async () => {
    const pages: Record<string, number[]> = { '0': [1, 2], '2': [3, 4], '4': [5] };
    const { fetchImpl, calls } = makeFetch([
      [
        (u) => u.pathname.endsWith('/query'),
        () => geojsonPage(pages[lastOffset] ?? []),
      ],
    ]);
    let lastOffset = '0';
    // Se recalcula el offset en cada llamada leyendo la URL registrada.
    const http = client(
      (async (input: string | URL, init?: RequestInit) => {
        lastOffset = new URL(String(input)).searchParams.get('resultOffset') ?? '0';
        return fetchImpl(input as string, init);
      }) as unknown as typeof fetch,
    );

    const batches: number[][] = [];
    let strategy = '';
    for await (const batch of iterateFeatures(http, layerUrl, { layerInfo: paginatedLayer })) {
      batches.push(batch.features.map((f) => Number(f.properties.OBJECTID)));
      strategy = batch.strategy;
    }

    expect(strategy).toBe('result-offset');
    expect(batches).toEqual([[1, 2], [3, 4], [5]]);
    expect(calls.map((c) => c.params.get('resultOffset'))).toEqual(['0', '2', '4']);
    expect(calls[0]?.params.get('resultRecordCount')).toBe('2');
    expect(calls[0]?.params.get('orderByFields')).toBe('OBJECTID');
  });

  it('nunca pide más de maxRecordCount aunque se pida un pageSize mayor', async () => {
    const { fetchImpl, calls } = makeFetch([
      [(u) => u.pathname.endsWith('/query'), () => geojsonPage([1])],
    ]);
    const it0 = iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: paginatedLayer,
      pageSize: 99_999,
    });
    await it0.next();
    expect(calls[0]?.params.get('resultRecordCount')).toBe('2');
  });

  /**
   * Doble del servidor del IGAC: `supportsPagination: false` implica que
   * `resultRecordCount` se responde con `400 Pagination is not supported.`
   * El paginador debe acotar el rango en el `where` y no enviar el parámetro.
   */
  function noPaginationServer(rows: readonly number[]): {
    fetchImpl: typeof fetch;
    calls: Recorded[];
  } {
    const calls: Recorded[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = new URL(String(input));
      calls.push({ url: url.toString(), params: url.searchParams });
      if (url.searchParams.has('resultRecordCount') || url.searchParams.has('resultOffset')) {
        return new Response(
          JSON.stringify({ error: { code: 400, message: 'Pagination is not supported.' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      const where = url.searchParams.get('where') ?? '';
      const lo = Number(where.match(/FID > (-?\d+)/)?.[1] ?? -1);
      const hi = Number(where.match(/FID <= (-?\d+)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
      const ids = rows.filter((id) => id > lo && id <= hi);
      return new Response(JSON.stringify(geojsonPage(ids, 'FID')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it('pagina por rangos acotados de OID cuando supportsPagination es false', async () => {
    const { fetchImpl, calls } = noPaginationServer([0, 1, 2, 3, 4]);
    const notices: string[] = [];
    const seen: number[] = [];
    let strategy = '';
    for await (const batch of iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: noPaginationLayer,
      onNotice: (n) => notices.push(n),
    })) {
      for (const f of batch.features) seen.push(Number(f.properties.FID));
      strategy = batch.strategy;
    }

    expect(strategy).toBe('oid-window');
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(notices.join(' ')).toContain('supportsPagination=false');
    expect(notices.join(' ')).toContain('Pagination is not supported');
    // Nunca debe enviar parámetros de paginación a este servicio.
    expect(calls.every((c) => c.params.get('resultRecordCount') === null)).toBe(true);
    expect(calls.every((c) => c.params.get('resultOffset') === null)).toBe(true);
    // Ni orderByFields: la capa declara supportsOrderBy: false.
    expect(calls.every((c) => c.params.get('orderByFields') === null)).toBe(true);
    // Ventanas contiguas de tamaño maxRecordCount (2): (-1,1], (1,3], (3,5]…
    expect(calls[0]?.params.get('where')).toContain('FID > -1 AND FID <= 1');
    expect(calls[1]?.params.get('where')).toContain('FID > 1 AND FID <= 3');
  });

  it('tolera huecos en el OID y se detiene tras tres ventanas vacías', async () => {
    // Registros en 0..1 y luego un salto grande: el barrido debe parar, no colgarse.
    const { fetchImpl, calls } = noPaginationServer([0, 1]);
    const notices: string[] = [];
    const seen: number[] = [];
    for await (const batch of iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: noPaginationLayer,
      onNotice: (n) => notices.push(n),
    })) {
      for (const f of batch.features) seen.push(Number(f.properties.FID));
    }
    expect(seen).toEqual([0, 1]);
    expect(notices.join(' ')).toContain('ventanas de FID vacías');
    // 1 ventana con datos + 3 vacías.
    expect(calls).toHaveLength(4);
  });

  it('recorta la muestra a maxFeatures aunque el servidor devuelva la página entera', async () => {
    // Capa sin OID y sin paginación: el servidor manda hasta su maxRecordCount.
    const { fetchImpl, calls } = makeFetch([
      [(u) => u.pathname.endsWith('/query'), () => geojsonPage([1, 2, 3, 4, 5, 6])],
    ]);
    const seen: number[] = [];
    for await (const batch of iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: {
        id: 0,
        name: 'SIN_OID',
        maxRecordCount: 2000,
        supportedQueryFormats: 'geoJSON',
        capabilities: 'Query',
        fields: [{ name: 'CODIGO', type: 'esriFieldTypeString' }],
        advancedQueryCapabilities: { supportsPagination: false },
      },
      maxFeatures: 3,
    })) {
      for (const f of batch.features) seen.push(Number(f.properties.OBJECTID));
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params.get('resultRecordCount')).toBeNull();
  });

  it('se detiene si el servicio ignora la ventana y repite la misma página', async () => {
    // Servicio hostil: devuelve siempre los mismos OID, ignorando el where.
    const { fetchImpl, calls } = makeFetch([
      [(u) => u.pathname.endsWith('/query'), () => geojsonPage([1, 2], 'FID')],
    ]);
    const notices: string[] = [];
    const seen: number[] = [];
    for await (const batch of iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: noPaginationLayer,
      onNotice: (n) => notices.push(n),
    })) {
      for (const f of batch.features) seen.push(Number(f.properties.FID));
    }
    expect(seen).toEqual([1, 2]);
    expect(notices.join(' ')).toContain('OID ya vistos');
    // Dos peticiones: la primera devuelve datos, la segunda solo repetidos.
    expect(calls).toHaveLength(2);
  });

  it('respeta maxFeatures', async () => {
    const { fetchImpl } = makeFetch([
      [(u) => u.pathname.endsWith('/query'), () => geojsonPage([1, 2])],
    ]);
    let total = 0;
    for await (const batch of iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: paginatedLayer,
      maxFeatures: 1,
    })) {
      total += batch.features.length;
    }
    expect(total).toBe(1);
  });

  it('emite una sola página cuando no hay paginación ni campo OID', async () => {
    const { fetchImpl, calls } = makeFetch([
      [(u) => u.pathname.endsWith('/query'), () => geojsonPage([1, 2])],
    ]);
    const notices: string[] = [];
    const batches: unknown[] = [];
    for await (const batch of iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: {
        id: 0,
        name: 'SIN_OID',
        maxRecordCount: 2,
        supportedQueryFormats: 'geoJSON',
        capabilities: 'Query',
        fields: [{ name: 'CODIGO', type: 'esriFieldTypeString' }],
        advancedQueryCapabilities: { supportsPagination: false },
      },
      onNotice: (n) => notices.push(n),
    })) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(notices.join(' ')).toContain('primera página');
  });

  it('no envía resultRecordCount a un servicio que declara supportsPagination false', async () => {
    const { fetchImpl, calls } = makeFetch([
      [(u) => u.pathname.endsWith('/query'), () => geojsonPage([0, 1], 'FID')],
    ]);
    const it0 = iterateFeatures(client(fetchImpl), layerUrl, { layerInfo: noPaginationLayer });
    await it0.next();
    expect(calls[0]?.params.get('resultRecordCount')).toBeNull();
    expect(calls[0]?.params.get('resultOffset')).toBeNull();
  });
});

describe('iterateFeatures — negociación de formato', () => {
  const layerUrl = 'https://mapas.test/server/rest/services/X/MapServer/0';

  it('reintenta con f=json y convierte cuando geojson falla', async () => {
    const { fetchImpl, calls } = makeFetch([
      [
        (u) => u.searchParams.get('f') === 'geojson',
        () => ({ error: { code: 400, message: 'Unsupported format geojson' } }),
      ],
      [
        (u) => u.searchParams.get('f') === 'json',
        () => ({
          objectIdFieldName: 'OBJECTID',
          features: [
            {
              attributes: { OBJECTID: 1, CODIGO: 'x' },
              geometry: {
                rings: [
                  [
                    [0, 0],
                    [0, 1],
                    [1, 1],
                    [1, 0],
                  ],
                ],
              },
            },
          ],
        }),
      ],
    ]);

    const notices: string[] = [];
    const batches: { format: string; n: number }[] = [];
    for await (const batch of iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: {
        id: 0,
        name: 'X',
        maxRecordCount: 10,
        supportedQueryFormats: 'JSON, geoJSON',
        capabilities: 'Query',
        objectIdField: 'OBJECTID',
        advancedQueryCapabilities: { supportsPagination: true },
      },
      onNotice: (n) => notices.push(n),
    })) {
      batches.push({ format: batch.format, n: batch.features.length });
    }

    expect(batches[0]?.format).toBe('json');
    expect(notices.join(' ')).toContain('esri→GeoJSON');
    expect(calls.some((c) => c.params.get('f') === 'geojson')).toBe(true);
    expect(calls.some((c) => c.params.get('f') === 'json')).toBe(true);
  });

  it('va directo a f=json si la capa no declara geoJSON', async () => {
    const { fetchImpl, calls } = makeFetch([
      [() => true, () => ({ objectIdFieldName: 'OBJECTID', features: [] })],
    ]);
    const notices: string[] = [];
    const it0 = iterateFeatures(client(fetchImpl), layerUrl, {
      layerInfo: {
        id: 0,
        name: 'X',
        maxRecordCount: 10,
        supportedQueryFormats: 'JSON',
        capabilities: 'Query',
        objectIdField: 'OBJECTID',
        advancedQueryCapabilities: { supportsPagination: true },
      },
      onNotice: (n) => notices.push(n),
    });
    await it0.next();
    expect(calls[0]?.params.get('f')).toBe('json');
    expect(notices.join(' ')).toContain('no declara geoJSON');
  });
});
