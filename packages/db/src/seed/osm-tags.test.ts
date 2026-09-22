import { describe, expect, it } from 'vitest';
import { isShareAlike } from '@terracolombia/shared';
import {
  classifyPoi,
  filterTags,
  isPavedSurface,
  parseLanes,
  parseMaxspeedKmh,
  roadFromTags,
  safeName,
  OSM_POIS_DATASET,
  OSM_ROADS_DATASET,
  POI_TAG_KEYS,
  ROAD_TAG_KEYS,
} from './osm-tags.js';

/** Acceso a etiquetas como lo hace el lector de PBF. */
const tags = (t: Record<string, string>) => (k: string) => t[k];

describe('roadFromTags', () => {
  it('acepta las clases de la red vehicular y conserva el valor de OSM sin traducir', () => {
    const r = roadFromTags(tags({ highway: 'trunk', name: 'Ruta 45', surface: 'asphalt' }));
    expect(r?.klass).toBe('trunk');
    expect(r?.name).toBe('Ruta 45');
    expect(r?.isPaved).toBe(true);
  });

  it('descarta lo que no es red vehicular', () => {
    expect(roadFromTags(tags({ highway: 'footway' }))).toBeNull();
    expect(roadFromTags(tags({ highway: 'steps' }))).toBeNull();
    // Basura de tecleo observada en el extracto de Colombia.
    expect(roadFromTags(tags({ highway: '10.8' }))).toBeNull();
    expect(roadFromTags(tags({ highway: 'puente_de_madera' }))).toBeNull();
    expect(roadFromTags(tags({}))).toBeNull();
  });

  it('incluye la red rural: track es acceso a predio', () => {
    expect(roadFromTags(tags({ highway: 'track' }))?.klass).toBe('track');
  });
});

describe('isPavedSurface', () => {
  it('no inventa pavimento cuando la vía no trae surface', () => {
    // Regla 2: sin etiqueta no hay dato. Afecta a dist_paved_road_m y road_access_score.
    expect(isPavedSurface(undefined)).toBeNull();
    expect(isPavedSurface('')).toBeNull();
  });

  it('reconoce los valores pavimentados y sin pavimentar observados', () => {
    expect(isPavedSurface('asphalt')).toBe(true);
    expect(isPavedSurface('concrete:plates')).toBe(true);
    expect(isPavedSurface('unpaved')).toBe(false);
    expect(isPavedSurface('gravel')).toBe(false);
  });

  it('entiende las variantes en español que trae el dato colombiano', () => {
    expect(isPavedSurface('asfalto')).toBe(true);
    expect(isPavedSurface('afirmado')).toBe(false);
    expect(isPavedSurface('destapada')).toBe(false);
  });

  it('parte los valores compuestos y deja NULL lo desconocido', () => {
    expect(isPavedSurface('dirt/sand')).toBe(false);
    expect(isPavedSurface('asfalto++')).toBe(true);
    expect(isPavedSurface('Esri Wayback 2024')).toBeNull();
  });
});

describe('parseLanes y parseMaxspeedKmh', () => {
  it('lee los enteros creíbles y descarta el resto', () => {
    expect(parseLanes('2')).toBe(2);
    expect(parseLanes('2;1')).toBe(2);
    expect(parseLanes('0')).toBeNull();
    expect(parseLanes('sí')).toBeNull();
    expect(parseLanes(undefined)).toBeNull();
  });

  it('convierte mph y rechaza los valores no numéricos de maxspeed', () => {
    expect(parseMaxspeedKmh('60')).toBe(60);
    expect(parseMaxspeedKmh('60 km/h')).toBe(60);
    expect(parseMaxspeedKmh('30 mph')).toBe(48);
    expect(parseMaxspeedKmh('none')).toBeNull();
    expect(parseMaxspeedKmh('CO:urban')).toBeNull();
    expect(parseMaxspeedKmh('999')).toBeNull();
  });
});

describe('classifyPoi', () => {
  it('mapea a las categorías que consume el motor', () => {
    expect(classifyPoi(tags({ amenity: 'restaurant' }))).toMatchObject({
      kind: 'poi',
      poi: { category: 'alimentacion', subcategory: 'restaurant', key: 'amenity' },
    });
    expect(classifyPoi(tags({ amenity: 'bank' }))).toMatchObject({
      poi: { category: 'financiero' },
    });
    expect(classifyPoi(tags({ shop: 'supermarket' }))).toMatchObject({
      poi: { category: 'alimentacion' },
    });
    expect(classifyPoi(tags({ shop: 'hairdresser' }))).toMatchObject({
      poi: { category: 'servicios' },
    });
    expect(classifyPoi(tags({ tourism: 'hotel' }))).toMatchObject({
      poi: { category: 'alojamiento' },
    });
    expect(classifyPoi(tags({ tourism: 'viewpoint' }))).toMatchObject({
      poi: { category: 'turismo' },
    });
    expect(classifyPoi(tags({ leisure: 'park' }))).toMatchObject({ poi: { category: 'ocio' } });
  });

  it('cualquier shop desconocido es comercio: shop=* es comercio por definición', () => {
    expect(classifyPoi(tags({ shop: 'radiotechnics' }))).toMatchObject({
      poi: { category: 'comercio', subcategory: 'radiotechnics' },
    });
  });

  it('educación y salud no entran: sus fuentes son el MEN y el REPS', () => {
    expect(classifyPoi(tags({ amenity: 'school' })).kind).toBe('excluded');
    expect(classifyPoi(tags({ amenity: 'hospital' })).kind).toBe('excluded');
    // `healthcare` no clasifica en absoluto.
    expect(classifyPoi(tags({ healthcare: 'pharmacy' })).kind).toBe('none');
  });

  it('el mobiliario urbano y los locales vacíos no son POIs', () => {
    expect(classifyPoi(tags({ amenity: 'bench' })).kind).toBe('excluded');
    expect(classifyPoi(tags({ shop: 'vacant' })).kind).toBe('excluded');
  });

  it('si la primera clave no mapea, prueba la siguiente', () => {
    // Caso real: una estación de servicio con tienda dentro dibujada como un solo nodo.
    expect(classifyPoi(tags({ amenity: 'parking', shop: 'kiosk' }))).toMatchObject({
      poi: { category: 'comercio', key: 'shop' },
    });
  });

  it('reporta como no mapeado lo que no conocemos, en vez de colarlo en una categoría', () => {
    const v = classifyPoi(tags({ amenity: 'etiqueta_que_no_existe' }));
    expect(v.kind).toBe('unmapped');
    if (v.kind === 'unmapped') expect(v.tag).toBe('amenity=etiqueta_que_no_existe');
  });

  it('un elemento sin clave clasificadora no es POI', () => {
    expect(classifyPoi(tags({ building: 'yes', name: 'Casa' })).kind).toBe('none');
  });
});

describe('filterTags (regla 3)', () => {
  it('deja pasar solo la lista blanca y cuenta lo descartado por dato personal', () => {
    const res = filterTags(
      {
        amenity: 'restaurant',
        cuisine: 'colombian',
        name: 'La Esquina',
        phone: '+57 300 000 0000',
        'contact:phone': '3001112222',
        'contact:instagram': '@laesquina',
        email: 'dueno@ejemplo.com',
        operator: 'María Pérez',
        'addr:street': 'Calle 10',
        description: 'Preguntar por don Pedro',
      },
      [...POI_TAG_KEYS, 'amenity'],
    );
    expect(res.kept).toEqual({ amenity: 'restaurant', cuisine: 'colombian' });
    expect(res.kept.phone).toBeUndefined();
    expect(res.kept['addr:street']).toBeUndefined();
    const dropped = res.piiDropped.map((d) => d.key).sort();
    expect(dropped).toEqual([
      'addr:street',
      'contact:instagram',
      'contact:phone',
      'description',
      'email',
      'operator',
      'phone',
    ]);
  });

  it('las etiquetas de vía conservadas son las declaradas', () => {
    const res = filterTags(
      { highway: 'primary', surface: 'asphalt', lanes: '2', operator: 'INVIAS', phone: '018000' },
      ROAD_TAG_KEYS,
    );
    expect(Object.keys(res.kept).sort()).toEqual(['highway', 'lanes', 'surface']);
    expect(res.piiDropped.map((d) => d.ruleId).sort()).toEqual(['operator', 'phone']);
  });
});

describe('safeName', () => {
  it('conserva el rótulo comercial: no es dato personal', () => {
    expect(safeName('Panadería Doña Luz').name).toBe('Panadería Doña Luz');
  });

  it('descarta el nombre si alguien metió un teléfono o un correo dentro', () => {
    expect(safeName('Tienda 3151234567').name).toBeNull();
    expect(safeName('Tienda 3151234567').piiRuleId).toBe('phone');
    expect(safeName('pedidos@tienda.com').name).toBeNull();
    expect(safeName(undefined).name).toBeNull();
  });
});

describe('licencia y atribución (regla 4)', () => {
  it('los dos datasets declaran ODbL con compartir-igual', () => {
    for (const d of [OSM_ROADS_DATASET, OSM_POIS_DATASET]) {
      expect(d.license).toBe('ODbL 1.0');
      expect(d.shareAlike).toBe(true);
      expect(d.attribution).toBe('© colaboradores de OpenStreetMap, ODbL 1.0');
    }
  });

  it('la cadena de licencia es la que `isShareAlike` reconoce', () => {
    // Regresión de un fallo real: con `ODbL 1.0 (Open Database License)` la comparación de
    // `@terracolombia/shared` fallaba y los informes imprimían «ShareAlike: No» para OSM.
    for (const d of [OSM_ROADS_DATASET, OSM_POIS_DATASET]) {
      expect(isShareAlike(d.license)).toBe(true);
    }
    expect(isShareAlike('ODbL 1.0 (Open Database License)')).toBe(false);
  });
});
