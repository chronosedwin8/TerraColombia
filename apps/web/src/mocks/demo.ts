/**
 * Datos de demostración para desarrollo.
 *
 * REGLAS QUE ESTE ARCHIVO RESPETA (CLAUDE.md §2 y §4):
 *  - Nada de aquí se presenta como real: toda `SourceRef` que sale de este módulo lleva
 *    `synthetic: true`, lo que hace aparecer la banda roja «DATOS DE DEMOSTRACIÓN»
 *    (`SyntheticDataBanner`) en cualquier vista que la reciba.
 *  - No se inventan nombres de campos ni de capas: se reutilizan los tipos de
 *    `@terracolombia/shared`, que salen de la inspección real de las fuentes.
 *  - No se inventan cifras territoriales concretas de un predio o municipio existente. Lo que
 *    hay aquí son valores neutros para poder pintar un componente en desarrollo.
 *
 * Nunca se importa desde una vista de producción: solo desde historias de componentes,
 * pruebas manuales y arranques sin backend.
 */
import { buildMeta, type ResponseMeta, type SourceRef } from '@terracolombia/shared';
import type { MetricRow } from '@/api/types';

/** Fuente ficticia, marcada como sintética para que la interfaz lo grite. */
export const DEMO_SOURCE: SourceRef = {
  datasetId: 'demo.dataset',
  source: 'TerraColombia (demostración)',
  name: 'Conjunto de demostración, no proviene de una fuente oficial',
  cutDate: null,
  license: 'Solo para desarrollo',
  attribution: 'DATOS DE DEMOSTRACIÓN · no citar ni publicar',
  url: null,
  synthetic: true,
};

/** `meta` de demostración. Siempre `synthetic: true`. */
export function demoMeta(warnings: string[] = []): ResponseMeta {
  return buildMeta([DEMO_SOURCE], {
    synthetic: true,
    warnings: [
      'Esta respuesta es de demostración: no proviene de las fuentes oficiales.',
      ...warnings,
    ],
  });
}

/** Métricas neutras para maquetar un tablero sin backend. */
export const DEMO_METRICS: MetricRow[] = [
  {
    key: 'demo_count',
    label: 'Indicador de demostración (conteo)',
    value: 0,
    unit: 'unidades',
    sourceDatasetIds: [DEMO_SOURCE.datasetId],
    note: 'Valor de relleno para maquetación. No es un dato.',
  },
  {
    key: 'demo_missing',
    label: 'Indicador sin dato disponible',
    value: null,
    unit: null,
    sourceDatasetIds: [DEMO_SOURCE.datasetId],
    note: 'Sirve para comprobar que la interfaz dice «No disponible» y no inventa un cero.',
  },
  {
    key: 'demo_no_source',
    label: 'Indicador sin procedencia declarada',
    value: 42,
    unit: 'unidades',
    // A propósito vacío: la interfaz debe ocultar la cifra (regla 4).
    sourceDatasetIds: [],
    note: 'Comprueba que una cifra sin fuente no llega a la pantalla.',
  },
];
