/**
 * Mapeo de etiquetas de OpenStreetMap a `ctx.road` y `ctx.poi`.
 *
 * REGLA 2 de CLAUDE.md: todos los valores de este archivo salen de la inspección real del
 * extracto `colombia-latest.osm.pbf` (corte 2026-09-20, md5 e55fbc2186df3fb513b966f0c9940bbd,
 * 47 799 384 nodos / 5 239 875 ways / 37 868 relaciones). El histograma completo de claves y
 * valores observados está en `data-catalog/osm/etiquetas-observadas.json`, que produce
 * `load-osm.ts --inspect`. Ningún valor está inventado; los que no aparecen en el extracto no
 * se declaran (excepción documentada: `motorway`, ver `ROAD_CLASSES`).
 *
 * REGLA 3: las etiquetas se filtran por LISTA BLANCA (`ROAD_TAG_KEYS`, `POI_TAG_KEYS`). Todo
 * lo demás se descarta antes de tocar la base, incluidas `phone` (20 729 nodos),
 * `contact:phone` (804), `contact:mobile` (351), `mobile` (345), `email` (2 794),
 * `operator` (18 876 nodos + 12 486 ways) y todas las `addr:*`. Ver `OSM_PII_TAG_PATTERNS`.
 */

// ─── Categorías del producto ──────────────────────────────────────────────────

/**
 * Vocabulario de `ctx.poi.category`. No es libre: es exactamente el que consume el producto
 *  - `comercio` + `alimentacion` + `servicios` → densidad de comercio
 *    (`apps/api/src/services/indicator-inputs.ts`, `cell-inputs.ts`).
 *  - `turismo` + `alojamiento` → POIs turísticos de la aptitud turística.
 *  - `financiero` y `ocio` → declarados en `0005_ctx.sql`, `0006_analytics.sql` y usados por la
 *    siembra de demostración; entran en `poi_total_count`.
 * Cualquier categoría nueva habría que añadirla a la vez en el motor, así que aquí no se
 * inventan.
 */
export const POI_CATEGORIES = [
  'comercio',
  'alimentacion',
  'servicios',
  'financiero',
  'ocio',
  'turismo',
  'alojamiento',
] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

// ─── Vías ─────────────────────────────────────────────────────────────────────

/**
 * Clases de `highway=*` que se ingieren: la red por la que circula un vehículo, que es lo que
 * mide la accesibilidad (`roadAccess`, `dist_primary_road_m`, `road_access_score`).
 *
 * Conteos observados en el extracto: residential 424 744, service 195 877, track 126 115,
 * unclassified 111 484, tertiary 41 328, secondary 24 478, primary 16 746, trunk 15 394,
 * trunk_link 3 923, primary_link 2 309, secondary_link 1 682, tertiary_link 979,
 * living_street 622, road 14.
 *
 * Hallazgo de la inspección: **en Colombia no hay ni un `highway=motorway`** (ni
 * `motorway_link`). La red principal se etiqueta `trunk` y `primary`. Los dos valores se
 * mantienen en la lista porque las consultas del producto ya filtran
 * `class IN ('motorway','trunk','primary')` y mañana puede aparecer alguno; hoy no aportan
 * ninguna fila, y así queda dicho.
 *
 * Fuera quedan, con su conteo, por no ser red vehicular: footway 105 501, path 44 750,
 * pedestrian 8 414, steps 7 807, bridleway 7 313, cycleway 4 740, corridor 1 065,
 * construction 1 454, proposed 555, planned 66, busway 232, ladder 133, raceway 111,
 * platform 100, bus_stop 97, services 36, rest_area 22, elevator 12,
 * emergency_access_point 6, escape 2, y la basura de tecleo (`yes` 4, `TR` 3, `10.8` 2,
 * `09` 1, `puente_de_madera` 1).
 */
export const ROAD_CLASSES: ReadonlySet<string> = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'track',
  'road',
]);

/** Etiquetas de vía que se conservan en `ctx.road.tags`. El resto se descarta. */
export const ROAD_TAG_KEYS: readonly string[] = [
  'highway',
  'surface',
  'tracktype',
  'smoothness',
  'lanes',
  'maxspeed',
  'oneway',
  'bridge',
  'tunnel',
  'toll',
  'access',
  'ref',
];

/**
 * Superficies pavimentadas y sin pavimentar, con los valores observados en el extracto
 * (312 055 vías traen `surface`). Incluye las variantes en español que aparecen de verdad en
 * los datos colombianos —`asfalto`, `pavimento`, `afirmado`, `destapada`, `piedra`— y que no
 * están en el vocabulario de OSM pero sí en el fichero.
 *
 * Lo que no esté en ninguna de las dos listas deja `is_paved` en NULL: no se adivina.
 */
export const PAVED_SURFACES: ReadonlySet<string> = new Set([
  'asphalt', // 110 325
  'concrete', // 37 853
  'paved', // 15 804
  'paving_stones', // 5 046
  'concrete:plates', // 2 013
  'sett', // 617
  'cobblestone', // 585
  'concrete:lanes', // 326
  'metal', // 154
  'unhewn_cobblestone', // 137
  'bricks', // 95
  'chipseal', // 16
  'brick', // 6
  'metal_grid', // 4
  'grass_paver', // 20 (adoquín con grama: superficie construida)
  'asfalto',
  'pavimento',
]);

export const UNPAVED_SURFACES: ReadonlySet<string> = new Set([
  'unpaved', // 97 083
  'ground', // 16 403
  'gravel', // 10 364
  'dirt', // 9 147
  'compacted', // 3 757
  'grass', // 579
  'sand', // 409
  'earth', // 388
  'wood', // 371
  'fine_gravel', // 224
  'pebblestone', // 122
  'mud', // 55
  'rock', // 15
  'clay', // 15
  'stepping_stones', // 9
  'stone', // 8
  'piedra',
  'piedras',
  'afirmado',
  'destapada',
  'tierra',
]);

/**
 * ¿La vía está pavimentada? Se decide SOLO con `surface`, nunca por la clase.
 *
 * Tentación descartada: dar por pavimentadas todas las `trunk`/`primary` sin `surface`. Sería
 * inventar el dato (regla 2) justo en el indicador de accesibilidad. Cobertura real de
 * `surface` por clase en este corte: trunk 96 %, primary 71 %, secondary 67 %, tertiary 62 %,
 * unclassified 32 %, residential 26 %, track 25 %, service 17 %. Donde no hay etiqueta,
 * `is_paved` queda NULL y el motor lo reporta como faltante.
 */
export function isPavedSurface(surface: string | undefined): boolean | null {
  if (surface === undefined) return null;
  const s = surface.trim().toLowerCase();
  if (s.length === 0) return null;
  if (PAVED_SURFACES.has(s)) return true;
  if (UNPAVED_SURFACES.has(s)) return false;
  // Valores compuestos observados: `dirt/sand`, `piedras,_tierra`, `asfalto++`.
  const head = s.split(/[/,;+]/)[0]?.trim() ?? '';
  if (PAVED_SURFACES.has(head)) return true;
  if (UNPAVED_SURFACES.has(head)) return false;
  return null;
}

/**
 * `lanes` como entero. En el extracto aparece limpio casi siempre, pero OSM admite
 * `2;1` (por sentido) y hay erratas con decimales: se toma el primer entero y se acota a
 * 1–20, fuera de ese rango el valor no es creíble y se descarta.
 */
export function parseLanes(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = /^\s*(\d{1,2})/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}

/**
 * `maxspeed` en km/h. OSM admite `60`, `60 km/h`, `30 mph`, `none`, `signals`,
 * `CO:urban`… Solo se acepta un número (convirtiendo mph) dentro de 5–150 km/h.
 */
export function parseMaxspeedKmh(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = /^\s*(\d{1,3})\s*(mph|km\/h|kmh)?\s*$/i.exec(value);
  if (!m) return null;
  let n = Number(m[1]);
  if ((m[2] ?? '').toLowerCase() === 'mph') n = Math.round(n * 1.609344);
  return n >= 5 && n <= 150 ? n : null;
}

export interface RoadAttributes {
  /** Valor de `highway` tal cual: `ctx.road.class` declara "clase OSM". */
  readonly klass: string;
  readonly name: string | null;
  readonly surface: string | null;
  readonly isPaved: boolean | null;
  readonly lanes: number | null;
  readonly maxspeedKmh: number | null;
}

/** Atributos de vía, o `null` si la etiqueta `highway` no es de la red vehicular. */
export function roadFromTags(get: (key: string) => string | undefined): RoadAttributes | null {
  const klass = get('highway');
  if (klass === undefined || !ROAD_CLASSES.has(klass)) return null;
  const surface = get('surface') ?? null;
  const name = get('name') ?? null;
  return {
    klass,
    name: name !== null && name.trim().length > 0 ? name.trim().slice(0, 250) : null,
    surface,
    isPaved: isPavedSurface(surface ?? undefined),
    lanes: parseLanes(get('lanes')),
    maxspeedKmh: parseMaxspeedKmh(get('maxspeed')),
  };
}

// ─── Puntos de interés ────────────────────────────────────────────────────────

/**
 * Claves que clasifican un POI, en orden de prioridad. Si la primera que existe no mapea a
 * ninguna categoría, se prueba la siguiente (caso real: `amenity=fuel` + `shop=convenience`).
 *
 * `healthcare=*` (6 014 elementos) NO clasifica: salud viene del REPS de MinSalud, que es la
 * fuente oficial con código de habilitación. Ingerirla aquí duplicaría los conteos.
 */
export const POI_CLASSIFIER_KEYS: readonly string[] = [
  'amenity',
  'shop',
  'tourism',
  'leisure',
  'office',
  'craft',
  'historic',
];

/** Etiquetas de POI que se conservan en `ctx.poi.tags`, además de la clave clasificadora. */
export const POI_TAG_KEYS: readonly string[] = [
  'brand',
  'cuisine',
  'opening_hours',
  'wheelchair',
  'stars',
  'rooms',
];

/**
 * `amenity` → categoría. Solo los valores observados que son establecimiento o servicio.
 * El comentario de cada línea es el conteo real (nodos + ways) del corte 2026-09-20.
 */
export const AMENITY_CATEGORIES: Readonly<Record<string, PoiCategory>> = {
  // Alimentación
  restaurant: 'alimentacion', // 14 831
  fast_food: 'alimentacion', // 4 353
  cafe: 'alimentacion', // 4 153
  bar: 'alimentacion', // 2 464
  ice_cream: 'alimentacion', // 708
  pub: 'alimentacion', // 461
  food_court: 'alimentacion', // 206
  juice_bar: 'alimentacion', // 46
  biergarten: 'alimentacion', // 40
  // Financiero
  bank: 'financiero', // 3 320
  atm: 'financiero', // 1 530
  money_transfer: 'financiero', // 238
  bureau_de_change: 'financiero', // 129
  payment_centre: 'financiero', // 142
  payment_terminal: 'financiero', // 17
  // Comercio
  marketplace: 'comercio', // 811 — plaza de mercado
  // Servicios
  pharmacy: 'servicios', // 4 269 — droguería
  fuel: 'servicios', // 4 271
  place_of_worship: 'servicios', // 5 450
  police: 'servicios', // 1 745
  community_centre: 'servicios', // 1 515
  townhall: 'servicios', // 895
  bus_station: 'servicios', // 856
  veterinary: 'servicios', // 770
  post_office: 'servicios', // 722
  library: 'servicios', // 661
  car_wash: 'servicios', // 603
  social_facility: 'servicios', // 519
  childcare: 'servicios', // 389
  fire_station: 'servicios', // 362
  internet_cafe: 'servicios', // 335
  ferry_terminal: 'servicios', // 272
  taxi: 'servicios', // 240
  courthouse: 'servicios', // 233
  social_centre: 'servicios', // 119
  charging_station: 'servicios', // 160
  driving_school: 'servicios', // 74
  language_school: 'servicios', // 67
  music_school: 'servicios', // 50
  car_rental: 'servicios', // 56
  vehicle_inspection: 'servicios', // 54
  animal_boarding: 'servicios', // 56
  animal_shelter: 'servicios', // 31
  nursing_home: 'servicios', // 36
  public_bath: 'servicios', // 47
  studio: 'servicios', // 118
  conference_centre: 'servicios', // 80
  post_depot: 'servicios', // 25
  // Ocio
  nightclub: 'ocio', // 530
  theatre: 'ocio', // 391
  casino: 'ocio', // 281
  events_venue: 'ocio', // 240
  arts_centre: 'ocio', // 182
  cinema: 'ocio', // 172
  gambling: 'ocio', // 26
  dojo: 'ocio', // 33
};

/**
 * `amenity` observados que NO entran, con el motivo. Se separan de los "no mapeados" para que
 * el informe de la carga distinga "decidimos que no" de "apareció algo que no conocemos".
 */
export const AMENITY_EXCLUDED: Readonly<Record<string, string>> = {
  school: 'Educación: la fuente oficial es el MEN (ctx.school).', // 35 464
  college: 'Educación: MEN.', // 993
  university: 'Educación: MEN.', // 698
  kindergarten: 'Educación: MEN.', // 683
  hospital: 'Salud: la fuente oficial es el REPS (ctx.health_facility).', // 2 135
  clinic: 'Salud: REPS.', // 1 142
  doctors: 'Salud: REPS.', // 873
  dentist: 'Salud: REPS.', // 875
  parking: 'Infraestructura, no establecimiento.', // 9 994
  parking_space: 'Infraestructura.', // 2 058
  parking_entrance: 'Infraestructura.', // 1 045
  bicycle_parking: 'Mobiliario urbano.', // 673
  motorcycle_parking: 'Mobiliario urbano.', // 478
  bench: 'Mobiliario urbano.', // 2 785
  waste_basket: 'Mobiliario urbano.', // 1 473
  toilets: 'Mobiliario urbano.', // 937
  drinking_water: 'Mobiliario urbano.', // 318
  fountain: 'Mobiliario urbano.', // 525
  shelter: 'Mobiliario urbano.', // 1 293
  telephone: 'Mobiliario urbano.', // 275
  post_box: 'Mobiliario urbano.', // 95
  public_bookcase: 'Mobiliario urbano.', // 79
  bicycle_repair_station: 'Mobiliario urbano.', // 81
  vending_machine: 'Mobiliario urbano.', // 75
  clock: 'Mobiliario urbano.', // 29
  bbq: 'Mobiliario urbano.', // 47
  shower: 'Mobiliario urbano.', // 43
  table: 'Mobiliario urbano.', // 23
  waste_transfer_station: 'Instalación técnica.', // 298
  waste_disposal: 'Instalación técnica.', // 217
  recycling: 'Instalación técnica.', // 223
  sanitary_dump_station: 'Instalación técnica.', // 21
  loading_dock: 'Instalación técnica.', // 17
  water_point: 'Instalación técnica.', // 27
  watering_place: 'Instalación técnica.', // 15
  grave_yard: 'No es actividad económica del entorno.', // 159
  crematorium: 'No es actividad económica del entorno.', // 23
  prison: 'Equipamiento de reclusión.', // 219
  public_building: 'Etiqueta genérica sin actividad definida.', // 142
  animal_breeding: 'Actividad agropecuaria, no comercio de entorno.', // 156
  hunting_stand: 'Instalación rural.', // 54
  monastery: 'Edificación religiosa sin atención al público.', // 74
  research_institute: 'No es comercio ni servicio de barrio.', // 27
  brothel: 'Establecimiento sensible: se excluye por decisión editorial.', // 46
  stripclub: 'Establecimiento sensible: se excluye por decisión editorial.', // 17
  love_hotel: 'Establecimiento sensible: se excluye por decisión editorial.', // 154
  bicycle_rental: 'Servicio de micromovilidad sin local.', // 234
  car_pooling: 'Servicio sin local.', // 27
  reception_desk: 'Parte de otro establecimiento.', // 48
  office: 'Etiqueta genérica: el POI de oficina se clasifica con `office=*`.', // 25
  ranger_station: 'Equipamiento ambiental.', // 15
};

/**
 * `shop` → categoría. `shop=*` es comercio por definición, así que la regla es:
 * cualquier valor no listado cae en `comercio` (`SHOP_DEFAULT_CATEGORY`). Aquí solo van las
 * excepciones: los oficios de alimentación y los de servicio.
 */
export const SHOP_CATEGORIES: Readonly<Record<string, PoiCategory>> = {
  // Alimentación
  supermarket: 'alimentacion', // 5 593
  convenience: 'alimentacion', // 6 963
  bakery: 'alimentacion', // 3 978
  butcher: 'alimentacion', // 1 250
  greengrocer: 'alimentacion', // 1 020
  alcohol: 'alimentacion', // 766
  beverages: 'alimentacion', // 563
  confectionery: 'alimentacion', // 277
  pastry: 'alimentacion', // 241
  coffee: 'alimentacion', // 186
  seafood: 'alimentacion', // 176
  farm: 'alimentacion', // 161
  dairy: 'alimentacion', // 145
  deli: 'alimentacion', // 74
  cheese: 'alimentacion', // 73
  health_food: 'alimentacion', // 52
  grocery: 'alimentacion', // 44
  wine: 'alimentacion', // 40
  tea: 'alimentacion', // 22
  chocolate: 'alimentacion', // 18
  // Servicios
  car_repair: 'servicios', // 2 489
  hairdresser: 'servicios', // 2 354
  beauty: 'servicios', // 882
  travel_agency: 'servicios', // 706
  laundry: 'servicios', // 555
  copyshop: 'servicios', // 428
  motorcycle_repair: 'servicios', // 400
  tyres: 'servicios', // 334
  funeral_directors: 'servicios', // 198
  tailor: 'servicios', // 178
  dry_cleaning: 'servicios', // 62
  massage: 'servicios', // 69
  locksmith: 'servicios', // 82
  repair: 'servicios', // 95
  printing: 'servicios', // 22
  sewing: 'servicios', // 44
  shoe_repair: 'servicios', // 29
  pet_grooming: 'servicios', // 20
  storage_rental: 'servicios', // 55
  photo: 'servicios', // 141
  // Financiero
  pawnbroker: 'financiero', // 195
  money_lender: 'financiero', // 40
};

export const SHOP_DEFAULT_CATEGORY: PoiCategory = 'comercio';

/** `shop` observados que no son un establecimiento en funcionamiento. */
export const SHOP_EXCLUDED: Readonly<Record<string, string>> = {
  vacant: 'Local desocupado: no hay establecimiento.', // 103
  no: 'La etiqueta dice explícitamente que ya no es un comercio.', // 30
};

/** `tourism` → categoría. Separa alojamiento de atractivo turístico. */
export const TOURISM_CATEGORIES: Readonly<Record<string, PoiCategory>> = {
  hotel: 'alojamiento', // 5 644
  hostel: 'alojamiento', // 1 385
  guest_house: 'alojamiento', // 883
  camp_site: 'alojamiento', // 588
  alpine_hut: 'alojamiento', // 459
  apartment: 'alojamiento', // 443
  chalet: 'alojamiento', // 313
  motel: 'alojamiento', // 289
  wilderness_hut: 'alojamiento', // 141
  camp_pitch: 'alojamiento', // 34
  caravan_site: 'alojamiento', // 18
  attraction: 'turismo', // 1 181
  viewpoint: 'turismo', // 1 043
  artwork: 'turismo', // 1 021
  information: 'turismo', // 941
  museum: 'turismo', // 370
  picnic_site: 'turismo', // 162
  zoo: 'turismo', // 72
  theme_park: 'turismo', // 55
  gallery: 'turismo', // 44
  aquarium: 'turismo', // 26
  trail_riding_station: 'turismo', // 20
};

/** `leisure` → `ocio`. Fuera quedan las etiquetas de suelo natural y las de mobiliario. */
export const LEISURE_CATEGORIES: Readonly<Record<string, PoiCategory>> = {
  pitch: 'ocio', // 20 043
  park: 'ocio', // 14 356
  swimming_pool: 'ocio', // 9 639
  garden: 'ocio', // 4 804
  playground: 'ocio', // 2 639
  sports_centre: 'ocio', // 1 690
  fitness_centre: 'ocio', // 735
  fitness_station: 'ocio', // 527
  track: 'ocio', // 526
  stadium: 'ocio', // 391
  common: 'ocio', // 215
  resort: 'ocio', // 109
  water_park: 'ocio', // 97
  dog_park: 'ocio', // 88
  sports_hall: 'ocio', // 88
  recreation_ground: 'ocio', // 69
  dance: 'ocio', // 68
  adult_gaming_centre: 'ocio', // 65
  marina: 'ocio', // 64
  golf_course: 'ocio', // 62
  beach_resort: 'ocio', // 54
  amusement_arcade: 'ocio', // 42
  horse_riding: 'ocio', // 38
  sauna: 'ocio', // 30
  trampoline_park: 'ocio', // 18
};

export const LEISURE_EXCLUDED: Readonly<Record<string, string>> = {
  nature_reserve: 'Área natural: la fuente de áreas protegidas es el RUNAP.', // 353
  nature_wood: 'Cobertura natural, no equipamiento.', // 55
  bleachers: 'Parte de otro equipamiento.', // 244
  outdoor_seating: 'Parte de otro establecimiento.', // 136
  picnic_table: 'Mobiliario urbano.', // 116
  slipway: 'Infraestructura náutica.', // 33
  bird_hide: 'Infraestructura de observación.', // 32
  hot_tub: 'Parte de otro establecimiento.', // 27
  fishing: 'Zona de pesca, no establecimiento.', // 131
  proposed: 'Proyectado: todavía no existe.', // 59
};

/**
 * `office` → `servicios`, salvo las oficinas financieras. Cualquier valor de `office=*` es
 * una oficina que presta un servicio, así que el valor por omisión es `servicios`.
 */
export const OFFICE_CATEGORIES: Readonly<Record<string, PoiCategory>> = {
  financial: 'financiero', // 99
  insurance: 'financiero', // 144
};
export const OFFICE_DEFAULT_CATEGORY: PoiCategory = 'servicios';

/** `craft=*` → `servicios`: son talleres y oficios (1 912 elementos, 59 valores). */
export const CRAFT_DEFAULT_CATEGORY: PoiCategory = 'servicios';

/** `historic` → `turismo` cuando es un bien visitable. */
export const HISTORIC_CATEGORIES: Readonly<Record<string, PoiCategory>> = {
  memorial: 'turismo', // 761
  monument: 'turismo', // 665
  building: 'turismo', // 278
  archaeological_site: 'turismo', // 251
  wayside_shrine: 'turismo', // 157
  ruins: 'turismo', // 149
  tomb: 'turismo', // 71
  wayside_cross: 'turismo', // 69
  manor: 'turismo', // 64
  camino_real: 'turismo', // 38
  castle: 'turismo', // 29
};

export interface PoiClassification {
  readonly category: PoiCategory;
  /** Valor del tag de origen, tal cual (`restaurant`, `supermarket`…). */
  readonly subcategory: string;
  /** Clave que clasificó (`amenity`, `shop`…). */
  readonly key: string;
}

export type PoiVerdict =
  | { readonly kind: 'poi'; readonly poi: PoiClassification }
  /** Tenía clave clasificadora pero se excluye por decisión declarada. */
  | { readonly kind: 'excluded'; readonly tag: string; readonly reason: string }
  /** Tenía clave clasificadora con un valor que no conocemos: se reporta, no se ingiere. */
  | { readonly kind: 'unmapped'; readonly tag: string }
  /** No es un POI. */
  | { readonly kind: 'none' };

/**
 * Clasifica un elemento de OSM en una categoría del producto.
 *
 * Recorre `POI_CLASSIFIER_KEYS` en orden: la primera clave que mapea gana. Si una clave está
 * presente pero su valor está excluido o no se conoce, se sigue con la siguiente clave (un
 * `amenity=parking` con `shop=kiosk` es un kiosco), y solo si ninguna mapea se devuelve el
 * motivo de la primera para el informe.
 */
export function classifyPoi(get: (key: string) => string | undefined): PoiVerdict {
  let firstProblem: PoiVerdict | null = null;

  for (const key of POI_CLASSIFIER_KEYS) {
    const raw = get(key);
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value.length === 0) continue;
    const tag = `${key}=${value}`;

    let category: PoiCategory | undefined;
    let excludedReason: string | undefined;

    switch (key) {
      case 'amenity':
        category = AMENITY_CATEGORIES[value];
        excludedReason = AMENITY_EXCLUDED[value];
        break;
      case 'shop':
        excludedReason = SHOP_EXCLUDED[value];
        if (excludedReason === undefined) {
          category = SHOP_CATEGORIES[value] ?? SHOP_DEFAULT_CATEGORY;
        }
        break;
      case 'tourism':
        category = TOURISM_CATEGORIES[value];
        break;
      case 'leisure':
        category = LEISURE_CATEGORIES[value];
        excludedReason = LEISURE_EXCLUDED[value];
        break;
      case 'office':
        category = OFFICE_CATEGORIES[value] ?? OFFICE_DEFAULT_CATEGORY;
        break;
      case 'craft':
        category = CRAFT_DEFAULT_CATEGORY;
        break;
      case 'historic':
        category = HISTORIC_CATEGORIES[value];
        break;
      default:
        break;
    }

    if (category !== undefined) {
      return { kind: 'poi', poi: { category, subcategory: value.slice(0, 80), key } };
    }
    if (firstProblem === null) {
      firstProblem =
        excludedReason !== undefined
          ? { kind: 'excluded', tag, reason: excludedReason }
          : { kind: 'unmapped', tag };
    }
  }

  return firstProblem ?? { kind: 'none' };
}

// ─── Regla 3: etiquetas con dato personal ─────────────────────────────────────

/**
 * Claves de OSM que nunca entran a la base. La ingesta usa lista blanca, así que estos
 * patrones no son la única defensa: sirven para CONTAR y registrar lo descartado en
 * `meta.pii_discard_log` (regla 3: se registra qué se descartó, nunca el valor).
 *
 * Criterio de CLAUDE.md: «el nombre de un comercio no es dato personal; el teléfono de una
 * persona sí». Por eso `name` se conserva y `phone`, `email`, `operator` y `addr:*` no:
 *  - `phone` / `contact:phone` / `contact:mobile` / `mobile` / `fax`: en OSM colombiano son,
 *    en muchos casos, el celular del dueño de la tienda. Dato personal.
 *  - `email` / `contact:email`: idem.
 *  - `operator` y `operator:*`: suele ser una empresa, pero en el comercio de barrio es el
 *    nombre de una persona natural. No hace falta para ningún indicador → se descarta.
 *  - `addr:*`: dirección. En un negocio de vivienda es la dirección de residencia de una
 *    persona. `ctx.poi` no tiene columna de dirección y ningún indicador la usa.
 *  - `contact:instagram` / `contact:facebook` / `contact:whatsapp`: perfil personal en muchos
 *    casos; además son identificadores de una persona en otra plataforma.
 *  - `description` / `note` / `fixme` / `comment`: texto libre donde los editores anotan
 *    «preguntar a don Pedro», «casa de la señora…». Es el sitio donde la PII se cuela.
 */
export const OSM_PII_TAG_PATTERNS: readonly {
  readonly id: string;
  readonly pattern: RegExp;
  readonly reason: string;
}[] = [
  {
    id: 'phone',
    pattern: /(^|:)(phone|mobile|fax|whatsapp)(:|$)/i,
    reason: 'Teléfono, celular o fax de contacto: en el comercio pequeño es el del dueño.',
  },
  {
    id: 'email',
    pattern: /(^|:)e?-?mail(:|$)/i,
    reason: 'Correo electrónico de contacto.',
  },
  {
    id: 'operator',
    // `operator`/`owner` a secas, o con subclave de contacto. `operator:type`
    // (público/privado) y `operator:wikidata` (identificador de una entidad jurídica) NO son
    // dato personal: se descartan por la lista blanca, pero no se cuentan como PII.
    pattern: /^(operator|owner)(:(email|phone|mobile|name|short|website))?$/i,
    reason: 'Operador o propietario: puede ser el nombre de una persona natural.',
  },
  {
    id: 'address',
    // Solo los componentes que señalan una puerta concreta. `addr:city`, `addr:state`,
    // `addr:country` y `addr:postcode` son geografía, no dato personal.
    pattern: /^addr:(street|housenumber|housename|unit|full|flats|door|block_number)$/i,
    reason: 'Dirección de puerta: en negocios en vivienda es la dirección de residencia.',
  },
  {
    id: 'social',
    pattern: /^contact:/i,
    reason: 'Datos de contacto (redes, teléfono, correo) que identifican a una persona.',
  },
  {
    id: 'free_text',
    pattern: /^(description|note|notes|fixme|comment)$/i,
    reason: 'Texto libre del editor: es donde aparecen nombres y datos de personas.',
  },
];

export interface TagFilterResult {
  /** Etiquetas conservadas, ya recortadas. */
  readonly kept: Record<string, string>;
  /** Claves descartadas que coinciden con un patrón de PII, con el id de la regla. */
  readonly piiDropped: Array<{ key: string; ruleId: string }>;
}

/**
 * Aplica la lista blanca. Devuelve además qué claves de PII se descartaron, para el log.
 * Los valores se recortan a 200 caracteres: en `tags` no cabe un texto largo y un valor
 * kilométrico solo puede ser basura.
 */
export function filterTags(
  tags: Record<string, string>,
  whitelist: readonly string[],
): TagFilterResult {
  const kept: Record<string, string> = {};
  const piiDropped: Array<{ key: string; ruleId: string }> = [];
  for (const [key, value] of Object.entries(tags)) {
    if (whitelist.includes(key)) {
      if (value.length > 0) kept[key] = value.slice(0, 200);
      continue;
    }
    for (const rule of OSM_PII_TAG_PATTERNS) {
      if (rule.pattern.test(key)) {
        piiDropped.push({ key, ruleId: rule.id });
        break;
      }
    }
  }
  return { kept, piiDropped };
}

/**
 * Segunda defensa sobre el NOMBRE del establecimiento: el nombre de un comercio es dato
 * público, pero si alguien escribió un teléfono o un correo dentro de `name`, eso no entra.
 * Devuelve `null` cuando el nombre hay que descartar.
 */
const NAME_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const NAME_PHONE =
  /(?<![\d])(?:\+?57[\s.-]?)?(?:\(?(?:60[1-8]|3\d{2})\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?![\d])|(?<![\d])3\d{9}(?![\d])/;

export function safeName(name: string | undefined): {
  name: string | null;
  piiRuleId: string | null;
} {
  if (name === undefined) return { name: null, piiRuleId: null };
  const trimmed = name.trim();
  if (trimmed.length === 0) return { name: null, piiRuleId: null };
  if (NAME_EMAIL.test(trimmed)) return { name: null, piiRuleId: 'email' };
  if (NAME_PHONE.test(trimmed)) return { name: null, piiRuleId: 'phone' };
  return { name: trimmed.slice(0, 250), piiRuleId: null };
}

// ─── Declaración de los dos datasets ──────────────────────────────────────────

/**
 * Metadatos para `meta.dataset`. Copian lo declarado en `etl/config/datasets/osm.ts`
 * (`@terracolombia/etl-config`), que es la fuente de verdad del catálogo; se repiten aquí
 * porque `@terracolombia/db` no depende de ese paquete, igual que en `admin-boundaries.ts`.
 *
 * `shareAlike: true` es obligatorio: la ODbL 1.0 es una licencia con cláusula de compartir
 * igual sobre bases derivadas (regla 4).
 */
export const OSM_EXTRACT_URL =
  'https://download.geofabrik.de/south-america/colombia-latest.osm.pbf';
/**
 * Identificador de la licencia tal como lo guarda `meta.dataset.license`.
 *
 * Tiene que ser esta cadena exacta: `isShareAlike()` de `@terracolombia/shared` compara la
 * licencia con los ids de `LICENSES` normalizando separadores, así que `ODbL 1.0` empareja
 * con `ODbL-1.0` y `ODbL 1.0 (Open Database License)` NO. Con la forma larga, los informes
 * imprimían «ShareAlike: No» para OpenStreetMap, que es exactamente lo contrario de lo que
 * dice la licencia (regla 4 y PLAN.md §2).
 */
export const OSM_LICENSE = 'ODbL 1.0';
export const OSM_ATTRIBUTION = '© colaboradores de OpenStreetMap, ODbL 1.0';

export const OSM_ROADS_DATASET = {
  id: 'osm-vias-colombia',
  source: 'OSM',
  name: 'Red vial de Colombia (extracto Geofabrik)',
  description:
    'Ways con `highway=*` de la red vehicular del extracto de Colombia de Geofabrik, ' +
    'cargados como MultiLineString en EPSG:4326. Clase = valor de `highway` sin traducir; ' +
    '`is_paved` se deriva solo de `surface`.',
  license: OSM_LICENSE,
  attribution: OSM_ATTRIBUTION,
  url: OSM_EXTRACT_URL,
  frequency: 'diaria',
  connector: 'osm',
  format: 'pbf',
  sourceSrid: 4326,
  targetTable: 'ctx.road',
  shareAlike: true,
  notes:
    'ODbL 1.0: compartir-igual sobre bases derivadas. Hay que mantener OSM separado de los ' +
    'datos del IGAC en la base y en las exportaciones, y citar «© colaboradores de ' +
    'OpenStreetMap, ODbL 1.0» en mapa, ficha, informe y API.',
} as const;

export const OSM_POIS_DATASET = {
  id: 'osm-poi-colombia',
  source: 'OSM',
  name: 'Puntos de interés de Colombia (extracto Geofabrik)',
  description:
    'Nodos y ways con `amenity`, `shop`, `tourism`, `leisure`, `office`, `craft` o ' +
    '`historic` del extracto de Colombia, normalizados a las categorías del producto ' +
    '(comercio, alimentación, servicios, financiero, ocio, turismo, alojamiento). ' +
    'Educación y salud NO se ingieren aquí: sus fuentes oficiales son el MEN y el REPS.',
  license: OSM_LICENSE,
  attribution: OSM_ATTRIBUTION,
  url: OSM_EXTRACT_URL,
  frequency: 'diaria',
  connector: 'osm',
  format: 'pbf',
  sourceSrid: 4326,
  targetTable: 'ctx.poi',
  shareAlike: true,
  notes:
    'La cobertura de POI en OSM es muy desigual: completa en ciudades grandes y escasa en ' +
    'zonas rurales. La UI debe advertirlo (regla 6). ODbL 1.0 con compartir-igual.',
} as const;
