import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ALL_DISCLAIMERS, DISCLAIMERS, GLOSSARY, GLOSSARY_BY_ID, LICENSES } from '@terracolombia/shared';
import { plainEnvelope } from '../lib/envelope.js';

export default async function glossaryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/glossary',
    {
      schema: {
        tags: ['busqueda'],
        summary: 'Glosario en lenguaje claro',
        description:
          'Cada término técnico que aparece en la interfaz tiene aquí su explicación para una persona ' +
          'sin formación técnica, más el detalle y la fuente del concepto.',
      },
    },
    async () => plainEnvelope({ terms: GLOSSARY }),
  );

  app.get(
    '/glossary/:id',
    { schema: { tags: ['busqueda'], summary: 'Un término del glosario' } },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().max(60) }).parse(req.params);
      const entry = GLOSSARY_BY_ID[id];
      if (!entry) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `No tenemos una definición para "${id}". Consulta GET /glossary para ver los términos disponibles.`,
            details: { available: GLOSSARY.map((g) => g.id) },
          },
        });
      }
      return plainEnvelope(entry);
    },
  );

  app.get(
    '/legal',
    {
      schema: {
        tags: ['busqueda'],
        summary: 'Advertencias legales y licencias',
        description:
          'Textos obligatorios que acompañan a todo informe y a la sección de fuentes: este producto ' +
          'no entrega certificados catastrales, ni avalúos, ni conceptos de norma urbanística, ni ' +
          'estudios de títulos.',
      },
    },
    async () =>
      plainEnvelope({
        disclaimers: Object.entries(DISCLAIMERS).map(([key, text]) => ({ key, text })),
        allDisclaimers: ALL_DISCLAIMERS,
        licenses: Object.values(LICENSES),
        attributionRequired:
          'Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0 (reemplaza AAAA-MM por la fecha de corte que aparece en meta.cutDate).',
        shareAlikeNote:
          'Los datos del IGAC están bajo CC BY-SA 4.0 y OpenStreetMap bajo ODbL: ambas licencias tienen ' +
          'cláusula de CompartirIgual. Si redistribuyes una base derivada de ellos, esa cláusula puede ' +
          'alcanzarte. Los indicadores propios de TerraColombia se entregan por separado justamente para ' +
          'que puedas distinguir un grupo del otro.',
      }),
  );
}
