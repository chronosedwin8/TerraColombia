/**
 * Qué fuentes cita cada respuesta.
 *
 * Vive en `packages/db` y no en la API porque tiene dos consumidores: las rutas y el worker.
 * Cuando solo lo tenía la API, un análisis encolado guardaba sus cifras sin procedencia, y la
 * interfaz —que cumple la regla 4: sin fuente, fecha de corte y licencia no se muestra un
 * número— pintaba «No disponible» en TODO el tablero de una zona con 108.633 predios. El dato
 * estaba; lo que faltaba era poder declarar de dónde salía.
 */
import { cadastreDatasetIdsFor, getSourceRefs } from '../repositories/meta.js';

/**
 * Datasets que alimentan cada bloque de la respuesta. Centralizado para no dispersarlo.
 *
 * El grupo `cadastre` es el único que NO se resuelve por esta lista: el catastro
 * real se declara por departamento (`igac-cadastre-08`, `igac-cadastre-25`…) porque
 * `meta.snapshot` solo admite un corte activo por dataset. Lo resuelve
 * `cadastreDatasetIdsFor`, que mira qué cortes tienen predios en el ámbito que se
 * está consultando. La lista se deja aquí solo como respaldo para un despliegue que
 * todavía no tenga nada cargado.
 */
export const DATASET_GROUPS = {
  cadastre: ['demo-cadastre'],
  admin: ['dane-divipola', 'dane-mgn'],
  population: ['dane-cnpv', 'dane-mgn', 'dane-projections'],
  education: ['men-establecimientos', 'demo-facilities'],
  health: ['minsalud-reps', 'demo-facilities'],
  /* Los dos datasets reales de OSM del catálogo (`etl/config/datasets/osm.ts`). Van juntos
     porque ODbL 1.0 exige la atribución en cualquier respuesta que use uno de los dos. */
  osm: ['osm-vias-colombia', 'osm-poi-colombia'],
  soils: ['igac-suelos', 'igac-capacidad-uso', 'igac-vocacion', 'igac-conflictos'],
  hazards: ['sgc-movimientos-masa', 'sgc-sismica', 'ideam-inundacion'],
  protected: ['runap-areas-protegidas'],
  ethnic: ['ant-resguardos', 'mininterior-consejos'],
  pot: ['pot-municipal'],
  relief: ['copernicus-dem'],
  mining: ['anm-titulos'],
  contracts: ['secop-ii'],
} as const;

/**
 * Ámbito territorial de la respuesta, cuando la ruta lo conoce.
 *
 * Sirve para que la procedencia cite el corte del municipio que se consultó y no
 * todos los cortes cargados del país. Sin ámbito la respuesta sigue siendo
 * correcta, solo menos precisa.
 */
export interface DatasetScope {
  muniCode?: string | null;
  deptCode?: string | null;
}

/**
 * Filtra un grupo de datasets a los que realmente existen en `meta.dataset`. Evita que la
 * respuesta cite fuentes que este despliegue no ha cargado.
 *
 * El grupo `cadastre` se resuelve aparte, contra los cortes que tienen predios en
 * el ámbito: es lo que evita que la ficha de un predio real de Baranoa salga
 * citando el corte de demostración de Soledad y marcada como dato sintético.
 */
export async function presentDatasets(
  groups: Array<keyof typeof DATASET_GROUPS>,
  scope: DatasetScope = {},
): Promise<string[]> {
  const wantsCadastre = groups.includes('cadastre');
  const others = groups.filter((g) => g !== 'cadastre');
  const candidates = [...new Set(others.flatMap((g) => DATASET_GROUPS[g]))];

  const [refs, cadastreIds] = await Promise.all([
    candidates.length > 0 ? getSourceRefs(candidates) : Promise.resolve([]),
    wantsCadastre
      ? cadastreDatasetIdsFor(scope)
      : Promise.resolve<string[]>([]),
  ]);

  // Si el ámbito no tiene ningún predio (municipio sin catastro), no se cita
  // ninguna fuente catastral: el bloque `coverage` de la respuesta es el que tiene
  // que explicar por qué no hay datos (regla 6), no una fuente citada en vano.
  return [...new Set([...refs.map((r) => r.datasetId), ...cadastreIds])];
}
