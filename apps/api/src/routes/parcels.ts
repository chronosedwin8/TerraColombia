import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  DISCLAIMERS,
  NOT_AVAILABLE,
  ParcelQuerySchema,
  STATEMENT_TIMEOUT_MS,
  ZONE_LABEL,
} from '@terracolombia/shared';
import {
  agriculturalFrontierOverlap,
  countParcels,
  distanceToMuniSeat,
  ethnicTerritoryOverlaps,
  findParcelByLegacyNpn,
  getCoverage,
  getParcel,
  getParcelBuildings,
  getParcelGeoJson,
  getParcelHomogeneousZones,
  getParcelUnits,
  hazardOverlaps,
  insideUrbanPerimeter,
  miningTitleOverlaps,
  nearby,
  parcelCutDates,
  parcelHistory,
  populationIn,
  potZoneOverlaps,
  protectedAreaOverlaps,
  queryParcels,
  reliefFor,
  roadAccess,
  soilOverlaps,
} from '@terracolombia/db';
import {
  explainNpn,
  formatNpnPretty,
  isLegacyNpn,
  isNpnCandidate,
  normalizeNpnInput,
  validateNpn,
} from '@terracolombia/geo';
import { envelope, presentDatasets, recordUsage } from '../lib/envelope.js';

/**
 * Normaliza y valida el NPN de la ruta.
 *
 * Un código del formato anterior (20 dígitos) no se puede convertir: se resuelve buscándolo
 * en `npn_old`. Si hay exactamente una coincidencia, se usa; si hay varias o ninguna, se
 * explica en vez de escoger al azar.
 */
async function requireNpn(raw: string): Promise<string> {
  const normalized = normalizeNpnInput(raw);

  if (isLegacyNpn(normalized)) {
    const matches = await findParcelByLegacyNpn(normalized);
    if (matches.length === 1) return matches[0]!.npn;
    if (matches.length === 0) {
      throw new AppError(
        'PARCEL_NOT_FOUND',
        `Ese es un código predial del formato anterior (20 dígitos) y no lo encontramos entre los que ` +
          `publica la fuente. No lo convertimos al formato nuevo porque no existe una regla aritmética ` +
          `que lo permita. Busca por dirección o por el código predial de 30 dígitos.`,
        { npnOld: normalized },
      );
    }
    throw new AppError(
      'VALIDATION',
      `Ese código anterior corresponde a ${matches.length} predios del formato nuevo. ` +
        'Elige uno de la lista.',
      { npnOld: normalized, candidates: matches.map((m) => ({ npn: m.npn, address: m.address })) },
    );
  }

  if (!isNpnCandidate(normalized)) throw AppError.invalidNpn(raw);
  const v = validateNpn(normalized);
  if (!v.ok) {
    throw new AppError('INVALID_NPN', `Ese código predial no sirve: ${v.reason}`, { npn: raw });
  }
  const p = v.parts;
  return (
    p.department + p.municipality + p.zone + p.sector + p.commune + p.neighborhood +
    p.blockOrVereda + p.parcel + p.condition + p.building + p.floor + p.unit
  );
}

export default async function parcelRoutes(app: FastifyInstance): Promise<void> {
  // ─── Ficha de predio ────────────────────────────────────────────────────────
  app.get(
    '/parcels/:npn',
    {
      schema: {
        tags: ['predios'],
        summary: 'Ficha de un predio',
        description:
          'Devuelve todo lo disponible del predio. Los campos sin dato en la fuente vienen como ' +
          '`NO_DISPONIBLE`: nunca se rellenan con estimaciones. El avalúo catastral, si existe, ' +
          'va acompañado de la advertencia de que no es valor comercial.',
        params: {
          type: 'object',
          required: ['npn'],
          // Sin restricción de longitud a propósito: la validación la hace `requireNpn`,
          // que explica exactamente qué tiene de malo el código en vez de un error genérico.
          properties: { npn: { type: 'string', maxLength: 60 } },
        },
        querystring: {
          type: 'object',
          properties: {
            cutDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            geometry: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const { npn: rawNpn } = req.params as { npn: string };
      const npn = await requireNpn(rawNpn);
      const { cutDate, geometry } = z
        .object({
          cutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          geometry: z.coerce.boolean().default(false),
        })
        .parse(req.query);

      const parcel = await getParcel(npn, { cutDate, withGeometry: geometry });
      const muniCode = npn.slice(0, 5);
      const coverage = await getCoverage(muniCode);

      if (!parcel) {
        // Estado vacío honesto: se dice por qué no está, no solo "no encontrado".
        throw new AppError(
          'PARCEL_NOT_FOUND',
          coverage.status === 'none' && coverage.message
            ? coverage.message
            : 'No hay un predio con ese código predial en los cortes que tenemos. Verifica los dígitos o busca por dirección.',
          { npn, coverage },
        );
      }

      const [buildings, homogeneousZones, cuts, units] = await Promise.all([
        getParcelBuildings(npn, cutDate),
        getParcelHomogeneousZones(npn),
        parcelCutDates(npn),
        getParcel(npn).then((p) => (p && !p.is_ph ? getParcelUnits(npn, 50) : [])),
      ]);

      const datasets = await presentDatasets(['cadastre', 'admin'], { muniCode });

      recordUsage(req, 'parcel_detail', started, { detail: { muniCode } });
      await app.quota.consume(
        req,
        'detailed_queries',
        req.auth.entitlements.detailedQueriesPerMonth,
      );

      return envelope(
        {
          npn,
          npnPretty: formatNpnPretty(npn),
          npnExplained: explainNpn(npn),
          npnOld: parcel.npn_old ?? NOT_AVAILABLE,
          municipality: {
            code: parcel.muni_code,
            name: parcel.muni_name,
            deptCode: parcel.dept_code,
            deptName: parcel.dept_name,
          },
          zone: parcel.zone,
          zoneLabel: ZONE_LABEL[parcel.zone] ?? NOT_AVAILABLE,
          address: parcel.address ?? NOT_AVAILABLE,
          areaGeomM2: parcel.area_geom_m2 ?? NOT_AVAILABLE,
          areaReportedM2: parcel.area_reported_m2 ?? NOT_AVAILABLE,
          /** Diferencia entre área geométrica y reportada: dato relevante y frecuente. */
          areaDiscrepancy:
            parcel.area_geom_m2 !== null && parcel.area_reported_m2 !== null
              ? {
                  differenceM2: Number((parcel.area_geom_m2 - parcel.area_reported_m2).toFixed(2)),
                  differencePct:
                    parcel.area_reported_m2 > 0
                      ? Number(
                          (
                            ((parcel.area_geom_m2 - parcel.area_reported_m2) /
                              parcel.area_reported_m2) *
                            100
                          ).toFixed(2),
                        )
                      : null,
                  note: 'El área del polígono y la que reporta el registro catastral pueden diferir. Ninguna sustituye un levantamiento topográfico.',
                }
              : null,
          builtAreaM2: parcel.built_area_m2 ?? NOT_AVAILABLE,
          economicUse: parcel.economic_use ?? NOT_AVAILABLE,
          cadastralValue: parcel.cadastral_value ?? NOT_AVAILABLE,
          valuationYear: parcel.valuation_year ?? NOT_AVAILABLE,
          cadastralValueWarning: DISCLAIMERS.notAppraisal,
          isHorizontalProperty: parcel.is_ph,
          matrixNpn: parcel.is_ph ? parcel.matrix_npn : null,
          units: units.map((u) => ({
            npn: u.npn,
            areaGeomM2: u.area_geom_m2,
            builtAreaM2: u.built_area_m2,
            economicUse: u.economic_use,
          })),
          centroid: parcel.lng !== null && parcel.lat !== null ? [parcel.lng, parcel.lat] : null,
          geometry: geometry && parcel.geojson ? JSON.parse(parcel.geojson) : null,
          buildings: buildings.map((b) => ({
            id: String(b.id),
            ref: b.building_ref ?? NOT_AVAILABLE,
            floors: b.floors ?? NOT_AVAILABLE,
            builtAreaM2: b.built_area_m2 ?? NOT_AVAILABLE,
            use: b.use ?? NOT_AVAILABLE,
            builtYear: b.built_year ?? NOT_AVAILABLE,
          })),
          homogeneousZones,
          /** Campos crudos del registro catastral, ya filtrados de datos personales. */
          rawAttributes: parcel.attrs,
          availableCutDates: cuts.map((c) => c.cut_date),
          currentCutDate: parcel.cut_date,
        },
        datasets,
        { coverage },
      );
    },
  );

  // ─── Solo la geometría ──────────────────────────────────────────────────────
  app.get(
    '/parcels/:npn/geometry',
    { schema: { tags: ['predios'], summary: 'Geometría del predio en GeoJSON' } },
    async (req) => {
      const npn = await requireNpn((req.params as { npn: string }).npn);
      const { cutDate } = z
        .object({ cutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
        .parse(req.query);
      const geom = await getParcelGeoJson(npn, cutDate);
      if (!geom) throw AppError.parcelNotFound(npn);
      const datasets = await presentDatasets(['cadastre'], { muniCode: npn.slice(0, 5) });
      return envelope({ type: 'Feature', geometry: geom, properties: { npn } }, datasets);
    },
  );

  // ─── Contexto del predio ────────────────────────────────────────────────────
  app.get(
    '/parcels/:npn/context',
    {
      schema: {
        tags: ['predios'],
        summary: 'Entorno del predio',
        description:
          'Equipamientos, vías, población, suelos, amenazas, áreas protegidas, territorios étnicos, ' +
          'ordenamiento y relieve alrededor del predio. Cada bloque cita su fuente y su fecha de corte; ' +
          'lo que no exista para esa zona se declara como no disponible.',
        querystring: {
          type: 'object',
          properties: {
            radius: { type: 'integer', minimum: 100, maximum: 10000, default: 1000 },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const npn = await requireNpn((req.params as { npn: string }).npn);
      const { radius } = z
        .object({ radius: z.coerce.number().int().min(100).max(10_000).default(1000) })
        .parse(req.query);

      const parcel = await getParcel(npn);
      if (!parcel) throw AppError.parcelNotFound(npn);
      if (parcel.lng === null || parcel.lat === null) {
        throw new AppError(
          'COVERAGE_MISSING',
          'Este predio no tiene geometría en el corte cargado, así que no podemos calcular su entorno.',
          { npn },
        );
      }

      const geom = await getParcelGeoJson(npn);
      const muniCode = parcel.muni_code;

      const [
        near,
        soils,
        hazards,
        protectedAreas,
        ethnic,
        pot,
        mining,
        frontier,
        population,
        relief,
        urban,
        access,
        distSeat,
      ] = await Promise.all([
        nearby(parcel.lng, parcel.lat, radius, [], 15),
        geom ? soilOverlaps(geom) : [],
        geom ? hazardOverlaps(geom) : [],
        geom ? protectedAreaOverlaps(geom) : [],
        geom ? ethnicTerritoryOverlaps(geom) : [],
        geom ? potZoneOverlaps(geom, muniCode) : [],
        geom ? miningTitleOverlaps(geom) : [],
        geom ? agriculturalFrontierOverlap(geom) : [],
        populationIn({
          type: 'Polygon',
          coordinates: circleRing(parcel.lng, parcel.lat, radius),
        }),
        geom ? reliefFor(geom) : null,
        geom ? insideUrbanPerimeter(geom, muniCode) : null,
        roadAccess(parcel.lng, parcel.lat),
        distanceToMuniSeat(parcel.lng, parcel.lat, muniCode),
      ]);

      const coverage = await getCoverage(muniCode);
      const datasets = await presentDatasets([
        'cadastre',
        'admin',
        'education',
        'health',
        'osm',
        'soils',
        'hazards',
        'protected',
        'ethnic',
        'pot',
        'relief',
        'population',
        'mining',
      ]);

      const warnings: string[] = [];
      if (hazards.length > 0) warnings.push(DISCLAIMERS.hazardScale);
      if (pot.length === 0) {
        warnings.push(
          'No tenemos la zonificación del POT de este municipio. Consulta la Secretaría de Planeación municipal para conocer los usos permitidos.',
        );
      }
      if ((population?.n_blocks ?? 0) === 0) {
        warnings.push(
          'Sin manzanas censales cargadas para esta zona: la población alrededor aparece como no disponible.',
        );
      }

      recordUsage(req, 'parcel_context', started, { units: radius, detail: { muniCode } });

      return envelope(
        {
          npn,
          radiusM: radius,
          schools: near.filter((n) => n.layer === 'school'),
          healthFacilities: near.filter((n) => n.layer === 'health_facility'),
          pois: near.filter((n) => n.layer === 'poi'),
          roads: near.filter((n) => n.layer === 'road'),
          population: {
            total: population?.pop_total ?? NOT_AVAILABLE,
            households: population?.households ?? NOT_AVAILABLE,
            dwellings: population?.dwellings ?? NOT_AVAILABLE,
            ageBands: population?.age_bands ?? null,
            blocksUsed: population?.n_blocks ?? 0,
            method:
              'Estimación por reparto de área: se suma la población de cada manzana censal según la fracción que cae dentro del radio.',
          },
          soils,
          hazards,
          protectedAreas,
          ethnicTerritories: ethnic,
          potZones: pot,
          miningTitles: mining,
          agriculturalFrontier: frontier,
          relief: {
            elevationMeanM: relief?.elevation_mean_m ?? NOT_AVAILABLE,
            slopeMeanPct: relief?.slope_mean_pct ?? NOT_AVAILABLE,
            slopeMaxPct: relief?.slope_max_pct ?? NOT_AVAILABLE,
          },
          urbanPerimeter:
            urban === null
              ? { inside: NOT_AVAILABLE, note: 'Este municipio no tiene perímetro urbano cargado.' }
              : { inside: urban, note: null },
          accessibility: {
            distPrimaryRoadM: access?.dist_primary_m ?? NOT_AVAILABLE,
            distSecondaryRoadM: access?.dist_secondary_m ?? NOT_AVAILABLE,
            distPavedRoadM: access?.dist_paved_m ?? NOT_AVAILABLE,
            distAnyRoadM: access?.dist_any_m ?? NOT_AVAILABLE,
            distMuniSeatM: distSeat ?? NOT_AVAILABLE,
          },
        },
        datasets,
        { coverage, warnings },
      );
    },
  );

  // ─── Historial ──────────────────────────────────────────────────────────────
  app.get(
    '/parcels/:npn/history',
    {
      schema: {
        tags: ['predios'],
        summary: 'Cambios del predio entre cortes',
      },
    },
    async (req) => {
      const npn = await requireNpn((req.params as { npn: string }).npn);
      const [changes, cuts] = await Promise.all([parcelHistory(npn), parcelCutDates(npn)]);
      const datasets = await presentDatasets(['cadastre'], { muniCode: npn.slice(0, 5) });
      return envelope(
        {
          npn,
          cuts,
          changes,
          emptyReason:
            changes.length === 0
              ? cuts.length <= 1
                ? 'Solo tenemos un corte de este municipio, así que todavía no hay nada que comparar.'
                : 'Entre los cortes que tenemos, este predio no registra cambios.'
              : null,
        },
        datasets,
      );
    },
  );

  // ─── Consulta avanzada (DSL) ────────────────────────────────────────────────
  app.post(
    '/parcels/query',
    {
      preHandler: [app.requireEntitlement('canUseAdvancedSearch')],
      schema: {
        tags: ['predios'],
        summary: 'Búsqueda avanzada de predios',
        description:
          'Filtros alfanuméricos y espaciales. El `scope` es obligatorio (departamento o municipio) ' +
          'para evitar barridos nacionales. Devuelve un cursor para paginar.',
        body: {
          type: 'object',
          required: ['scope'],
          properties: {
            scope: { type: 'object' },
            where: { type: 'object' },
            near: { type: 'array' },
            within: { type: 'object' },
            bbox: { type: 'array' },
            sort: { type: 'string' },
            limit: { type: 'integer' },
            cursor: { type: 'string' },
            geometry: { type: 'string', enum: ['none', 'centroid', 'full'] },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const parsed = ParcelQuerySchema.parse(req.body);
      const maxRows = Math.min(parsed.limit, req.auth.entitlements.maxQueryLimit);

      const result = await queryParcels(
        { ...parsed, limit: maxRows },
        { timeoutMs: STATEMENT_TIMEOUT_MS.interactive, maxRows },
      );

      const coverage = parsed.scope.municipality
        ? await getCoverage(parsed.scope.municipality)
        : null;
      const datasets = await presentDatasets(['cadastre', 'admin', 'osm', 'education', 'health'], {
        muniCode: parsed.scope.municipality ?? null,
      });

      recordUsage(req, 'parcel_query', started, {
        units: result.rows.length,
        detail: { scope: parsed.scope, nearFilters: parsed.near.length },
      });

      return envelope(
        {
          rows: result.rows.map((r) => ({
            npn: r.npn,
            muniCode: r.muni_code,
            muniName: r.muni_name,
            zone: r.zone,
            zoneLabel: ZONE_LABEL[r.zone] ?? NOT_AVAILABLE,
            address: r.address ?? NOT_AVAILABLE,
            areaGeomM2: r.area_geom_m2 ?? NOT_AVAILABLE,
            builtAreaM2: r.built_area_m2 ?? NOT_AVAILABLE,
            economicUse: r.economic_use ?? NOT_AVAILABLE,
            cadastralValue: r.cadastral_value ?? NOT_AVAILABLE,
            centroid: r.lng !== null && r.lat !== null ? [r.lng, r.lat] : null,
            geometry: r.geojson ? JSON.parse(r.geojson) : null,
          })),
          nextCursor: result.nextCursor,
          limitApplied: maxRows,
          cadastralValueWarning: DISCLAIMERS.notAppraisal,
        },
        datasets,
        {
          coverage,
          warnings:
            parsed.limit > maxRows
              ? [
                  `Tu plan permite hasta ${maxRows} resultados por consulta; pediste ${parsed.limit}. Usa el cursor para traer más.`,
                ]
              : [],
        },
      );
    },
  );

  // ─── Conteo del alcance ─────────────────────────────────────────────────────
  app.post(
    '/parcels/count',
    {
      preHandler: [app.requireEntitlement('canUseAdvancedSearch')],
      schema: {
        tags: ['predios'],
        summary: 'Conteo del alcance de una consulta',
        description:
          'Cuenta los predios del alcance aplicando solo los filtros baratos (alcance, corte y ' +
          'contención). Los filtros de proximidad no se cuentan porque su costo es prohibitivo: ' +
          'úsalo como "hasta N predios en el área".',
      },
    },
    async (req) => {
      const parsed = ParcelQuerySchema.parse(req.body);
      const total = await countParcels(parsed, STATEMENT_TIMEOUT_MS.interactive);
      const datasets = await presentDatasets(['cadastre'], {
        muniCode: parsed.scope.municipality ?? null,
      });
      return envelope(
        {
          total,
          isApproximate: parsed.near.length > 0,
          note:
            parsed.near.length > 0
              ? 'El conteo no aplica los filtros de proximidad: el resultado real será menor o igual.'
              : null,
        },
        datasets,
      );
    },
  );
}

/** Anillo de un círculo geodésico aproximado, para consultas que necesitan un polígono. */
function circleRing(lng: number, lat: number, radiusM: number, steps = 48): number[][][] {
  const ring: number[][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusM / 110_574;
  const dLng = radiusM / (111_320 * Math.cos(latRad));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return [ring];
}
