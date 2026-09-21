import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CREDIT_COST, GLOSSARY_BY_ID, MESSAGES } from '@terracolombia/shared';
import { getCoverage, getParcel, searchText } from '@terracolombia/db';
import { plainEnvelope, recordUsage } from '../lib/envelope.js';
import { askAssistant, explainWithAssistant, isAssistantEnabled } from '../services/ai.js';
import { explainIndicator } from '../services/scoring.js';

export default async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAuth);

  app.post(
    '/ask',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['inteligencia'],
        summary: 'Preguntar en lenguaje natural',
        description:
          'El asistente solo puede llamar herramientas tipadas de esta misma API. No genera SQL, no ' +
          'inventa cifras y cita la fuente y la fecha de corte de cada dato que menciona. Si la ' +
          'herramienta no devuelve el dato, responde que no está disponible.',
        body: {
          type: 'object',
          required: ['question'],
          properties: {
            question: { type: 'string', minLength: 3, maxLength: 1000 },
            context: {
              type: 'object',
              description: 'Contexto opcional: npn, muniCode o geometría en la que está el usuario',
            },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const body = z
        .object({
          question: z.string().min(3).max(1000),
          context: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      if (req.auth.organizationId) {
        // Una pregunta cuesta un crédito. La clave incluye la pregunta para no cobrar dos
        // veces si el cliente reintenta la misma petición.
        const hash = Buffer.from(body.question).toString('base64url').slice(0, 40);
        await app.quota.charge(
          req.auth.organizationId,
          'ai_ask',
          `ai:${req.auth.organizationId}:${hash}:${Math.floor(Date.now() / 60_000)}`,
        );
      }

      const result = await askAssistant(body.question, body.context ?? {}, {
        // Las herramientas se implementan aquí: el paquete define el contrato, la API los datos.
        search_places: async (input) => {
          const q = String((input as { query?: unknown }).query ?? '');
          const hits = await searchText(q, { limit: 5 });
          return hits.map((h) => ({
            kind: h.kind,
            label: h.label,
            context: h.context,
            muniCode: h.muni_code,
          }));
        },
        get_parcel: async (input) => {
          const npn = String((input as { npn?: unknown }).npn ?? '').replace(/\D/g, '');
          if (npn.length !== 30) return { available: false, reason: 'Código predial inválido' };
          const parcel = await getParcel(npn);
          if (!parcel) return { available: false, reason: 'No tenemos ese predio' };
          return {
            available: true,
            npn: parcel.npn,
            municipality: parcel.muni_name,
            department: parcel.dept_name,
            zone: parcel.zone === '01' ? 'urbano' : 'rural',
            areaGeomM2: parcel.area_geom_m2,
            builtAreaM2: parcel.built_area_m2,
            economicUse: parcel.economic_use,
            cutDate: parcel.cut_date,
            synthetic: parcel.is_synthetic,
          };
        },
        get_coverage: async (input) => {
          const muniCode = String((input as { muniCode?: unknown }).muniCode ?? '');
          if (!/^\d{5}$/.test(muniCode)) return { available: false };
          return getCoverage(muniCode);
        },
        get_glossary_term: async (input) => {
          const id = String((input as { id?: unknown }).id ?? '');
          return GLOSSARY_BY_ID[id] ?? { available: false, reason: 'Término no encontrado' };
        },
        explain_indicator: async (input) => {
          const id = String((input as { id?: unknown }).id ?? '');
          const indicator = await explainIndicator(id).catch(() => null);
          return indicator ?? { available: false, reason: 'Indicador no encontrado' };
        },
      });

      recordUsage(req, 'ai_ask', started, {
        credits: CREDIT_COST.ai_ask,
        detail: { mode: result.mode, toolCalls: result.toolCalls },
      });

      return plainEnvelope({
        answer: result.answer,
        /** `llm` = respuesta del modelo verificada; `template` = respuesta determinista sin IA. */
        mode: result.mode,
        toolCalls: result.toolCalls,
        /** Datos que respaldan cada cifra mencionada. */
        evidence: result.evidence,
        rejectedForUnsupportedNumbers: result.rejected,
        disclaimer: MESSAGES.ai.disclaimer,
      });
    },
  );

  app.post(
    '/explain',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['inteligencia'],
        summary: 'Explícame esto',
        description:
          'Explica un dato, un indicador o un término en lenguaje claro. Funciona sin IA: si no hay ' +
          'llave configurada, devuelve la explicación plantillada del glosario o del indicador.',
        body: {
          type: 'object',
          required: ['subject'],
          properties: {
            subject: {
              type: 'string',
              description: 'Identificador del término del glosario, del indicador, o texto libre',
            },
            value: { description: 'Valor concreto que se está explicando, si aplica' },
            context: { type: 'object' },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const body = z
        .object({
          subject: z.string().min(1).max(200),
          value: z.unknown().optional(),
          context: z.record(z.unknown()).optional(),
        })
        .parse(req.body);

      // Camino rápido: si el sujeto es un término del glosario, se responde sin IA.
      const term = GLOSSARY_BY_ID[body.subject];
      if (term && body.value === undefined) {
        recordUsage(req, 'ai_explain', started, { detail: { mode: 'glossary' } });
        return plainEnvelope({
          explanation: term.detail ? `${term.plain}\n\n${term.detail}` : term.plain,
          mode: 'glossary',
          term: term.term,
          source: term.source ?? null,
          disclaimer: null,
        });
      }

      const indicator = await explainIndicator(body.subject).catch(() => null);
      const result = await explainWithAssistant(body.subject, body.value, {
        ...(body.context ?? {}),
        ...(indicator ? { indicator } : {}),
      });

      recordUsage(req, 'ai_explain', started, { detail: { mode: result.mode } });

      return plainEnvelope({
        explanation: result.answer,
        mode: result.mode,
        evidence: result.evidence,
        disclaimer: result.mode === 'llm' ? MESSAGES.ai.disclaimer : null,
      });
    },
  );

  app.get(
    '/status',
    {
      schema: {
        tags: ['inteligencia'],
        summary: 'Si el asistente con IA está disponible',
        description:
          'Permite a la interfaz decir la verdad: sin llave configurada, "Explícame esto" sigue ' +
          'funcionando con explicaciones plantilladas, y la pregunta libre no está disponible.',
      },
    },
    async () => {
      const enabled = await isAssistantEnabled();
      return plainEnvelope({
        enabled,
        model: enabled ? (process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5') : null,
        fallbackMode: enabled ? null : 'template',
        message: enabled
          ? 'El asistente está disponible.'
          : 'El asistente con IA no está configurado en este despliegue. "Explícame esto" funciona con ' +
            'explicaciones preparadas, y la pregunta en lenguaje natural no está disponible.',
      });
    },
  );
}
