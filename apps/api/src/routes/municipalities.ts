import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, NOT_AVAILABLE } from '@terracolombia/shared';
import {
  coverageSummary,
  getCoverage,
  getMunicipality,
  getMunicipalityGeoJson,
  getMuniSummary,
  listCadastralManagers,
  listDepartments,
  listMunicipalities,
} from '@terracolombia/db';
import { envelope, plainEnvelope, presentDatasets } from '../lib/envelope.js';

export default async function municipalityRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/departments',
    { schema: { tags: ['municipios'], summary: 'Departamentos' } },
    async () => {
      const rows = await listDepartments();
      const datasets = await presentDatasets(['admin']);
      return envelope(rows, datasets);
    },
  );

  app.get(
    '/municipalities',
    {
      schema: {
        tags: ['municipios'],
        summary: 'Municipios',
        querystring: {
          type: 'object',
          properties: { deptCode: { type: 'string', minLength: 2, maxLength: 2 } },
        },
      },
    },
    async (req) => {
      const { deptCode } = z.object({ deptCode: z.string().length(2).optional() }).parse(req.query);
      const rows = await listMunicipalities(deptCode);
      const datasets = await presentDatasets(['admin']);
      return envelope(
        rows.map((m) => ({
          code: m.code,
          name: m.name,
          deptCode: m.dept_code,
          deptName: m.dept_name,
          isCapital: m.is_capital,
          population: m.population ?? NOT_AVAILABLE,
          populationYear: m.population_year ?? NOT_AVAILABLE,
          areaKm2: m.area_km2 ?? NOT_AVAILABLE,
          centroid: m.lng !== null && m.lat !== null ? [m.lng, m.lat] : null,
        })),
        datasets,
      );
    },
  );

  app.get(
    '/municipalities/:code',
    {
      schema: {
        tags: ['municipios'],
        summary: 'Ficha municipal con cobertura y gestor catastral',
        description:
          'Incluye el bloque `meta.coverage`, que dice quién gestiona el catastro del municipio y ' +
          'qué tenemos de él. Si no es jurisdicción del IGAC, se declara explícitamente.',
        params: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', minLength: 5, maxLength: 5 } },
        },
        querystring: {
          type: 'object',
          properties: { geometry: { type: 'boolean', default: false } },
        },
      },
    },
    async (req) => {
      const { code } = z.object({ code: z.string().length(5) }).parse(req.params);
      const { geometry } = z.object({ geometry: z.coerce.boolean().default(false) }).parse(req.query);

      const muni = await getMunicipality(code);
      if (!muni) {
        throw AppError.notFound(
          `No tenemos el municipio con código ${code}. Verifica el código DIVIPOLA (5 dígitos).`,
        );
      }

      const [coverage, summary, geom] = await Promise.all([
        getCoverage(code),
        getMuniSummary(code),
        geometry ? getMunicipalityGeoJson(code) : Promise.resolve(null),
      ]);

      const datasets = await presentDatasets(['admin', 'cadastre', 'education', 'health', 'population']);
      const warnings: string[] = [];
      if (!geom && geometry) {
        warnings.push(
          'Todavía no tenemos el límite geográfico de este municipio: falta cargar el Marco Geoestadístico Nacional del DANE.',
        );
      }

      return envelope(
        {
          code: muni.code,
          name: muni.name,
          deptCode: muni.dept_code,
          deptName: muni.dept_name,
          category: muni.category ?? NOT_AVAILABLE,
          isCapital: muni.is_capital,
          areaKm2: muni.area_km2 ?? NOT_AVAILABLE,
          population: muni.population ?? NOT_AVAILABLE,
          populationYear: muni.population_year ?? NOT_AVAILABLE,
          centroid: muni.lng !== null && muni.lat !== null ? [muni.lng, muni.lat] : null,
          geometry: geom,
          summary: summary ?? null,
        },
        datasets,
        { coverage, warnings },
      );
    },
  );

  app.get(
    '/coverage',
    {
      schema: {
        tags: ['municipios'],
        summary: 'Estado nacional de cobertura catastral',
        description:
          'Cuántos municipios existen, cuántos gestiona el IGAC, de cuántos tenemos predios y ' +
          'cuántos tienen otro gestor catastral. Sirve para ser honestos con el usuario sobre el alcance.',
      },
    },
    async () => {
      const [summary, managers] = await Promise.all([coverageSummary(), listCadastralManagers()]);
      const datasets = await presentDatasets(['admin', 'cadastre']);
      return envelope(
        {
          summary,
          nonIgacManagers: managers.filter((m) => !(m as { is_igac: boolean }).is_igac),
          note:
            'La base abierta del IGAC cubre los municipios donde el IGAC es gestor catastral. ' +
            'Los catastros descentralizados y los gestores habilitados publican por separado o no publican; ' +
            'esta tabla dice exactamente qué tenemos de cada uno.',
        },
        datasets,
      );
    },
  );

  app.get(
    '/cadastral-managers',
    { schema: { tags: ['municipios'], summary: 'Gestor catastral de cada municipio' } },
    async () => plainEnvelope(await listCadastralManagers()),
  );
}
