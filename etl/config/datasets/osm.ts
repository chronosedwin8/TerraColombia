/**
 * OpenStreetMap — extracto de Colombia (Geofabrik).
 *
 * Verificado en Fase 0: la página de Geofabrik responde 200 y publica
 * `colombia-latest.osm.pbf`, `colombia-latest-free.shp.zip` y
 * `colombia-latest-free.gpkg.zip`, con corte diario.
 * Evidencia: `data-catalog/osm/geofabrik-colombia.json`.
 *
 * El `.pbf` NO se descargó en la Fase 0 (PLAN.md §6 solo pide el descriptor).
 * Por eso los campos van `NOT_INSPECTED`: el esquema real depende del estilo de
 * `osm2pgsql` que se elija, que es una decisión de la Fase 4.
 */

import { NOT_INSPECTED, type DatasetDefinition } from '../types.js';

const GEOFABRIK = 'https://download.geofabrik.de/south-america';
const OSM_LICENSE = 'ODbL 1.0 (Open Database License)';
const OSM_ATTRIBUTION = '© colaboradores de OpenStreetMap, ODbL 1.0';
const CATALOG_FILE = 'data-catalog/osm/geofabrik-colombia.json';

const ROADS: DatasetDefinition = {
  id: 'osm-vias-colombia',
  source: 'OpenStreetMap',
  name: 'Red vial de Colombia (extracto Geofabrik)',
  url: `${GEOFABRIK}/colombia-latest.osm.pbf`,
  connector: 'osm',
  format: 'pbf',
  crs: 4326,
  frequency: 'diaria',
  license: OSM_LICENSE,
  attribution: OSM_ATTRIBUTION,
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [
    // OSM contiene ocasionalmente etiquetas con datos de contacto de negocios.
    // No son PII de personas naturales, pero `contact:phone` y `contact:email`
    // se descartan por coherencia con la regla 3.
    'contact:phone',
    'contact:email',
    'phone',
    'email',
    'operator:email',
  ],
  targetTable: 'ctx.road',
  validations: [
    {
      id: 'osm-checksum',
      description: 'El SHA-256 del .pbf debe coincidir con el .md5 publicado por Geofabrik.',
      severity: 'blocker',
    },
    {
      id: 'osm-bbox',
      description: 'Las geometrías deben caer dentro de la extensión de Colombia.',
      severity: 'warning',
    },
    {
      id: 'road-class-domain',
      description:
        'Se reporta la distribución de `highway=*`; si aparece una clase no contemplada por el motor de accesibilidad, se marca para revisión.',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M4', 'M5', 'M6', 'M7'],
  justification:
    'Es la única fuente abierta con red vial detallada y actualizada a diario de todo el país. Alimenta la distancia a vía principal de la ficha (M2), la accesibilidad del analizador de zona (M4) y el mapa de calor de localización de negocio (M6). La alternativa del IGAC (`Datos_Fundamentales_Transporte_100k`) es de escala 1:100 000: sirve para el contexto regional, no para saber si un lote tiene acceso.',
  inspection: 'url-verificada',
  evidence: { inspectedFrom: `${GEOFABRIK}/colombia.html`, catalogFile: CATALOG_FILE, inspectedAt: '2026-09-21' },
  priority: 1,
  phase: 4,
  notes: [
    'fieldMapping: NO_INSPECCIONADO. El esquema depende del estilo de `osm2pgsql`, que se decide en la Fase 4; no se inventan columnas.',
    'ODbL es una licencia con cláusula de compartir-igual sobre bases derivadas: hay que mantener OSM separado de los datos del IGAC en la base y en las exportaciones.',
    'DECISIÓN PENDIENTE: qué subconjunto de etiquetas ingerir. Cargar el .pbf completo de Colombia es innecesario para el MVP.',
  ],
};

const POIS: DatasetDefinition = {
  id: 'osm-poi-colombia',
  source: 'OpenStreetMap',
  name: 'Puntos de interés y edificios de Colombia (extracto Geofabrik)',
  url: `${GEOFABRIK}/colombia-latest.osm.pbf`,
  connector: 'osm',
  format: 'pbf',
  crs: 4326,
  frequency: 'diaria',
  license: OSM_LICENSE,
  attribution: OSM_ATTRIBUTION,
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: ['contact:phone', 'contact:email', 'phone', 'email', 'operator:email'],
  targetTable: 'ctx.poi',
  validations: [
    {
      id: 'poi-category-mapping',
      description:
        'Toda etiqueta `amenity`/`shop`/`leisure` ingerida debe mapear a una categoría del glosario; las no mapeadas se reportan y no se muestran.',
      severity: 'warning',
    },
    {
      id: 'poi-no-personal-tags',
      description: 'Ninguna etiqueta de contacto personal puede llegar a ctx.poi.',
      severity: 'blocker',
    },
  ],
  modules: ['M2', 'M4', 'M6', 'M7'],
  justification:
    'Comercio, servicios y equipamientos con los que se describe el entorno de un predio y se puntúan las celdas H3 para la localización de negocio (M6). Complementa MEN y REPS, que solo cubren educación y salud.',
  inspection: 'url-verificada',
  evidence: { inspectedFrom: `${GEOFABRIK}/colombia.html`, catalogFile: CATALOG_FILE, inspectedAt: '2026-09-21' },
  priority: 2,
  phase: 4,
  notes: [
    'fieldMapping: NO_INSPECCIONADO, por la misma razón que la red vial.',
    'La cobertura de POI en OSM es muy desigual entre ciudades y zonas rurales: la UI debe advertirlo (regla 6).',
  ],
};

export const OSM_DATASETS: readonly DatasetDefinition[] = [ROADS, POIS];
