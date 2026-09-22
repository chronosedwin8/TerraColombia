/**
 * Buscar un departamento o un municipio escribiendo lo que uno sabe: el nombre.
 *
 * Vive fuera del componente para poder probarlo. El orden de los resultados es la mitad del
 * trabajo: con un `includes` simple, escribir «Palmi» ofrecía primero «Los Palmitos» (Sucre,
 * 20.000 habitantes) y dejaba «Palmira» (Valle, 300.000) en tercer lugar, porque la lista
 * llega ordenada por departamento y nombre. Quien escribe unas letras espera arriba lo que
 * empieza por ellas.
 */

export interface PlaceOption {
  /** Código DIVIPOLA: dos dígitos para departamento, cinco para municipio. */
  code: string;
  name: string;
  /** Segunda línea: el departamento del municipio, o su región. */
  context?: string | null;
}

/** Minúsculas y sin tildes: «Chocó» se encuentra escribiendo «choco». */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Qué tan bien responde una opción a lo escrito. Menor es mejor; `null` = no responde. */
export function rankPlace(option: PlaceOption, folded: string): number | null {
  if (option.code === folded) return 0;
  if (option.code.startsWith(folded)) return 1;
  const name = fold(option.name);
  if (name === folded) return 2;
  if (name.startsWith(folded)) return 3;
  // «Mompox» debe encontrar «Santa Cruz de Mompox»: vale que empiece cualquier palabra.
  if (name.split(/[\s-]+/).some((w) => w.startsWith(folded))) return 4;
  if (name.includes(folded)) return 5;
  // El departamento también cuenta: escribir «Guajira» ofrece sus municipios.
  if (option.context && fold(option.context).includes(folded)) return 6;
  return null;
}

/** Las opciones que responden a lo escrito, de la más probable a la menos. */
export function searchPlaces(
  options: readonly PlaceOption[],
  query: string,
  limit = 80,
): PlaceOption[] {
  const q = fold(query);
  if (q === '') return options.slice(0, limit);
  return options
    .map((o) => ({ o, r: rankPlace(o, q) }))
    .filter((x): x is { o: PlaceOption; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.o.name.localeCompare(b.o.name, 'es'))
    .slice(0, limit)
    .map((x) => x.o);
}
