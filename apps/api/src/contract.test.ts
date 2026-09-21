import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnvFile } from './lib/env.js';

/**
 * Conformidad del contrato entre `apps/web` y `apps/api`.
 *
 * La lista de abajo es **toda** ruta que el cliente del frontend llama, extraída de
 * `apps/web/src/api/*.ts`. Esta prueba comprueba que cada una existe y que sus campos
 * obligatorios están donde el frontend los busca.
 *
 * Por qué existe: un desajuste aquí no rompe la compilación ni ninguna prueba unitaria.
 * Se manifiesta como una pantalla que dice "Plan Gratis" a quien pagó, o como un botón que
 * no hace nada. Eso ya pasó una vez con `/auth/login`, que no devolvía el plan.
 */
loadEnvFile();
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

let app: FastifyInstance;
let token = '';
let projectId = '';

/** Rutas que llama el frontend, con el método y si necesitan sesión. */
const WEB_ROUTES: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; auth: boolean; body?: unknown }> = [
  { method: 'GET', path: '/api/v1/search?q=soledad', auth: false },
  { method: 'GET', path: '/api/v1/layers', auth: false },
  { method: 'GET', path: '/api/v1/glossary', auth: false },
  { method: 'GET', path: '/api/v1/municipalities/08758', auth: false },
  { method: 'GET', path: '/api/v1/parcels/087580101010200010001000000000', auth: false },
  { method: 'GET', path: '/api/v1/parcels/087580101010200010001000000000/context', auth: false },
  { method: 'GET', path: '/api/v1/parcels/087580101010200010001000000000/history', auth: false },
  { method: 'GET', path: '/api/v1/nearby?lat=10.912&lng=-74.771&radius=500', auth: false },
  { method: 'GET', path: '/api/v1/indicators/08758', auth: false },
  { method: 'GET', path: '/api/v1/location-intel/templates', auth: false },
  { method: 'GET', path: '/api/v1/me', auth: true },
  { method: 'GET', path: '/api/v1/projects', auth: true },
  { method: 'GET', path: '/api/v1/reports', auth: true },
  { method: 'GET', path: '/api/v1/api-keys', auth: true },
  { method: 'GET', path: '/api/v1/api-keys/usage?days=30', auth: true },
  { method: 'GET', path: '/api/v1/billing/subscription', auth: true },
  { method: 'GET', path: '/api/v1/billing/team', auth: true },
  { method: 'GET', path: '/api/v1/admin/metrics', auth: true },
  { method: 'GET', path: '/api/v1/admin/etl/runs', auth: true },
  {
    method: 'POST',
    path: '/api/v1/auth/password-reset',
    auth: false,
    body: { email: 'alguien@ejemplo.co' },
  },
  {
    method: 'POST',
    path: '/api/v1/areas/analyze',
    auth: true,
    body: { scope: { kind: 'radius', center: [-74.771, 10.912], radiusM: 400 } },
  },
  {
    method: 'POST',
    path: '/api/v1/suitability',
    auth: true,
    body: {
      target: { kind: 'parcel', npn: '087580101010200010001000000000' },
      use: 'vivienda_unifamiliar',
    },
  },
  {
    method: 'POST',
    path: '/api/v1/location-intel',
    auth: true,
    body: {
      templateId: 'colegio',
      scope: { kind: 'radius', center: [-74.771, 10.912], radiusM: 800 },
    },
  },
  {
    method: 'POST',
    path: '/api/v1/changes/compare',
    auth: true,
    body: {
      scope: { kind: 'radius', center: [-74.771, 10.912], radiusM: 400 },
      fromCutDate: '2026-08-01',
      toCutDate: '2026-09-01',
    },
  },
  { method: 'POST', path: '/api/v1/ai/explain', auth: true, body: { subject: 'npn' } },
  { method: 'POST', path: '/api/v1/ai/ask', auth: true, body: { question: '¿Qué es un predio?' } },
];

d('contrato entre la web y la API', () => {
  beforeAll(async () => {
    process.env.RATE_LIMIT_OVERRIDE = '10000';
    const { buildApp } = await import('./app.js');
    app = await buildApp();
    await app.ready();

    // Cuenta con plan alto: así se distingue "la ruta no existe" de "tu plan no la incluye".
    const email = `contrato-${Date.now()}@terracolombia.test`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'contrasena-de-prueba-larga' },
    });
    const orgId = reg.json().data.user.organizationId;

    const { query } = await import('@terracolombia/db');
    const { sql } = await import('@terracolombia/db/sql');
    await query(sql`UPDATE app.subscription SET plan_code = 'business' WHERE organization_id = ${orgId}::uuid`);
    // Rol de plataforma: las rutas de /admin no dependen del plan sino del rol.
    await query(sql`UPDATE app.user SET role = 'admin' WHERE email = ${email}`);
    await query(sql`
      INSERT INTO app.credit_ledger (id, organization_id, delta, reason, created_at)
      VALUES (gen_random_uuid(), ${orgId}::uuid, 5000, 'adjustment', now())
    `);

    // Se vuelve a iniciar sesión para que el token lleve ya el rol de administrador.
    const relogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'contrasena-de-prueba-larga' },
    });
    token = relogin.json().data.accessToken;

    const proj = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Proyecto de contrato' },
    });
    projectId = proj.json()?.data?.id ?? '';
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    const { closePool, disconnectPrisma } = await import('@terracolombia/db');
    await closePool();
    await disconnectPrisma();
  });

  for (const route of WEB_ROUTES) {
    it(`${route.method} ${route.path.split('?')[0]} existe`, async () => {
      const res = await app.inject({
        method: route.method,
        url: route.path,
        headers: route.auth ? { authorization: `Bearer ${token}` } : {},
        ...(route.body ? { payload: route.body } : {}),
      });

      // 404 con el mensaje del manejador de "ruta no encontrada" es el fallo que se busca.
      // Un 404 de dominio (por ejemplo, un predio inexistente) sí es aceptable.
      if (res.statusCode === 404) {
        const body = res.json();
        expect(
          body?.error?.message ?? '',
          `${route.method} ${route.path} no está registrada en la API`,
        ).not.toMatch(/No existe la ruta/);
      }
      // 403 por plan tampoco es un fallo de contrato, pero con plan Business no debería pasar.
      expect(
        [200, 201, 202, 204, 400, 402, 404, 409, 422].includes(res.statusCode),
        `${route.method} ${route.path} respondió ${res.statusCode}: ${res.payload.slice(0, 200)}`,
      ).toBe(true);
    });
  }

  it('POST /projects/:id/items existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/items`,
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'parcel', npn: '087580101010200010001000000000', label: 'Prueba' },
    });
    expect(res.json()?.error?.message ?? '').not.toMatch(/No existe la ruta/);
  });

  it('POST /api-keys/:id/revoke existe', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Para revocar', environment: 'sandbox' },
    });
    const id = created.json().data.id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/api-keys/${id}/revoke`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json()?.error?.message ?? '').not.toMatch(/No existe la ruta/);
  });

  it('POST /jobs/:id/cancel existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/00000000-0000-0000-0000-000000000000/cancel',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json()?.error?.message ?? '').not.toMatch(/No existe la ruta/);
  });

  // ─── Forma de la respuesta que el frontend da por supuesta ──────────────────

  it('login devuelve el plan, los permisos y los créditos', async () => {
    const email = `forma-${Date.now()}@terracolombia.test`;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'contrasena-de-prueba-larga' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'contrasena-de-prueba-larga' },
    });
    const user = res.json().data.user;
    // Sin estos campos la interfaz muestra "Plan Gratis" a quien ya pagó.
    expect(user.plan, 'falta user.plan').toBeDefined();
    expect(user.entitlements, 'falta user.entitlements').toBeDefined();
    expect(user.credits, 'falta user.credits').toBeDefined();
    expect(user.isPlatformAdmin, 'falta user.isPlatformAdmin').toBeDefined();
    expect(user.organizationId, 'falta user.organizationId').toBeTruthy();
    expect(res.json().data.accessToken).toBeTruthy();
  });

  it('el registro acepta el campo `name` que envía el formulario', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `nombre-${Date.now()}@terracolombia.test`,
        password: 'contrasena-de-prueba-larga',
        name: 'Nombre De Prueba',
        organizationName: 'Organización de prueba',
        acceptedTerms: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.user.name).toBe('Nombre De Prueba');
  });

  it('/me devuelve la misma ficha que login, en el primer nivel', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    const d0 = res.json().data;
    for (const field of ['id', 'email', 'plan', 'entitlements', 'credits', 'isPlatformAdmin']) {
      expect(d0[field], `/me no trae ${field} en el primer nivel`).toBeDefined();
    }
  });

  it('el refresco devuelve también la ficha del usuario', async () => {
    const email = `refresco-${Date.now()}@terracolombia.test`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'contrasena-de-prueba-larga' },
    });
    const cookie = reg.cookies.find((c) => c.name === 'tc_refresh');
    expect(cookie, 'el registro no dejó la cookie de refresco').toBeDefined();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { tc_refresh: cookie!.value },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user?.plan, 'el refresco no trae el plan').toBeDefined();
  });
});
