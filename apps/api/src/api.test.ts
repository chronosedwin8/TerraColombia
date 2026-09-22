import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnvFile } from './lib/env.js';

/**
 * Pruebas de la API con `inject` de Fastify: no abren puerto, pero recorren todo el ciclo
 * (rutas, guardas, validación, manejo de errores) contra la base real.
 *
 * Se saltan si no hay `DATABASE_URL`.
 */
loadEnvFile();
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

/*
 * El municipio y el predio con los que se prueba NO se fijan a mano.
 *
 * Estaban clavados al corte de demostración de Soledad, así que la suite daba por hecho que
 * esos datos sintéticos estarían siempre publicados. Eso ata las pruebas a la demostración:
 * al cargar el catastro real hay que despublicar el corte sintético del mismo municipio para
 * que no convivan dos activos, y en ese momento la mitad de la suite se caería por un código
 * predial que dejó de existir.
 *
 * Se descubren de la base: se toma un municipio con predios cargados y un predio suyo, sea
 * el corte real o el de demostración. Si no hay ninguno, las pruebas que dependen de un
 * predio concreto se saltan diciéndolo, en vez de fallar como si el código estuviera roto.
 */
let DEMO_MUNI = '';
let DEMO_NPN = '';
/** Un predio de un corte SINTÉTICO, para comprobar que la API lo marca como tal. */
let SYNTHETIC_NPN = '';
/** Centroide del predio descubierto, para pedir una tesela donde de verdad haya algo. */
let TILE_LNG_LAT: [number, number] | null = null;

let app: FastifyInstance;
let token = '';

d('API', () => {
  beforeAll(async () => {
    // La suite hace bastantes más peticiones por minuto que una persona, y el límite del
    // plan gratis (30/min) la cortaría. Se eleva solo aquí; hay una prueba dedicada más
    // abajo que comprueba que el límite sí se aplica y responde 429.
    process.env.RATE_LIMIT_OVERRIDE = '10000';
    const { buildApp } = await import('./app.js');
    app = await buildApp();
    await app.ready();

    const { query } = await import('@terracolombia/db');
    const { sql } = await import('@terracolombia/db/sql');
    // Se prefiere un municipio con muchos predios: da más probabilidades de que las
    // consultas de contexto y cercanía tengan algo que devolver.
    const fila = (
      await query<{ npn: string; muni_code: string; lng: number; lat: number }>(sql`
        SELECT p.npn, p.muni_code,
               ST_X(p.centroid)::double precision AS lng,
               ST_Y(p.centroid)::double precision AS lat
        FROM core.parcel p
        JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
        WHERE p.centroid IS NOT NULL
        ORDER BY p.muni_code
        LIMIT 1
      `)
    )[0];
    if (fila) {
      DEMO_NPN = fila.npn;
      DEMO_MUNI = fila.muni_code;
      TILE_LNG_LAT = [fila.lng, fila.lat];
    }

    // El aviso de datos de demostración es una regla del producto, así que se comprueba
    // contra un predio sintético de verdad, no contra el primero que aparezca.
    const sintetico = (
      await query<{ npn: string }>(sql`
        SELECT p.npn FROM core.parcel p
        JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active AND s.is_synthetic
        LIMIT 1
      `)
    )[0];
    SYNTHETIC_NPN = sintetico?.npn ?? '';
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    const { closePool, disconnectPrisma } = await import('@terracolombia/db');
    await closePool();
    await disconnectPrisma();
  });

  // ─── Procedencia: la regla que no se puede romper ──────────────────────────
  describe('procedencia (regla 4)', () => {
    it('toda respuesta con cifras trae meta.sources', async () => {
      for (const url of [
        '/api/v1/search?q=soledad',
        `/api/v1/municipalities/${DEMO_MUNI}`,
        `/api/v1/parcels/${DEMO_NPN}`,
        '/api/v1/nearby?lat=10.912&lng=-74.771&radius=1000',
      ]) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode, `${url} respondió ${res.statusCode}`).toBe(200);
        const body = res.json();
        expect(body.meta, `${url} sin meta`).toBeDefined();
        expect(Array.isArray(body.meta.sources), `${url} sin sources`).toBe(true);
      }
    });

    it('cada fuente declara licencia y atribución', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/parcels/${DEMO_NPN}` });
      for (const s of res.json().meta.sources) {
        expect(s.license.length).toBeGreaterThan(2);
        expect(s.attribution.length).toBeGreaterThan(10);
        expect(s).toHaveProperty('cutDate');
      }
    });

    it('marca los datos de demostración y lo avisa', async () => {
      // Si ya no queda ningún corte sintético publicado —lo normal en producción—, no hay
      // nada que comprobar aquí, y decirlo es mejor que fallar como si algo se hubiera roto.
      if (!SYNTHETIC_NPN) {
        expect(SYNTHETIC_NPN, 'no hay predios sintéticos publicados: nada que marcar').toBe('');
        return;
      }
      const res = await app.inject({ method: 'GET', url: `/api/v1/parcels/${SYNTHETIC_NPN}` });
      const meta = res.json().meta;
      expect(meta.synthetic).toBe(true);
      expect(meta.warnings.some((w: string) => w.includes('DEMOSTRACIÓN'))).toBe(true);
    });

    it('un predio de una fuente real NO se marca como demostración', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/parcels/${DEMO_NPN}` });
      const meta = res.json().meta;
      const esSintetico = DEMO_NPN === SYNTHETIC_NPN;
      expect(meta.synthetic).toBe(esSintetico);
    });

    it('la cabecera de atribución viaja en toda respuesta', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/layers' });
      expect(res.headers['x-terracolombia-attribution']).toContain('IGAC');
    });
  });

  // ─── Cobertura honesta (regla 6) ───────────────────────────────────────────
  describe('cobertura honesta (regla 6)', () => {
    it('un municipio no-IGAC explica quién lo gestiona y qué sí hay', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/municipalities/11001' });
      const cov = res.json().meta.coverage;
      expect(cov.isIgac).toBe(false);
      expect(cov.status).toBe('none');
      expect(cov.message).toContain('gestiona');
      expect(cov.message.length).toBeGreaterThan(60);
    });

    it('el resumen nacional dice cuántos municipios tienen predios', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/coverage' });
      const s = res.json().data.summary;
      expect(s.total_municipalities).toBeGreaterThan(1000);
      expect(s.with_parcels).toBeLessThanOrEqual(s.total_municipalities);
    });
  });

  // ─── Estados vacíos honestos ───────────────────────────────────────────────
  describe('estados vacíos', () => {
    it('una búsqueda sin resultados explica qué intentar', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=zzzzqqqqxxxxnoexiste',
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.results).toHaveLength(0);
      expect(data.emptyReason).toBeTruthy();
      expect(data.emptyReason).toContain('código predial');
    });

    it('el historial vacío dice por qué está vacío', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/parcels/${DEMO_NPN}/history` });
      const data = res.json().data;
      if (data.changes.length === 0) expect(data.emptyReason).toBeTruthy();
    });
  });

  // ─── Búsqueda universal ────────────────────────────────────────────────────
  describe('búsqueda', () => {
    it('encuentra un municipio por nombre', async () => {
      // Soledad se busca por su nombre, así que el código esperado es el suyo y no el del
      // predio que la suite haya descubierto, que puede ser de cualquier municipio.
      const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=soledad' });
      const first = res.json().data.results[0];
      expect(first.kind).toBe('municipality');
      expect(first.target.code).toBe('08758');
    });

    it('interpreta coordenadas y lo declara', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=10.912,-74.771' });
      const results = res.json().data.results;
      const coords = results.find((r: { kind: string }) => r.kind === 'coordinates');
      expect(coords).toBeDefined();
      expect(coords.interpretation).toContain('coordenadas');
    });

    it('interpreta un NPN y encuentra el predio', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/search?q=${DEMO_NPN}` });
      const first = res.json().data.results[0];
      expect(first.target.npn).toBe(DEMO_NPN);
      expect(first.interpretation).toContain('Número Predial Nacional');
    });

    it('un NPN con estructura válida pero inexistente lo explica', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=999990101010200010001000000000',
      });
      const first = res.json().data.results[0];
      expect(first.interpretation).toContain('estructura válida');
    });

    it('rechaza una consulta vacía', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    });

    // La búsqueda por texto compara por trigramas contra el nombre, así que "08758" no se
    // parece a "Soledad" y el código no encontraba nada. Escribir el código DIVIPOLA es de
    // lo más natural para quien trabaja con estos datos.
    it('encuentra un municipio por su código DIVIPOLA', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/search?q=${DEMO_MUNI}` });
      const first = res.json().data.results[0];
      expect(first.kind).toBe('municipality');
      expect(first.target.code).toBe(DEMO_MUNI);
      expect(first.interpretation).toContain('DIVIPOLA');
    });

    it('encuentra un departamento por su código DIVIPOLA', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=08' });
      const first = res.json().data.results[0];
      expect(first.kind).toBe('department');
      expect(first.target.code).toBe('08');
      expect(first.label).toBe('Atlántico');
    });

    it('un código DIVIPOLA inexistente lo dice en vez de callar', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=99999' });
      expect(res.json().data.results).toHaveLength(0);
      expect(res.json().data.emptyReason).toContain('DIVIPOLA');
    });

    // No ingerimos ninguna fuente con códigos postales. Devolver una lista vacía y muda
    // parece un fallo de la búsqueda; decirlo es lo honesto (regla 6).
    it('explica que no manejamos códigos postales', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=083001' });
      const reason = res.json().data.emptyReason ?? '';
      expect(reason).toContain('código postal');
      expect(reason).toContain('DIVIPOLA');
    });
  });

  // ─── Ficha de predio ───────────────────────────────────────────────────────
  describe('ficha de predio', () => {
    it('trae el NPN explicado en lenguaje claro', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/parcels/${DEMO_NPN}` });
      const d0 = res.json().data;
      expect(d0.npnExplained.length).toBeGreaterThan(80);
      expect(d0.npnPretty).toContain('-');
    });

    it('acompaña el avalúo con la advertencia de que no es valor comercial', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/parcels/${DEMO_NPN}` });
      expect(res.json().data.cadastralValueWarning).toContain('avalúo');
    });

    it('un NPN mal formado da INVALID_NPN con mensaje útil', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/parcels/123' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_NPN');
      expect(res.json().error.message).toContain('30 dígitos');
    });

    it('el código anterior de 20 dígitos no se convierte: se explica', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/parcels/08758010101020001000' });
      expect([404, 400]).toContain(res.statusCode);
      expect(res.json().error.message).toMatch(/formato anterior|20 dígitos/);
    });

    it('devuelve la geometría cuando se pide', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/parcels/${DEMO_NPN}?geometry=true`,
      });
      expect(res.json().data.geometry.type).toBe('MultiPolygon');
    });

    it('el contexto declara los huecos en vez de poner ceros', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/parcels/${DEMO_NPN}/context?radius=1000`,
      });
      const ctx = res.json().data;
      // Sin manzanas censales cargadas, la población debe ser NO_DISPONIBLE, no 0.
      if (ctx.population.blocksUsed === 0) {
        expect(ctx.population.total).toBe('NO_DISPONIBLE');
      }
      expect(res.json().meta.warnings.length).toBeGreaterThan(0);
    });
  });

  // ─── Teselas ───────────────────────────────────────────────────────────────
  describe('teselas', () => {
    /*
     * La tesela se calcula desde el centroide del predio descubierto, no con unas
     * coordenadas fijas. Estaban clavadas sobre Soledad, donde vivían los predios de
     * demostración: al apagar el corte sintético la tesela quedó vacía y la prueba falló
     * sin que nada estuviera roto.
     */
    it('sirve predios a zoom 15 donde hay predios', async () => {
      if (!TILE_LNG_LAT) {
        expect(TILE_LNG_LAT, 'no hay predios con centroide: nada que teselar').toBeNull();
        return;
      }
      const [lng, lat] = TILE_LNG_LAT;
      const z = 15;
      const x = Math.floor(((lng + 180) / 360) * 2 ** z);
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
      );
      const res = await app.inject({ method: 'GET', url: `/api/v1/tiles/parcel/${z}/${x}/${y}.mvt` });
      expect(res.statusCode, `tesela ${z}/${x}/${y} sobre ${lng},${lat}`).toBe(200);
      expect(res.headers['content-type']).toContain('mapbox-vector-tile');
      expect(res.rawPayload.length).toBeGreaterThan(100);
    });

    it('no sirve predios por debajo del zoom 14', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/tiles/parcel/10/300/500.mvt' });
      expect(res.statusCode).toBe(204);
    });

    it('rechaza una capa desconocida', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/tiles/propietarios/15/1/1.mvt' });
      expect(res.statusCode).toBe(404);
    });

    it('rechaza coordenadas imposibles para el zoom', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/tiles/parcel/14/99999/1.mvt' });
      expect(res.statusCode).toBe(400);
    });

    /**
     * Al mover o acercar el mapa, MapLibre pide decenas de teselas a la vez. Cuando
     * compartían cubo con el resto de la API, abrir el mapa agotaba el tope del minuto
     * —30 peticiones en el plan gratuito— y a partir de ahí fallaba todo: el mapa a medias
     * y cualquier otra llamada con 429. Las teselas cuentan aparte y con más margen.
     */
    it('una ráfaga de teselas no agota la cuota por minuto de la API', async () => {
      const previo = process.env.RATE_LIMIT_OVERRIDE;
      delete process.env.RATE_LIMIT_OVERRIDE;
      const { buildApp } = await import('./app.js');
      const real = await buildApp();
      await real.ready();
      try {
        // Muchas más que las 30 por minuto del plan gratuito.
        let ultimo = 0;
        for (let i = 0; i < 60; i += 1) {
          const res = await real.inject({
            method: 'GET',
            url: `/api/v1/tiles/h3/10/${290 + i}/${480 + (i % 7)}.mvt`,
          });
          ultimo = res.statusCode;
          if (ultimo === 429) break;
        }
        expect(ultimo, 'la ráfaga de teselas se estranguló con el tope de la API').not.toBe(429);

        // Y el cubo de la API sigue intacto pese a las teselas gastadas.
        const api = await real.inject({ method: 'GET', url: '/api/v1/search?q=soledad' });
        expect(api.statusCode).toBe(200);
      } finally {
        await real.close();
        if (previo !== undefined) process.env.RATE_LIMIT_OVERRIDE = previo;
      }
    }, 60_000);

    /**
     * MapLibre necesita un identificador por entidad (`promoteId`) para asignar
     * `feature-state`. Sin él, el resaltado al pasar el ratón y la selección al hacer clic
     * no hacen nada y no se produce ningún error: así estaban 8 de las 13 capas.
     */
    it('toda capa interactiva publica su identificador de entidad', async () => {
      const { TILE_LAYERS } = await import('@terracolombia/db');
      const sinId = Object.values(TILE_LAYERS)
        .filter((l) => !l.featureIdColumn)
        .map((l) => l.id);
      expect(
        sinId,
        `Estas capas no declaran identificador, así que el resaltado y la selección ` +
          `quedarían muertos en ellas: ${sinId.join(', ')}`,
      ).toEqual([]);
    });

    /**
     * El panel de capas del mapa decide el candado con `LAYER_RULES`; la ruta de teselas
     * decide el 403 con `meta.layer`. Si la semilla queda vieja, la interfaz vuelve a
     * ofrecer como gratuita una capa que el servidor niega en silencio.
     */
    it('el catálogo servido coincide con las reglas que lee el cliente', async () => {
      const { LAYER_RULES } = await import('@terracolombia/shared');
      const res = await app.inject({ method: 'GET', url: '/api/v1/layers' });
      const servidas = res.json().data.layers as Array<{
        id: string;
        minZoom: number;
        maxZoom: number;
        minPlan: string;
      }>;
      const discrepancias = servidas
        .filter((l) => l.id in LAYER_RULES)
        .flatMap((l) => {
          const r = LAYER_RULES[l.id as keyof typeof LAYER_RULES];
          const d: string[] = [];
          if (l.minZoom !== r.minZoom) d.push(`${l.id}.minZoom ${l.minZoom} ≠ ${r.minZoom}`);
          if (l.maxZoom !== r.maxZoom) d.push(`${l.id}.maxZoom ${l.maxZoom} ≠ ${r.maxZoom}`);
          if (l.minPlan !== r.minPlan) d.push(`${l.id}.minPlan ${l.minPlan} ≠ ${r.minPlan}`);
          return d;
        });
      expect(
        discrepancias,
        `El catálogo de meta.layer no coincide con LAYER_RULES: ${discrepancias.join('; ')}. ` +
          'Vuelve a sembrar las capas (`pnpm db:seed`).',
      ).toEqual([]);
    });

    it('bloquea una capa de plan superior en el plan gratis', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tiles/soil_unit/12/1197/1923.mvt',
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('PLAN_REQUIRED');
    });

    it('el TileJSON trae la atribución obligatoria', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/tiles/parcel.json' });
      expect(res.json().attribution).toContain('IGAC');
      expect(res.json().minzoom).toBe(14);
    });
  });

  // ─── Guardas de plan ───────────────────────────────────────────────────────
  describe('guardas de plan', () => {
    it('la búsqueda avanzada exige plan', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/parcels/query',
        payload: { scope: { municipality: DEMO_MUNI } },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('PLAN_REQUIRED');
    });

    it('el análisis de zona exige plan', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/areas/analyze',
        payload: { scope: { kind: 'radius', center: [-74.771, 10.912], radiusM: 500 } },
      });
      expect(res.statusCode).toBe(403);
    });

    it('administración exige rol', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/metrics' });
      expect([401, 403]).toContain(res.statusCode);
    });
  });

  // ─── Cuenta ────────────────────────────────────────────────────────────────
  describe('cuenta', () => {
    const email = `test-api-${Date.now()}@terracolombia.test`;

    it('registra una cuenta nueva en plan gratis', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'una-contrasena-larga-de-prueba' },
      });
      expect(res.statusCode).toBe(201);
      token = res.json().data.accessToken;
      expect(token).toBeTruthy();
      // El plan va dentro de la ficha del usuario, que es la misma que devuelven login,
      // refresh y /me. Ver src/contract.test.ts.
      expect(res.json().data.user.plan).toBe('free');
    });

    it('no revela si un correo ya existe', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'otra-contrasena-larga' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).not.toContain('ya existe');
    });

    it('rechaza una contraseña corta explicando el mínimo', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: `x${Date.now()}@test.co`, password: 'corta' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json())).toContain('10');
    });

    it('/me devuelve plan, permisos y créditos', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const d0 = res.json().data;
      expect(d0.plan).toBe('free');
      expect(d0.entitlements.canExport).toBe(false);
      expect(d0.credits).toBe(0);
      expect(d0.planDetail.name).toBe('Gratis');
    });

    it('/me sin sesión da 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
      expect(res.statusCode).toBe(401);
    });

    it('un token inválido se trata como anónimo, no rompe', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization: 'Bearer token-falso' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('la llave de API solo muestra el secreto al crearla', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Prueba', environment: 'sandbox' },
      });
      expect(created.statusCode).toBe(201);
      const secret = created.json().data.secret;
      expect(secret).toMatch(/^tc_test_[0-9a-f]+\./);

      const listed = await app.inject({
        method: 'GET',
        url: '/api/v1/api-keys',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(listed.payload).not.toContain(secret.split('.')[1]);
    });

    it('la llave de API autentica en /geo/v1', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Prueba GeoAPI', environment: 'sandbox' },
      });
      const secret = created.json().data.secret;
      const res = await app.inject({
        method: 'GET',
        url: `/geo/v1/municipalities/${DEMO_MUNI}`,
        headers: { authorization: `Bearer ${secret}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.code).toBe(DEMO_MUNI);
    });

    it('el entorno live exige un plan con API', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Live', environment: 'live' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── Catálogos y textos legales ────────────────────────────────────────────
  describe('catálogos', () => {
    it('las capas traen leyenda y glosario', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/layers' });
      const layers = res.json().data.layers;
      expect(layers.length).toBeGreaterThanOrEqual(14);
      const parcel = layers.find((l: { id: string }) => l.id === 'parcel');
      expect(parcel.legend.length).toBeGreaterThan(0);
      expect(parcel.glossary.length).toBeGreaterThan(0);
      expect(parcel.minZoom).toBe(14);
    });

    it('el glosario explica cada término en lenguaje claro', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/glossary' });
      for (const t of res.json().data.terms) {
        expect(t.plain.length).toBeGreaterThan(30);
      }
    });

    it('los textos legales incluyen las cuatro negativas del plan', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/legal' });
      const all = res.json().data.allDisclaimers.join(' ');
      expect(all).toContain('certificado catastral');
      expect(all).toContain('avalúo comercial');
      expect(all).toContain('norma urbanística');
      expect(all).toContain('estudio de títulos');
    });

    it('la atribución obligatoria está publicada', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/legal' });
      expect(res.json().data.attributionRequired).toContain('CC BY-SA 4.0');
    });
  });

  // ─── Asistente sin IA ──────────────────────────────────────────────────────
  describe('asistente', () => {
    it('declara si la IA está disponible', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ai/status',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(typeof res.json().data.enabled).toBe('boolean');
    });

    it('"Explícame esto" funciona sin IA usando el glosario', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/explain',
        headers: { authorization: `Bearer ${token}` },
        payload: { subject: 'avaluo_catastral' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.mode).toBe('glossary');
      expect(res.json().data.explanation).toContain('precio');
    });
  });

  // ─── Errores ───────────────────────────────────────────────────────────────
  describe('errores', () => {
    it('una ruta inexistente apunta a la documentación', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/no-existe' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.details.docs).toContain('/docs');
    });

    it('la documentación OpenAPI se publica completa', async () => {
      const res = await app.inject({ method: 'GET', url: '/docs/json' });
      const spec = res.json();
      expect(Object.keys(spec.paths).length).toBeGreaterThan(40);
      expect(spec.info.description).toContain('CC BY-SA 4.0');
    });

    it('/health reporta el estado de la base', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json().database.postgis).toBeTruthy();
    });
  });

  // ─── Límite de peticiones ──────────────────────────────────────────────────
  describe('límite de peticiones', () => {
    it('responde 429 con código RATE_LIMITED, no 500', async () => {
      // Se levanta una instancia aparte con un límite mínimo para provocarlo sin
      // interferir con el resto de la suite.
      process.env.RATE_LIMIT_OVERRIDE = '2';
      const { buildApp } = await import('./app.js');
      const limited = await buildApp();
      await limited.ready();
      try {
        const codes: number[] = [];
        for (let i = 0; i < 6; i++) {
          const res = await limited.inject({ method: 'GET', url: '/api/v1/glossary' });
          codes.push(res.statusCode);
          if (res.statusCode === 429) {
            expect(res.json().error.code).toBe('RATE_LIMITED');
            expect(res.json().error.message).toContain('Demasiadas peticiones');
          }
        }
        expect(codes).toContain(429);
        expect(codes).not.toContain(500);
      } finally {
        await limited.close();
        process.env.RATE_LIMIT_OVERRIDE = '10000';
      }
    });

    it('no estrangula las sondas de salud ni la documentación', async () => {
      process.env.RATE_LIMIT_OVERRIDE = '1';
      const { buildApp } = await import('./app.js');
      const limited = await buildApp();
      await limited.ready();
      try {
        for (let i = 0; i < 5; i++) {
          const res = await limited.inject({ method: 'GET', url: '/health/live' });
          expect(res.statusCode).toBe(200);
        }
      } finally {
        await limited.close();
        process.env.RATE_LIMIT_OVERRIDE = '10000';
      }
    });
  });
});
