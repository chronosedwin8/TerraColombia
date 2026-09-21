/**
 * Herramientas del asistente: esquemas estrictos y contrato de ejecución.
 *
 * Este paquete **define el contrato**; la implementación la inyecta la API, que es la que
 * tiene acceso a PostGIS. Así el asistente nunca ve la base de datos y este paquete se puede
 * probar sin ella.
 *
 * Regla de §13 que se hace cumplir aquí: **no existe una herramienta de SQL libre**. El
 * modelo solo puede pedir lo que estos esquemas permiten, con tipos y listas cerradas.
 */

import { z } from 'zod';
import { NEARBY_LAYERS, MAX_PAGE_SIZE, type SourceRef } from '@terracolombia/shared';

export const ASSISTANT_TOOL_NAMES = [
  'search_places',
  'get_parcel',
  'query_parcels',
  'analyze_area',
  'explain_indicator',
  'get_coverage',
  'get_glossary_term',
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

/** Esquema JSON de entrada de una herramienta. Siempre cerrado (`additionalProperties: false`). */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export interface ToolResult {
  ok: boolean;
  /** Datos ya calculados por la API. `null` cuando el dato no existe. */
  data: unknown;
  /** Procedencia de cada dato devuelto. Sin esto, el asistente no puede citarlo. */
  sources: SourceRef[];
  /** Mensaje en español: por qué no hay dato, o qué se recortó. */
  message?: string;
}

export interface ToolCallContext {
  /** Identificador de la petición, para trazabilidad en el log. */
  requestId?: string | null;
  /** Municipio o ámbito al que está limitada la sesión, si aplica. */
  muniCode?: string | null;
}

export type ToolHandler = (input: unknown, ctx: ToolCallContext) => Promise<ToolResult>;

export interface ToolDefinition {
  name: AssistantToolName;
  description: string;
  inputSchema: ToolInputSchema;
  /** Validación real de la entrada antes de llamar al handler. */
  validator: z.ZodTypeAny;
}

export interface AssistantTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

// ─── Validadores ──────────────────────────────────────────────────────────────

const MuniCodeSchema = z
  .string()
  .regex(/^\d{5}$/, 'El código de municipio DIVIPOLA tiene 5 dígitos');

const NpnSchema = z
  .string()
  .regex(/^\d{20}$|^\d{30}$/, 'El código predial tiene 30 dígitos (o 20 en el formato anterior)');

const SearchPlacesInput = z.object({
  query: z.string().min(2).max(200),
  limit: z.number().int().positive().max(20).optional(),
});
export type SearchPlacesInput = z.infer<typeof SearchPlacesInput>;

const GetParcelInput = z.object({
  npn: NpnSchema,
  /** Radio de contexto en metros; la API decide el tope por plan. */
  context_radius_m: z.number().int().positive().max(5000).optional(),
});
export type GetParcelInput = z.infer<typeof GetParcelInput>;

const NearFilterInput = z.object({
  layer: z.enum(NEARBY_LAYERS),
  max_m: z.number().int().positive().max(20_000),
});

const QueryParcelsInput = z.object({
  municipality: MuniCodeSchema,
  zone: z.enum(['urbano', 'rural']).optional(),
  min_area_m2: z.number().nonnegative().optional(),
  max_area_m2: z.number().positive().optional(),
  economic_use: z.array(z.string().max(120)).max(10).optional(),
  has_building: z.boolean().optional(),
  near: z.array(NearFilterInput).max(3).optional(),
  limit: z.number().int().positive().max(MAX_PAGE_SIZE).optional(),
});
export type QueryParcelsInput = z.infer<typeof QueryParcelsInput>;

const AnalyzeAreaInput = z.object({
  scope: z.union([
    z.object({ kind: z.literal('municipality'), municipality: MuniCodeSchema }),
    z.object({
      kind: z.literal('radius'),
      lng: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
      radius_m: z.number().int().positive().max(20_000),
    }),
    z.object({ kind: z.literal('saved_area'), saved_area_id: z.string().max(60) }),
  ]),
  sections: z
    .array(
      z.enum([
        'parcels',
        'population',
        'education',
        'health',
        'commerce',
        'soils',
        'hazards',
        'protected',
        'relief',
        'pot',
        'accessibility',
      ]),
    )
    .max(11)
    .optional(),
});
export type AnalyzeAreaInput = z.infer<typeof AnalyzeAreaInput>;

const ExplainIndicatorInput = z.object({
  indicator_id: z.string().max(80),
  /** Valor crudo del indicador, si se quiere la explicación de un caso concreto. */
  value: z.union([z.number(), z.string().max(120), z.boolean()]).optional(),
  target_use: z.string().max(60).optional(),
});
export type ExplainIndicatorInput = z.infer<typeof ExplainIndicatorInput>;

const GetCoverageInput = z.object({ municipality: MuniCodeSchema });
export type GetCoverageInput = z.infer<typeof GetCoverageInput>;

const GetGlossaryTermInput = z.object({ term_id: z.string().max(80) });
export type GetGlossaryTermInput = z.infer<typeof GetGlossaryTermInput>;

// ─── Definiciones ─────────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: Record<AssistantToolName, ToolDefinition> = {
  search_places: {
    name: 'search_places',
    description:
      'Busca un lugar en Colombia por texto: municipio, barrio, vereda, topónimo, dirección o código predial. Úsala siempre primero cuando la persona nombre un lugar, para convertir el nombre en un identificador con el que puedas seguir consultando. Devuelve una lista de coincidencias con su tipo y su código.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Texto a buscar, tal como lo escribió la persona.',
          minLength: 2,
          maxLength: 200,
        },
        limit: {
          type: 'integer',
          description: 'Máximo de coincidencias a devolver (1 a 20).',
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    validator: SearchPlacesInput,
  },

  get_parcel: {
    name: 'get_parcel',
    description:
      'Devuelve la ficha de un predio por su código predial nacional (30 dígitos, o 20 en el formato anterior): identificación catastral, áreas, destino económico, construcciones y, si se pide un radio, el contexto alrededor. No devuelve ningún dato de personas: el producto no los tiene.',
    inputSchema: {
      type: 'object',
      properties: {
        npn: {
          type: 'string',
          description: 'Código predial nacional de 30 dígitos, o el anterior de 20.',
          pattern: '^\\d{20}$|^\\d{30}$',
        },
        context_radius_m: {
          type: 'integer',
          description: 'Radio en metros para traer el entorno del predio (máximo 5000).',
          minimum: 1,
          maximum: 5000,
        },
      },
      required: ['npn'],
      additionalProperties: false,
    },
    validator: GetParcelInput,
  },

  query_parcels: {
    name: 'query_parcels',
    description:
      'Busca predios dentro de un municipio con filtros cerrados: zona urbana o rural, rango de área, destino económico, si tiene construcción y cercanía a una capa (vías, colegios, IPS, áreas protegidas). Siempre exige el municipio para no hacer barridos nacionales. No acepta consultas libres ni SQL.',
    inputSchema: {
      type: 'object',
      properties: {
        municipality: {
          type: 'string',
          description: 'Código DIVIPOLA del municipio, 5 dígitos. Por ejemplo 08573.',
          pattern: '^\\d{5}$',
        },
        zone: { type: 'string', enum: ['urbano', 'rural'] },
        min_area_m2: { type: 'number', minimum: 0 },
        max_area_m2: { type: 'number', exclusiveMinimum: 0 },
        economic_use: {
          type: 'array',
          description: 'Destinos económicos catastrales, tal como los devuelve el producto.',
          items: { type: 'string', maxLength: 120 },
          maxItems: 10,
        },
        has_building: { type: 'boolean' },
        near: {
          type: 'array',
          description: 'Filtros de cercanía a una capa del producto.',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              layer: { type: 'string', enum: [...NEARBY_LAYERS] },
              max_m: { type: 'integer', minimum: 1, maximum: 20000 },
            },
            required: ['layer', 'max_m'],
            additionalProperties: false,
          },
        },
        limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE },
      },
      required: ['municipality'],
      additionalProperties: false,
    },
    validator: QueryParcelsInput,
  },

  analyze_area: {
    name: 'analyze_area',
    description:
      'Devuelve el tablero de una zona: predios, población, educación, salud, comercio, suelos, amenazas, áreas protegidas, relieve, ordenamiento y accesibilidad. El ámbito puede ser un municipio, un radio alrededor de un punto, o un área que la persona guardó antes. Usa las secciones que necesites para no pedir más de lo necesario.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'object',
          description: 'Ámbito del análisis.',
          oneOf: [
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'municipality' },
                municipality: { type: 'string', pattern: '^\\d{5}$' },
              },
              required: ['kind', 'municipality'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'radius' },
                lng: { type: 'number', minimum: -180, maximum: 180 },
                lat: { type: 'number', minimum: -90, maximum: 90 },
                radius_m: { type: 'integer', minimum: 1, maximum: 20000 },
              },
              required: ['kind', 'lng', 'lat', 'radius_m'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                kind: { type: 'string', const: 'saved_area' },
                saved_area_id: { type: 'string', maxLength: 60 },
              },
              required: ['kind', 'saved_area_id'],
              additionalProperties: false,
            },
          ],
        },
        sections: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'parcels',
              'population',
              'education',
              'health',
              'commerce',
              'soils',
              'hazards',
              'protected',
              'relief',
              'pot',
              'accessibility',
            ],
          },
          maxItems: 11,
        },
      },
      required: ['scope'],
      additionalProperties: false,
    },
    validator: AnalyzeAreaInput,
  },

  explain_indicator: {
    name: 'explain_indicator',
    description:
      'Devuelve la ficha de un indicador del motor de puntuación: qué mide, su fórmula en palabras, su unidad, si más es mejor o peor, sus puntos de corte, sus fuentes y la explicación del valor concreto si se lo pasas. Úsala cuando la persona pregunte "¿cómo se calcula esto?" o "¿qué significa este puntaje?".',
    inputSchema: {
      type: 'object',
      properties: {
        indicator_id: {
          type: 'string',
          description: 'Identificador del indicador, por ejemplo slope_mean_pct.',
          maxLength: 80,
        },
        value: {
          description: 'Valor crudo del indicador, si quieres la explicación de un caso concreto.',
          anyOf: [{ type: 'number' }, { type: 'string', maxLength: 120 }, { type: 'boolean' }],
        },
        target_use: {
          type: 'string',
          description:
            'Uso objetivo, si la pregunta es sobre aptitud (por ejemplo vivienda_unifamiliar). Algunos indicadores se orientan distinto según el uso.',
          maxLength: 60,
        },
      },
      required: ['indicator_id'],
      additionalProperties: false,
    },
    validator: ExplainIndicatorInput,
  },

  get_coverage: {
    name: 'get_coverage',
    description:
      'Dice qué información tiene el producto para un municipio y quién es su gestor catastral. Úsala antes de afirmar que algo no existe: si el municipio no es jurisdicción del IGAC, puede que no haya predios pero sí población, colegios, suelos y amenazas. Responder "no hay nada" cuando sí hay capas es un error.',
    inputSchema: {
      type: 'object',
      properties: {
        municipality: {
          type: 'string',
          description: 'Código DIVIPOLA del municipio, 5 dígitos.',
          pattern: '^\\d{5}$',
        },
      },
      required: ['municipality'],
      additionalProperties: false,
    },
    validator: GetCoverageInput,
  },

  get_glossary_term: {
    name: 'get_glossary_term',
    description:
      'Devuelve la definición en español claro de un término del glosario del producto (NPN, avalúo catastral, vocación de uso, POT, zona homogénea, celda H3, amenaza, frontera agrícola…). Úsala para explicar palabras técnicas en vez de definirlas de memoria.',
    inputSchema: {
      type: 'object',
      properties: {
        term_id: {
          type: 'string',
          description: 'Identificador del término, por ejemplo avaluo_catastral.',
          maxLength: 80,
        },
      },
      required: ['term_id'],
      additionalProperties: false,
    },
    validator: GetGlossaryTermInput,
  },
};

export const TOOL_DEFINITION_LIST: readonly ToolDefinition[] = ASSISTANT_TOOL_NAMES.map(
  (name) => TOOL_DEFINITIONS[name],
);

// ─── Construcción del registro de herramientas ────────────────────────────────

/** Resultado normalizado de "no tengo ese dato". Nunca se rellena con una estimación. */
export function notAvailableResult(message: string): ToolResult {
  return { ok: false, data: null, sources: [], message };
}

export function invalidInputResult(errors: readonly string[]): ToolResult {
  return {
    ok: false,
    data: null,
    sources: [],
    message: `La herramienta se llamó con datos inválidos y no se ejecutó: ${errors.join('; ')}. Corrige la llamada o dile a la persona que no puedes obtener el dato.`,
  };
}

/**
 * Envuelve un handler con la validación de su esquema. Si la entrada no valida, el handler
 * no se ejecuta: se devuelve el error al modelo para que corrija o desista.
 */
export function defineTool(definition: ToolDefinition, handler: ToolHandler): AssistantTool {
  const guarded: ToolHandler = async (input, ctx) => {
    const parsed = definition.validator.safeParse(input);
    if (!parsed.success) {
      return invalidInputResult(
        parsed.error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`),
      );
    }
    try {
      return await handler(parsed.data, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error desconocido';
      return {
        ok: false,
        data: null,
        sources: [],
        message: `La consulta falló (${message}). Dile a la persona que el dato no está disponible en este momento; no lo estimes.`,
      };
    }
  };
  return { definition, handler: guarded };
}

/**
 * Arma la lista de herramientas con los handlers que inyecte la API. Las que no tengan
 * handler simplemente no se ofrecen al modelo: es mejor que no exista una herramienta que
 * tener una que falle siempre.
 */
export function createTools(
  handlers: Partial<Record<AssistantToolName, ToolHandler>>,
): AssistantTool[] {
  const tools: AssistantTool[] = [];
  for (const name of ASSISTANT_TOOL_NAMES) {
    const handler = handlers[name];
    if (!handler) continue;
    tools.push(defineTool(TOOL_DEFINITIONS[name], handler));
  }
  return tools;
}

/**
 * Comprueba que no se haya colado una herramienta de consulta libre. Se ejecuta al construir
 * el asistente: es una guarda de diseño, no una sugerencia.
 */
export function assertNoFreeFormQueryTools(tools: readonly AssistantTool[]): void {
  // `sql` se busca sin exigir frontera de palabra a la izquierda: `run_sql` o `rawSql` no
  // tienen frontera antes de "sql" porque el guión bajo es carácter de palabra.
  const forbidden =
    /(?:^|[^a-z])sql(?:$|[^a-z])|query_raw|raw_query|\b(?:execute|eval|shell)\b|consulta\s+libre/i;
  for (const tool of tools) {
    const haystack = `${tool.definition.name} ${JSON.stringify(tool.definition.inputSchema)}`;
    if (forbidden.test(haystack)) {
      throw new Error(
        `Herramienta no permitida para el asistente: "${tool.definition.name}". El asistente nunca ejecuta consultas libres (PLAN.md §13).`,
      );
    }
  }
}

/** Nombres de herramienta que la API debe implementar como mínimo para que el asistente sirva. */
export const MINIMUM_USEFUL_TOOLS: readonly AssistantToolName[] = [
  'search_places',
  'explain_indicator',
  'get_glossary_term',
];
