import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import underPressure from '@fastify/under-pressure';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError, MESSAGES, setLogger } from '@terracolombia/shared';
import { healthCheck } from '@terracolombia/db';
import { loadConfig } from './config.js';
import authPlugin from './plugins/auth.js';
import quotaPlugin from './plugins/quota.js';
import { createCache } from './plugins/cache.js';
import type { Cache } from './plugins/cache.js';

import healthRoutes from './routes/health.js';
import searchRoutes from './routes/search.js';
import municipalityRoutes from './routes/municipalities.js';
import parcelRoutes from './routes/parcels.js';
import nearbyRoutes from './routes/nearby.js';
import areaRoutes from './routes/areas.js';
import suitabilityRoutes from './routes/suitability.js';
import locationIntelRoutes from './routes/location-intel.js';
import changeRoutes from './routes/changes.js';
import indicatorRoutes from './routes/indicators.js';
import layerRoutes from './routes/layers.js';
import glossaryRoutes from './routes/glossary.js';
import tileRoutes from './routes/tiles.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import projectRoutes from './routes/projects.js';
import reportRoutes from './routes/reports.js';
import jobRoutes from './routes/jobs.js';
import billingRoutes from './routes/billing.js';
import apiKeyRoutes from './routes/api-keys.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import fileRoutes from './routes/files.js';
import billingViewRoutes from './routes/billing-views.js';
import passwordResetRoutes from './routes/password-reset.js';

declare module 'fastify' {
  interface FastifyInstance {
    cache: Cache;
  }
}

/** Una petición de tesela vectorial, que se estrangula aparte del resto de la API. */
function isTileRequest(req: { url: string }): boolean {
  return req.url.includes('/tiles/');
}

/**
 * Cuánta ráfaga de teselas se admite por minuto.
 *
 * Un mapa no pide teselas de una en una: al mover o acercar, MapLibre lanza decenas a la vez
 * por cada capa visible. El tope por minuto tiene que cubrir esa ráfaga o el mapa se ve roto;
 * quien pone el techo real al consumo es la cuota diaria `tilesPerDay`, que ya se descuenta en
 * la ruta. El mínimo de 300 es lo que hace falta para que el mapa cargue de un tirón incluso
 * en el plan gratuito.
 */
/** Rutas de catálogo exentas del límite de peticiones (ver `allowList`). */
const CATALOG_PATHS = new Set(['/api/v1/glossary', '/api/v1/layers', '/api/v1/cuts']);

function tileBurstLimit(tilesPerDay: number | undefined): number {
  return Math.max(300, Math.floor((tilesPerDay ?? 20_000) / 100));
}

export async function buildApp(): Promise<FastifyInstance> {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        // Nunca registrar credenciales ni cookies.
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.token',
        ],
        censor: '[oculto]',
      },
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino/file', options: { destination: 1 } }
          : undefined,
    },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
    // Sin esto, un `/parcels/:npn` con barra final no encuentra la ruta.
    ignoreTrailingSlash: true,
  });

  setLogger(app.log as never);

  // ─── Seguridad ──────────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // La documentación de OpenAPI necesita estilos y scripts en línea.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Sin `Origin` (curl, servidor a servidor) se permite: la autorización la da la llave.
      if (!origin) return cb(null, true);
      const allowed = config.webOrigin.split(',').map((o) => o.trim());
      cb(null, allowed.includes(origin));
    },
    credentials: true,
    exposedHeaders: ['ETag', 'X-RateLimit-Remaining', 'X-Credits-Remaining'],
  });

  await app.register(cookie, { secret: config.jwtSecret });

  await app.register(
    fp(async (instance) => {
      await instance.register(jwt, {
        secret: config.jwtSecret,
        sign: { expiresIn: config.jwtAccessTtl },
      });
    }, { name: 'jwt' }),
  );

  await app.register(authPlugin);
  await app.register(quotaPlugin);

  // Límite de peticiones por plan. La clave es la organización, la llave o la IP.
  await app.register(rateLimit, {
    global: true,
    max: (req) => {
      // `RATE_LIMIT_OVERRIDE` solo existe para las pruebas automatizadas, que hacen muchas
      // más peticiones por minuto que una persona. No se documenta en .env.example.
      const override = Number(process.env.RATE_LIMIT_OVERRIDE ?? 0);
      if (override > 0) return override;
      const ent = req.auth?.entitlements;
      // Anónimo: 60 por minuto. Basta para explorar el mapa y abrir fichas sin cuenta
      // (unas diez pantallas por minuto) y sigue por debajo del plan gratuito (ADR-013).
      return isTileRequest(req) ? tileBurstLimit(ent?.tilesPerDay) : (ent?.rateLimitPerMinute ?? 60);
    },
    timeWindow: '1 minute',
    /**
     * Las teselas cuentan en un cubo aparte. Al compartir cubo con el resto de la API, abrir
     * el mapa agotaba la cuota del minuto de golpe —MapLibre pide decenas de teselas a la vez
     * al mover o acercar— y a partir de ahí fallaba todo: el mapa se quedaba a medias y
     * cualquier otra llamada respondía 429. Separarlas deja que el mapa funcione sin regalar
     * cuota a las rutas caras, y el gasto total sigue acotado por `tilesPerDay`, que la ruta
     * de teselas ya descuenta.
     */
    keyGenerator: (req) => {
      const base = req.auth?.apiKeyId ?? req.auth?.organizationId ?? req.auth?.userId ?? req.ip;
      return isTileRequest(req) ? `${base}:tiles` : base;
    },
    /**
     * Las sondas de salud y la documentación no se estrangulan: un orquestador que consulta
     * `/health` cada pocos segundos no debe quedarse sin cuota, y bloquear `/docs` solo
     * estorbaría a quien está aprendiendo a usar la API.
     *
     * Tampoco los catálogos públicos sin cifras (glosario, capas, cortes): la interfaz los
     * pide en cada carga completa de página. Con ellos dentro del cubo, un visitante anónimo
     * que abría seis pantallas seguidas agotaba sus 30 peticiones por minuto y la séptima le
     * respondía 429 por pedir el glosario.
     */
    allowList: (req) =>
      req.url.startsWith('/health') ||
      req.url.startsWith('/docs') ||
      (req.method === 'GET' && CATALOG_PATHS.has(req.url.split('?')[0] ?? '')),
    /**
     * El objeto que devuelve este constructor se propaga al manejador de errores. Si no es
     * un `AppError`, cae en la rama genérica y se responde 500 en vez de 429, que es
     * justamente lo contrario de lo que el cliente necesita saber.
     */
    errorResponseBuilder: (_req, context) =>
      new AppError('RATE_LIMITED', MESSAGES.errors.rateLimited, {
        limite: context.max,
        ventana: context.after,
      }),
  });

  // Rechaza con 503 cuando el proceso está saturado, en vez de acumular latencia.
  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1024 * 1024 * 1024,
    retryAfter: 15,
    healthCheck: async () => {
      const h = await healthCheck();
      return h.postgres !== null;
    },
    healthCheckInterval: 30_000,
  });

  // ─── Caché ──────────────────────────────────────────────────────────────────
  app.decorate('cache', await createCache(config.redisUrl));
  app.addHook('onClose', async () => {
    await app.cache.close();
  });

  // ─── OpenAPI ────────────────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'TerraColombia GeoAPI',
        description:
          'Inteligencia territorial de Colombia: catastro, suelos, geografía, demografía y equipamientos.\n\n' +
          'Toda respuesta incluye un bloque `meta` con las fuentes, sus fechas de corte y sus licencias. ' +
          'Los datos catastrales del IGAC están bajo CC BY-SA 4.0 y **obligan a atribuir**: ' +
          '"Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0".\n\n' +
          'El avalúo catastral no es el valor comercial del predio. Esta API entrega indicadores ' +
          'territoriales, no avalúos ni conceptos jurídicos.',
        version: '0.1.0',
        license: { name: 'Ver docs/LEGAL.md', url: 'https://terracolombia.co/legal' },
      },
      servers: [{ url: config.publicApiUrl }],
      tags: [
        { name: 'busqueda', description: 'Buscador universal' },
        { name: 'predios', description: 'Ficha, contexto e historial de predios' },
        { name: 'municipios', description: 'Fichas municipales y cobertura catastral' },
        { name: 'zonas', description: 'Análisis de área' },
        { name: 'inteligencia', description: 'Aptitud y localización de negocio' },
        { name: 'cambio', description: 'Comparación entre cortes' },
        { name: 'informes', description: 'Generación y descarga de informes' },
        { name: 'teselas', description: 'Teselas vectoriales' },
        { name: 'cuenta', description: 'Autenticación, planes y llaves' },
        { name: 'admin', description: 'Operación interna' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: {
            type: 'http',
            scheme: 'bearer',
            description: 'Llave de API con el formato tc_live_xxxx.secreto',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // ─── Manejo de errores ──────────────────────────────────────────────────────
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      req.log.info({ code: error.code, path: req.url }, error.message);
      return reply.status(error.statusCode).send(error.toJSON());
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION',
          message: 'La petición tiene campos inválidos.',
          details: {
            issues: error.issues.map((i) => ({
              campo: i.path.join('.'),
              problema: i.message,
            })),
          },
        },
      });
    }

    // `statement_timeout` de PostgreSQL
    const pgCode = (error as { code?: string }).code;
    if (pgCode === '57014') {
      const timeout = AppError.timeout();
      return reply.status(timeout.statusCode).send(timeout.toJSON());
    }

    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION',
          message: 'La petición tiene campos inválidos.',
          details: { issues: (error as { validation: unknown }).validation },
        },
      });
    }

    req.log.error({ err: error, path: req.url }, 'Error no controlado');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Algo falló de nuestro lado. Ya quedó registrado.',
        details: {},
      },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `No existe la ruta ${req.method} ${req.url}.`,
        details: { docs: `${config.publicApiUrl}/docs` },
      },
    });
  });

  // Atribución obligatoria en toda respuesta que toque datos del IGAC.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-TerraColombia-Attribution', 'Fuente: IGAC (CC BY-SA 4.0), DANE, MEN, MinSalud, OSM. Ver meta.sources en el cuerpo.');
    return payload;
  });

  // ─── Rutas ──────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(fileRoutes, { prefix: '/api/v1' });

  // Rutas de datos: se montan dos veces, en la API interna y en la pública.
  const dataRoutes = async (instance: FastifyInstance) => {
    await instance.register(searchRoutes);
    await instance.register(municipalityRoutes);
    await instance.register(parcelRoutes);
    await instance.register(nearbyRoutes);
    await instance.register(areaRoutes);
    await instance.register(suitabilityRoutes);
    await instance.register(locationIntelRoutes);
    await instance.register(changeRoutes);
    await instance.register(indicatorRoutes);
    await instance.register(layerRoutes);
    await instance.register(glossaryRoutes);
    await instance.register(tileRoutes);
  };

  await app.register(dataRoutes, { prefix: '/api/v1' });
  await app.register(dataRoutes, { prefix: '/geo/v1' });

  // Rutas de sesión y negocio: solo en la API interna.
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(passwordResetRoutes, { prefix: '/api/v1/auth' });
  await app.register(meRoutes, { prefix: '/api/v1' });
  await app.register(projectRoutes, { prefix: '/api/v1/projects' });
  await app.register(reportRoutes, { prefix: '/api/v1/reports' });
  await app.register(jobRoutes, { prefix: '/api/v1/jobs' });
  await app.register(billingRoutes, { prefix: '/api/v1/billing' });
  await app.register(billingViewRoutes, { prefix: '/api/v1/billing' });
  await app.register(apiKeyRoutes, { prefix: '/api/v1/api-keys' });
  await app.register(aiRoutes, { prefix: '/api/v1/ai' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  return app;
}
