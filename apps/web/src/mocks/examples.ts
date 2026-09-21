/**
 * Ejemplos precargados del *onboarding* (PLAN.md §10.1).
 *
 * IMPORTANTE: aquí **no** hay datos inventados. No se fabrica ningún código predial ni ninguna
 * cifra: los ejemplos son puntos de entrada a las vistas reales (un municipio por su código
 * DIVIPOLA, que es un dato público de la nomenclatura del DANE, o directamente el mapa).
 * Los datos que el usuario verá los sirve el API, con su procedencia.
 *
 * Si en el futuro se necesitan datos ficticios para desarrollo, van en `src/mocks/` con
 * `synthetic: true` en su `meta`, lo que hace aparecer la banda «DATOS DE DEMOSTRACIÓN».
 */

export interface GuidedExample {
  id: string;
  label: string;
  /** Qué se aprende con este ejemplo. */
  purpose: string;
  /** Ruta interna, ya con estado en la URL. */
  to: string;
}

export const GUIDED_EXAMPLES: GuidedExample[] = [
  {
    id: 'explore-map',
    label: 'Abrir el mapa y encender capas',
    purpose: 'Ver cómo se combinan predios, colegios y amenazas, y cómo cada capa dice su fuente.',
    to: '/?capas=municipality,department,h3,school',
  },
  {
    id: 'municipality-observatory',
    label: 'Ver los indicadores de un municipio',
    purpose: 'Entender el observatorio municipal y las series por fecha de corte.',
    // 08001 es el código DIVIPOLA de Barranquilla, citado en el glosario de `shared`.
    to: '/observatorio/08001',
  },
  {
    id: 'area-analysis',
    label: 'Analizar una zona dibujada',
    purpose: 'Dibujar un polígono o un radio y leer el tablero de resultados.',
    to: '/zona',
  },
  {
    id: 'location-intel',
    label: '¿Dónde abro mi negocio?',
    purpose: 'Elegir una plantilla, mover los pesos y ver el mapa de calor recalcularse.',
    to: '/localizacion',
  },
];
