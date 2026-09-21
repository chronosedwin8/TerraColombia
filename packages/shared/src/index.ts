export * from './constants.js';
export * from './provenance.js';
export * from './types.js';
export * from './dsl.js';
export * from './plans.js';
export * from './glossary.js';
export * from './i18n.js';
export * from './legal.js';
export * from './errors.js';
export * from './logger.js';

// El almacén de objetos NO se reexporta aquí a propósito: usa `node:fs` y este índice lo
// importa también el navegador. Es código de servidor y se importa por su propia ruta:
//   import { getObjectStore } from '@terracolombia/shared/storage';
