/**
 * `@terracolombia/scoring` — motor de indicadores y plantillas de negocio.
 *
 * Lógica pura y explicable: no accede a base de datos. Recibe los valores crudos ya
 * consultados (`IndicatorInputs`) y devuelve puntajes con desglose por factor.
 */
export * from './normalize.js';
export * from './indicators.js';
export * from './composite.js';
export * from './use-profiles.js';
export * from './suitability.js';
export * from './templates.js';
export * from './location-intel.js';
