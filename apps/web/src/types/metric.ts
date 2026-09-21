import type { Maybe } from '@terracolombia/shared';

/**
 * Fila de tablero: una cifra con su unidad y los datasets que la respaldan.
 *
 * Vive aquí y no en `api/types.ts` porque **la API no devuelve nada con esta forma**. Es un
 * modelo de presentación que las vistas construyen a partir de las respuestas: el análisis
 * de zona entrega bloques con nombre (`parcels`, `population`, `facilities`…) y cada vista
 * decide qué filas arma con ellos.
 *
 * Estuvo declarado entre los tipos de la API, lo que sugería que llegaba del servidor. No
 * llegaba: esa confusión es parte de por qué varias pantallas leían campos inexistentes.
 *
 * `sourceDatasetIds` no es opcional a propósito. `MetricGrid` filtra con él las fuentes de
 * la respuesta y `DataValue` oculta la cifra si no encuentra ninguna: sin procedencia no se
 * muestra el número (regla 4 de CLAUDE.md).
 */
export interface MetricRow {
  key: string;
  label: string;
  value: Maybe<number | string>;
  unit: string | null;
  /** Datasets que respaldan la cifra. Sin esto la interfaz no la muestra. */
  sourceDatasetIds: string[];
  /** Explicación corta en español, para el pie de la métrica. */
  note?: string;
}

/** Barra de una distribución: el reparto de un total entre categorías. */
export interface DistributionBucket {
  label: string;
  value: number;
  /** Porcentaje 0–100 cuando el total se conoce; null cuando no se puede calcular. */
  pct: number | null;
}
