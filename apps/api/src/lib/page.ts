/**
 * Forma de lista paginada que espera el frontend.
 *
 * Toda lista de la API la devuelve así, aunque no pagine: que el cliente no tenga que
 * recordar cuáles devuelven un arreglo suelto y cuáles un objeto.
 */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Total exacto cuando se puede calcular sin costo; null si no. */
  total: number | null;
}

export function page<T>(items: T[], opts: { nextCursor?: string | null; total?: number | null } = {}): Page<T> {
  return {
    items,
    nextCursor: opts.nextCursor ?? null,
    total: opts.total ?? items.length,
  };
}
