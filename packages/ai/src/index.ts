/**
 * `@terracolombia/ai` — asistente del producto (M11).
 *
 * Guardas de PLAN.md §13: el asistente **solo** llama herramientas tipadas, **nunca** genera
 * SQL y **nunca** inventa cifras. Si la herramienta no devuelve el dato, responde que no está
 * disponible. Sin `ANTHROPIC_API_KEY` el paquete degrada a un modo determinista que explica
 * con las plantillas del glosario y del catálogo de indicadores, y lo declara.
 */
export * from './redact.js';
export * from './guards.js';
export * from './prompts.js';
export * from './tools.js';
export * from './explain.js';
export * from './client.js';
