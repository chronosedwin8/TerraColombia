import { useRouter } from 'vue-router';
import type { SearchResultItem, SearchTarget } from '@/api/types';

/**
 * Qué hacer cuando alguien elige un resultado de la búsqueda.
 *
 * La API no devuelve `id`, `centroid` ni `bbox` en cada resultado: devuelve un `target`
 * discriminado que dice exactamente a dónde ir. Las vistas leían los campos viejos, que
 * llegaban `undefined`, así que elegir un predio navegaba a `/predio/undefined` y elegir
 * un municipio no hacía nada.
 *
 * Aquí solo se decide el destino; mover el mapa es cosa de cada vista, porque una tiene
 * mapa y la otra no.
 */
export interface SearchDestination {
  /** Centro al que volar, cuando el destino tiene punto conocido. */
  center: [number, number] | null;
  /** Zoom sugerido para ese centro. */
  zoom: number | null;
  /** Municipio que queda seleccionado, si el destino lo implica. */
  muniCode: string | null;
}

/** Traduce el destino de un resultado a coordenadas y municipio, sin navegar. */
export function destinationOf(target: SearchTarget): SearchDestination {
  switch (target.type) {
    case 'municipality':
      return { center: null, zoom: null, muniCode: target.code };
    case 'point':
      return { center: [target.lng, target.lat], zoom: target.zoom, muniCode: null };
    case 'area':
      return target.lng !== null && target.lat !== null
        ? { center: [target.lng, target.lat], zoom: 14, muniCode: null }
        : { center: null, zoom: null, muniCode: null };
    // Un predio se abre en su ficha, así que no hay nada que centrar aquí; y un
    // departamento no lleva punto en el resultado.
    default:
      return { center: null, zoom: null, muniCode: null };
  }
}

export function useSearchNavigation() {
  const router = useRouter();

  /**
   * Navega si el destino es una ficha propia. Devuelve `true` cuando ya se encargó, para
   * que la vista sepa que no tiene que tocar el mapa.
   */
  function navigateTo(result: SearchResultItem): boolean {
    if (result.target.type === 'parcel') {
      void router.push({ name: 'parcel', params: { npn: result.target.npn } });
      return true;
    }
    return false;
  }

  return { navigateTo, destinationOf };
}
