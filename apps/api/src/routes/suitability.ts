import type { FastifyInstance } from 'fastify';
import {
  AppError,
  DISCLAIMERS,
  MESSAGES,
  SuitabilityRequestSchema,
  TARGET_USES,
} from '@terracolombia/shared';
import { getCoverage, getParcel, getParcelGeoJson } from '@terracolombia/db';
import { approxAreaKm2, radiusToPolygon } from '@terracolombia/geo';
import { envelope, plainEnvelope, presentDatasets, recordUsage } from '../lib/envelope.js';
import { resolveAreaScope } from '../services/area-scope.js';
import { collectIndicatorInputs, collectParcelInputs } from '../services/indicator-inputs.js';
import { evaluateSuitability, listUseProfiles } from '../services/scoring.js';

/** Etiquetas en español de los usos objetivo. */
const USE_LABEL: Record<string, string> = {
  vivienda_unifamiliar: 'Vivienda unifamiliar',
  vivienda_multifamiliar: 'Vivienda multifamiliar',
  bodega_logistica: 'Bodega o centro logístico',
  agricultura: 'Agricultura',
  ganaderia: 'Ganadería',
  colegio: 'Colegio o sede educativa',
  comercio_local: 'Comercio de barrio',
  industria: 'Industria',
  turismo_rural: 'Turismo rural',
  solar_fotovoltaico: 'Generación solar fotovoltaica',
};

export default async function suitabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/suitability/uses',
    {
      schema: {
        tags: ['inteligencia'],
        summary: 'Usos objetivo disponibles y sus factores',
        description:
          'Cada uso declara los indicadores que pesan, sus pesos por defecto y qué factores son ' +
          'bloqueantes. Los pesos se pueden sobreescribir en la petición.',
      },
    },
    async () => {
      const profiles = await listUseProfiles();
      return plainEnvelope({
        uses: TARGET_USES.map((u) => ({
          id: u,
          label: USE_LABEL[u] ?? u,
          profile: profiles[u] ?? null,
        })),
        note:
          'El resultado siempre incluye el desglose por factor. No decimos "haz esto": mostramos ' +
          'los indicadores y sus fuentes para que decidas con criterio propio.',
      });
    },
  );

  app.post(
    '/suitability',
    {
      preHandler: [app.requireEntitlement('canUseSuitability')],
      schema: {
        tags: ['inteligencia'],
        summary: 'Aptitud de un predio o una zona para un uso',
        description:
          'Cruza relieve, suelos, amenazas, áreas protegidas, territorios étnicos, ordenamiento y ' +
          'accesibilidad para el uso objetivo. Devuelve un semáforo explicado factor por factor, ' +
          'con la fórmula y la fuente de cada uno. Si faltan factores obligatorios, el veredicto es ' +
          '"sin datos suficientes" en vez de un puntaje inventado.',
        body: {
          type: 'object',
          required: ['target', 'use'],
          properties: {
            target: { type: 'object' },
            use: { type: 'string', enum: [...TARGET_USES] },
            weights: { type: 'object', additionalProperties: { type: 'number' } },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const parsed = SuitabilityRequestSchema.parse(req.body);

      let geometry;
      let center: [number, number];
      let areaKm2: number;
      let muniCode: string | null;
      let label: string;
      const warnings: string[] = [];
      let inputs;

      if (parsed.target.kind === 'parcel') {
        const npn = parsed.target.npn.replace(/\D/g, '');
        const parcel = await getParcel(npn);
        if (!parcel) throw AppError.parcelNotFound(npn);
        if (parcel.lng === null || parcel.lat === null) {
          throw new AppError(
            'COVERAGE_MISSING',
            'Este predio no tiene geometría en el corte cargado, así que no podemos evaluar su aptitud.',
            { npn },
          );
        }
        const geom = await getParcelGeoJson(npn);
        if (!geom) throw AppError.parcelNotFound(npn);

        geometry = geom as never;
        center = [parcel.lng, parcel.lat];
        muniCode = parcel.muni_code;
        // Para el entorno se usa un radio de 1 km alrededor del predio.
        const envGeom = radiusToPolygon(center, 1000);
        areaKm2 = approxAreaKm2(envGeom);
        label = `Predio ${npn}`;
        inputs = await collectParcelInputs(
          geometry,
          parcel.area_geom_m2,
          parcel.built_area_m2,
          muniCode,
          center,
          areaKm2,
        );
        if (parcel.is_synthetic) {
          warnings.push(
            'Este predio pertenece a un corte de DEMOSTRACIÓN con datos sintéticos. El resultado no vale para decidir.',
          );
        }
      } else {
        const resolved = await resolveAreaScope(
          parsed.target.scope,
          req.auth.entitlements.maxAnalysisAreaKm2,
        );
        geometry = resolved.geometry as never;
        areaKm2 = resolved.areaKm2;
        muniCode = resolved.muniCode;
        label = resolved.label;
        warnings.push(...resolved.warnings);
        const bbox = geometryCenter(resolved.geometry);
        center = bbox;
        inputs = await collectIndicatorInputs(geometry, areaKm2, muniCode, center);
      }

      const result = await evaluateSuitability(parsed.use, inputs, parsed.weights);
      const coverage = muniCode ? await getCoverage(muniCode) : null;
      const datasets = await presentDatasets([
        'relief',
        'soils',
        'hazards',
        'protected',
        'ethnic',
        'pot',
        'osm',
        'population',
        'education',
        'health',
        'cadastre',
        'admin',
        'mining',
      ]);

      if (result.missing.length > 0) {
        warnings.push(
          `Faltan ${result.missing.length} indicadores para esta zona: ${result.missing.join(', ')}. ` +
            'Los factores sin dato no se cuentan en el puntaje y aparecen listados como faltantes.',
        );
      }

      recordUsage(req, 'suitability', started, {
        units: areaKm2,
        detail: { use: parsed.use, verdict: result.verdict },
      });

      return envelope(
        {
          target: label,
          use: parsed.use,
          useLabel: USE_LABEL[parsed.use] ?? parsed.use,
          areaKm2: Number(areaKm2.toFixed(4)),
          score: result.score,
          verdict: result.verdict,
          verdictLabel: result.verdictLabel,
          verdictHelp: MESSAGES.suitability[`${result.verdict}Help` as keyof typeof MESSAGES.suitability] ?? null,
          /** Desglose completo: nunca se devuelve solo el puntaje. */
          factors: result.factors,
          blockers: result.blockers,
          cautions: result.cautions,
          missing: result.missing,
          rawInputs: inputs,
          disclaimer: result.disclaimer,
          legalNotes: [DISCLAIMERS.notUrbanNorm, DISCLAIMERS.hazardScale],
        },
        datasets,
        { coverage, warnings },
      );
    },
  );
}

/** Punto interior representativo de una geometría, para las consultas que necesitan un centro. */
function geometryCenter(geom: { type: string; coordinates?: unknown }): [number, number] {
  const collect = (node: unknown, out: number[][]): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push(node as number[]);
      return;
    }
    for (const child of node) collect(child, out);
  };
  const points: number[][] = [];
  collect(geom.coordinates, points);
  if (points.length === 0) return [0, 0];
  const sum = points.reduce<[number, number]>(
    (acc, p) => [acc[0] + (p[0] ?? 0), acc[1] + (p[1] ?? 0)],
    [0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length];
}
