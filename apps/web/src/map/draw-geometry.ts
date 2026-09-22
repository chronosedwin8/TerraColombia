/**
 * Elegir cuál de las figuras del lienzo es la zona que el usuario dibujó.
 *
 * `terra-draw` mantiene un arreglo de figuras y no dice cuál es «la buena». El código tomaba
 * la última (`features.at(-1)`), y eso enviaba a analizar un polígono con los cuatro vértices
 * en el mismo punto —«Área dibujada: 0,00 km²»—, porque el doble clic que cierra el dibujo
 * deja abierta una figura nueva y vacía justo detrás de la terminada.
 *
 * Vive fuera del componente para poder probarlo: reproducir el caso exige un navegador, una
 * cuenta con plan de pago y cinco clics con la separación justa.
 */
import type { GeoJsonGeometry } from '@terracolombia/shared';

/** Figura tal como la devuelve `getSnapshot()` de terra-draw. */
export interface DrawnFeature {
  id?: string | number;
  geometry?: GeoJsonGeometry;
}

/** Vértices distintos del anillo exterior. Las figuras degeneradas tienen uno solo. */
export function distinctVertices(geometry: GeoJsonGeometry): number {
  const ring =
    geometry.type === 'Polygon'
      ? (geometry.coordinates[0] ?? [])
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates[0]?.[0] ?? [])
        : [];
  return new Set(ring.map((c) => `${c[0]},${c[1]}`)).size;
}

/** Sirve como ámbito si encierra superficie: tres vértices distintos o más. */
export function isUsableScopeGeometry(
  geometry: GeoJsonGeometry | undefined,
): geometry is GeoJsonGeometry {
  return geometry !== undefined && distinctVertices(geometry) >= 3;
}

/**
 * La figura que se publica: la que terra-draw declara terminada si encierra superficie y,
 * mientras se dibuja, la última que ya la encierre. `null` si todavía no hay ninguna.
 */
export function pickDrawnGeometry(
  features: readonly DrawnFeature[],
  finishedId?: string | number,
): GeoJsonGeometry | null {
  const finished = finishedId === undefined ? undefined : features.find((f) => f.id === finishedId);
  if (isUsableScopeGeometry(finished?.geometry)) return finished.geometry;
  return features.filter((f) => isUsableScopeGeometry(f.geometry)).at(-1)?.geometry ?? null;
}
