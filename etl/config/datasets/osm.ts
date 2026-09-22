/**
 * OpenStreetMap — extracto de Colombia (Geofabrik).
 *
 * Verificado en Fase 0: la página de Geofabrik responde 200 y publica
 * `colombia-latest.osm.pbf`, `colombia-latest-free.shp.zip` y
 * `colombia-latest-free.gpkg.zip`, con corte diario.
 * Evidencia del descriptor: `data-catalog/osm/geofabrik-colombia.json`.
 *
 * INSPECCIONADO en la Fase 4 (2026-09-21) con el fichero descargado de verdad:
 * `colombia-latest.osm.pbf`, 329 720 308 bytes, md5 `e55fbc2186df3fb513b966f0c9940bbd`
 * (coincide con el `.md5` publicado), corte `2026-09-20T20:22:06Z` declarado por el propio
 * fichero, escrito por `osmium/1.16.0`. Contiene 47 799 384 nodos (623 390 con etiquetas),
 * 5 239 875 ways y 37 868 relaciones.
 *
 * El histograma REAL de claves y valores está en
 * `data-catalog/osm/etiquetas-observadas.json`, que produce
 * `pnpm --filter @terracolombia/db load:osm -- --inspect`. Todo lo que declara `fieldMapping`
 * sale de ahí; el mapeo completo de etiqueta → categoría vive en
 * `packages/db/src/seed/osm-tags.ts` con el conteo de cada valor.
 */

import { type DatasetDefinition } from '../types.js';

const GEOFABRIK = 'https://download.geofabrik.de/south-america';
/**
 * `ODbL 1.0` sin el paréntesis: `isShareAlike()` empareja la licencia con el id
 * `ODbL-1.0` de `LICENSES` normalizando separadores, y con la forma larga no emparejaba.
 */
const OSM_LICENSE = 'ODbL 1.0';
const OSM_ATTRIBUTION = '© colaboradores de OpenStreetMap, ODbL 1.0';
const CATALOG_FILE = 'data-catalog/osm/etiquetas-observadas.json';
const INSPECTED_AT = '2026-09-21';

/**
 * Etiquetas de contacto y dirección que NO entran a la base (regla 3). La ingesta funciona por
 * lista blanca —solo pasa lo declarado en `fieldMapping`—, así que esta lista sirve para dejar
 * dicho qué se descarta y para el registro en `meta.pii_discard_log`.
 *
 * Criterio: el rótulo de un comercio (`name`) es dato público; el teléfono, el correo, el
 * operador y la dirección de puerta, no. Conteos observados en el extracto entre paréntesis.
 */
const OSM_CONTACT_TAGS: readonly string[] = [
  'phone', // 20 729 nodos + 1 689 ways
  'contact:phone', // 804
  'contact:mobile', // 351
  'mobile', // 345
  'fax',
  'contact:fax',
  'email', // 2 794
  'contact:email',
  'operator:email',
  'operator:phone',
  'operator', // 18 876 nodos + 12 486 ways: puede ser una persona natural
  'contact:instagram', // 835
  'contact:facebook', // 536
  'contact:whatsapp',
  'contact:website',
  'addr:street', // 45 135 nodos + 54 217 ways
  'addr:housenumber', // 19 431
  'addr:housename', // 484
  'addr:unit', // 362
  'addr:full', // 1 830
  'description', // 12 524: texto libre del editor, es donde se cuela la PII
  'note', // 16 363
  'fixme', // 44 613
];

const ROADS: DatasetDefinition = {
  id: 'osm-vias-colombia',
  source: 'OSM',
  name: 'Red vial de Colombia (extracto Geofabrik)',
  url: `${GEOFABRIK}/colombia-latest.osm.pbf`,
  connector: 'osm',
  format: 'pbf',
  crs: 4326,
  frequency: 'diaria',
  license: OSM_LICENSE,
  attribution: OSM_ATTRIBUTION,
  /**
   * Claves de etiqueta OSM observadas en los ways con `highway=*`, con su conteo real.
   * `highway` está en 964 689 ways de la red vehicular; los demás son opcionales.
   */
  fieldMapping: {
    highway: {
      target: 'class',
      sqlType: 'TEXT',
      transform: 'valor de OSM sin traducir; solo se ingieren las 16 clases vehiculares',
      note:
        'Observado: residential 424 744, service 195 877, track 126 115, unclassified 111 484, ' +
        'tertiary 41 328, secondary 24 478, primary 16 746, trunk 15 394, trunk_link 3 923, ' +
        'primary_link 2 309, secondary_link 1 682, tertiary_link 979, living_street 622, road 14. ' +
        'NO hay ni un `motorway` en Colombia. Se excluyen footway (105 501), path (44 750), ' +
        'pedestrian, steps, bridleway, cycleway, corridor, construction, proposed y basura de tecleo.',
    },
    name: {
      target: 'name',
      sqlType: 'TEXT',
      transform: 'trim, máximo 250 caracteres; se descarta si contiene teléfono o correo',
      note: '374 509 vías con nombre. No se sustituye por `ref` cuando falta.',
    },
    surface: {
      target: 'surface / is_paved',
      sqlType: 'TEXT / BOOLEAN',
      transform:
        'se guarda literal en `surface`; `is_paved` = true/false según la lista de valores ' +
        'observados, y NULL si la vía no trae la etiqueta',
      note:
        '312 055 vías con `surface`. Valores: asphalt 110 325, unpaved 97 083, concrete 37 853, ' +
        'ground 16 403, paved 15 804, gravel 10 364, dirt 9 147 … más variantes en español ' +
        '(asfalto, pavimento, afirmado, destapada). Cobertura por clase: trunk 96 %, primary 71 %, ' +
        'secondary 67 %, tertiary 62 %, residential 26 %, track 25 %.',
    },
    lanes: {
      target: 'lanes',
      sqlType: 'INT',
      transform: 'primer entero del valor, acotado a 1–20; fuera de rango se descarta',
      note: '133 858 vías con `lanes`. OSM admite `2;1` (por sentido).',
    },
    maxspeed: {
      target: 'maxspeed_kmh',
      sqlType: 'INT',
      transform: 'entero en km/h (convierte `mph`), acotado a 5–150; `none`/`signals` → NULL',
      note: '47 251 vías con `maxspeed`.',
    },
    ref: {
      target: 'tags.ref',
      sqlType: 'JSONB',
      note: '22 876 vías con `ref` (número de ruta nacional o departamental).',
    },
    oneway: { target: 'tags.oneway', sqlType: 'JSONB', note: '144 548 vías.' },
    access: { target: 'tags.access', sqlType: 'JSONB', note: '60 440 vías.' },
    tracktype: { target: 'tags.tracktype', sqlType: 'JSONB', note: '30 989 vías (solo `track`).' },
    bridge: { target: 'tags.bridge', sqlType: 'JSONB', note: '29 869 vías.' },
    smoothness: { target: 'tags.smoothness', sqlType: 'JSONB', note: '9 106 vías.' },
    tunnel: { target: 'tags.tunnel', sqlType: 'JSONB', note: '1 415 vías.' },
    toll: { target: 'tags.toll', sqlType: 'JSONB', note: '649 vías.' },
  },
  piiBlocklist: OSM_CONTACT_TAGS,
  targetTable: 'ctx.road',
  validations: [
    {
      id: 'osm-checksum',
      description: 'El md5 del .pbf debe coincidir con el .md5 publicado por Geofabrik.',
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
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${GEOFABRIK}/colombia-latest.osm.pbf`,
    catalogFile: CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 4,
  notes: [
    'Herramienta de carga: lector propio de PBF (`packages/db/src/seed/osm-pbf.ts`) porque en el equipo no hay `osm2pgsql` ni `osmium`. Ver ADR-010.',
    'ODbL es una licencia con cláusula de compartir-igual sobre bases derivadas: hay que mantener OSM separado de los datos del IGAC en la base y en las exportaciones.',
    '`is_paved` se deriva SOLO de `surface`. Sin esa etiqueta queda NULL: no se supone pavimento por clase de vía, aunque eso deje `dist_paved_road_m` sin valor en zonas mal mapeadas.',
    'Las relaciones (37 868) NO se ingieren: su geometría exige ensamblar los ways miembros. Declarado como faltante en `meta.snapshot.stats`.',
    '`muni_code` se asigna por el punto medio de la vía: una vía puede atravesar varios municipios.',
  ],
};

const POIS: DatasetDefinition = {
  id: 'osm-poi-colombia',
  source: 'OSM',
  name: 'Puntos de interés de Colombia (extracto Geofabrik)',
  url: `${GEOFABRIK}/colombia-latest.osm.pbf`,
  connector: 'osm',
  format: 'pbf',
  crs: 4326,
  frequency: 'diaria',
  license: OSM_LICENSE,
  attribution: OSM_ATTRIBUTION,
  /**
   * Claves clasificadoras observadas, en el orden de prioridad que aplica la ingesta. El mapeo
   * valor → categoría, con el conteo de cada valor, está en `packages/db/src/seed/osm-tags.ts`.
   */
  fieldMapping: {
    amenity: {
      target: 'category / subcategory',
      sqlType: 'TEXT / TEXT',
      transform:
        'valor → categoría del producto (alimentacion, financiero, servicios, ocio, comercio); ' +
        '`subcategory` guarda el valor de OSM tal cual',
      note:
        '128 183 elementos, 237 valores. Top: school 35 464 (NO se ingiere, es del MEN), ' +
        'restaurant 14 831, parking 9 994 (excluido), place_of_worship 5 450, fast_food 4 353, ' +
        'fuel 4 271, pharmacy 4 269, cafe 4 153, bank 3 320. Educación y salud se excluyen porque ' +
        'sus fuentes oficiales son el MEN (ctx.school) y el REPS (ctx.health_facility).',
    },
    shop: {
      target: 'category / subcategory',
      sqlType: 'TEXT / TEXT',
      transform:
        'alimentación y servicios según lista declarada; cualquier otro valor → `comercio` ' +
        '(shop=* es comercio por definición)',
      note:
        '58 688 elementos, 225 valores. Top: convenience 6 963, supermarket 5 593, bakery 3 978, ' +
        'clothes 3 042, car_repair 2 489, hairdresser 2 354, yes 2 250, hardware 2 137. ' +
        '`shop=vacant` (103) y `shop=no` (30) se excluyen: no hay establecimiento.',
    },
    tourism: {
      target: 'category / subcategory',
      sqlType: 'TEXT / TEXT',
      transform:
        'hotel/hostel/camp_site… → `alojamiento`; attraction/viewpoint/museum… → `turismo`',
      note:
        '15 197 elementos, 31 valores. Top: hotel 5 644, hostel 1 385, attraction 1 181, ' +
        'viewpoint 1 043, artwork 1 021, information 941, guest_house 883.',
    },
    leisure: {
      target: 'category / subcategory',
      sqlType: 'TEXT / TEXT',
      transform: 'valores de recreación → `ocio`',
      note:
        '57 830 elementos, 64 valores. Top: pitch 20 043, park 14 356, swimming_pool 9 639, ' +
        'garden 4 804, playground 2 639, sports_centre 1 690. `nature_reserve` (353) se excluye: ' +
        'las áreas protegidas vienen del RUNAP.',
    },
    office: {
      target: 'category / subcategory',
      sqlType: 'TEXT / TEXT',
      transform: '`financial`/`insurance` → `financiero`; cualquier otro valor → `servicios`',
      note: '5 279 elementos, 79 valores. Top: government 1 098, company 1 012, educational_institution 518.',
    },
    craft: {
      target: 'category / subcategory',
      sqlType: 'TEXT / TEXT',
      transform: 'cualquier valor → `servicios` (talleres y oficios)',
      note: '1 912 elementos, 59 valores. Top: carpenter 216, electronics_repair 183, dressmaker 126.',
    },
    historic: {
      target: 'category / subcategory',
      sqlType: 'TEXT / TEXT',
      transform: 'bienes visitables → `turismo`',
      note: '2 800 elementos, 38 valores. Top: memorial 761, monument 665, building 278, archaeological_site 251.',
    },
    name: {
      target: 'name',
      sqlType: 'TEXT',
      transform: 'trim, máximo 250 caracteres; se descarta si contiene teléfono o correo',
      note:
        'El rótulo comercial es dato público (CLAUDE.md regla 3: «el nombre de un comercio no es ' +
        'dato personal»). 228 889 nodos y 543 136 ways con `name` en todo el extracto.',
    },
    brand: { target: 'tags.brand', sqlType: 'JSONB', note: '4 951 nodos.' },
    cuisine: { target: 'tags.cuisine', sqlType: 'JSONB', note: '6 367 nodos.' },
    opening_hours: { target: 'tags.opening_hours', sqlType: 'JSONB', note: '8 782 nodos.' },
    wheelchair: { target: 'tags.wheelchair', sqlType: 'JSONB', note: 'Accesibilidad declarada.' },
    stars: { target: 'tags.stars', sqlType: 'JSONB', note: 'Categoría hotelera declarada.' },
    rooms: {
      target: 'tags.rooms',
      sqlType: 'JSONB',
      note: 'Habitaciones declaradas (alojamiento).',
    },
  },
  piiBlocklist: OSM_CONTACT_TAGS,
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
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${GEOFABRIK}/colombia-latest.osm.pbf`,
    catalogFile: CATALOG_FILE,
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 4,
  notes: [
    'Categorías del producto: comercio, alimentacion, servicios, financiero, ocio, turismo, alojamiento. Son las que consumen `indicator-inputs.ts` y `cell-inputs.ts`; no se inventan nuevas.',
    '`healthcare=*` (6 014 elementos) no clasifica: la salud viene del REPS. `amenity=school` tampoco: viene del MEN.',
    'La cobertura de POI en OSM es muy desigual entre ciudades y zonas rurales: la UI debe advertirlo (regla 6).',
    'Los POIs dibujados como polígono se guardan en su centroide, porque `ctx.poi.geom` es `geometry(Point,4326)`.',
  ],
};

export const OSM_DATASETS: readonly DatasetDefinition[] = [ROADS, POIS];
