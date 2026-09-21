/**
 * `@terracolombia/sources` — conectores de fuentes externas y crawler de Fase 0.
 *
 * El paquete no depende de ningún módulo de terceros en tiempo de ejecución:
 * usa solo APIs nativas de Node 22+, de modo que el crawler pueda ejecutarse con
 * `npx tsx` sin instalar el workspace.
 */

export * from './connectors/index.js';
export * from './crawler/index.js';
