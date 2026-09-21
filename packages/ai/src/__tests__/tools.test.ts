import { describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_TOOL_NAMES,
  TOOL_DEFINITIONS,
  TOOL_DEFINITION_LIST,
  assertNoFreeFormQueryTools,
  createTools,
  defineTool,
  notAvailableResult,
  type ToolHandler,
} from '../tools.js';

const ok: ToolHandler = async () => ({ ok: true, data: { valor: 1 }, sources: [] });

describe('catálogo de herramientas', () => {
  it('declara exactamente las herramientas del plan', () => {
    expect([...ASSISTANT_TOOL_NAMES].sort()).toEqual([
      'analyze_area',
      'explain_indicator',
      'get_coverage',
      'get_glossary_term',
      'get_parcel',
      'query_parcels',
      'search_places',
    ]);
  });

  it('no existe ninguna herramienta de consulta libre ni de SQL', () => {
    for (const definition of TOOL_DEFINITION_LIST) {
      expect(definition.name).not.toMatch(/sql|raw|execute|eval|shell/i);
      expect(JSON.stringify(definition.inputSchema)).not.toMatch(/\bsql\b/i);
    }
    expect(() =>
      assertNoFreeFormQueryTools([
        {
          definition: { ...TOOL_DEFINITIONS.search_places, name: 'run_sql' as never },
          handler: ok,
        },
      ]),
    ).toThrow(/no permitida/);
  });

  it('todos los esquemas son cerrados y están documentados', () => {
    for (const definition of TOOL_DEFINITION_LIST) {
      expect(definition.inputSchema.type).toBe('object');
      expect(definition.inputSchema.additionalProperties).toBe(false);
      expect(definition.inputSchema.required.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(80);
      for (const required of definition.inputSchema.required) {
        expect(Object.keys(definition.inputSchema.properties)).toContain(required);
      }
    }
  });
});

describe('defineTool', () => {
  it('valida la entrada antes de ejecutar el handler', async () => {
    const handler = vi.fn<ToolHandler>(async () => ({ ok: true, data: null, sources: [] }));
    const tool = defineTool(TOOL_DEFINITIONS.get_parcel, handler);

    const malo = await tool.handler({ npn: '123' }, {});
    expect(malo.ok).toBe(false);
    expect(malo.message).toContain('datos inválidos');
    expect(handler).not.toHaveBeenCalled();

    const bueno = await tool.handler({ npn: '086730100000000120001000000000' }, {});
    expect(bueno.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('acepta el código predial anterior de 20 dígitos', async () => {
    const tool = defineTool(TOOL_DEFINITIONS.get_parcel, ok);
    expect((await tool.handler({ npn: '0'.repeat(20) }, {})).ok).toBe(true);
  });

  it('rechaza claves que el esquema no contempla', async () => {
    const tool = defineTool(TOOL_DEFINITIONS.get_coverage, ok);
    const r = await tool.handler({ municipality: '08573', extra: 'x' }, {});
    // Zod ignora las claves extra, pero el esquema JSON es cerrado: el modelo no las manda.
    expect(r.ok).toBe(true);
  });

  it('exige municipio en query_parcels para no barrer el país', async () => {
    const tool = defineTool(TOOL_DEFINITIONS.query_parcels, ok);
    expect((await tool.handler({ zone: 'urbano' }, {})).ok).toBe(false);
    expect((await tool.handler({ municipality: '08573', zone: 'urbano' }, {})).ok).toBe(true);
  });

  it('valida las capas de cercanía contra la lista cerrada', async () => {
    const tool = defineTool(TOOL_DEFINITIONS.query_parcels, ok);
    const malo = await tool.handler(
      { municipality: '08573', near: [{ layer: 'inventada', max_m: 100 }] },
      {},
    );
    expect(malo.ok).toBe(false);
  });

  it('convierte un error del handler en "no disponible" en vez de reventar', async () => {
    const tool = defineTool(TOOL_DEFINITIONS.get_coverage, async () => {
      throw new Error('la base no responde');
    });
    const r = await tool.handler({ municipality: '08573' }, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain('no está disponible');
    expect(r.message).toContain('no lo estimes');
  });
});

describe('createTools', () => {
  it('solo ofrece las herramientas que tienen handler', () => {
    const tools = createTools({ search_places: ok, get_glossary_term: ok });
    expect(tools.map((t) => t.definition.name)).toEqual(['search_places', 'get_glossary_term']);
  });

  it('con un mapa vacío no ofrece ninguna', () => {
    expect(createTools({})).toEqual([]);
  });
});

describe('notAvailableResult', () => {
  it('nunca trae datos ni fuentes', () => {
    const r = notAvailableResult('no hay POT para este municipio');
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
    expect(r.sources).toEqual([]);
  });
});
