/**
 * «Toda vista debe ser compartible» (PLAN.md §10.3). `useUrlState` es la pieza que lo garantiza,
 * así que se prueba en dos niveles: el núcleo puro de codecs y la integración con vue-router.
 */
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import {
  bboxCodec,
  boolCodec,
  decodeState,
  encodeState,
  enumCodec,
  fromBase64Url,
  intCodec,
  jsonCodec,
  listCodec,
  nullable,
  numberCodec,
  parseUrlState,
  serializeUrlState,
  stringCodec,
  toBase64Url,
  useUrlState,
  weightsCodec,
  type UrlParamDefs,
} from './useUrlState';

// ─── Codecs ───────────────────────────────────────────────────────────────────

describe('codecs de useUrlState', () => {
  it('stringCodec omite el texto vacío', () => {
    expect(stringCodec.encode('')).toBeNull();
    expect(stringCodec.encode('08001')).toBe('08001');
    expect(stringCodec.decode('')).toBeNull();
  });

  it('numberCodec redondea a los decimales pedidos', () => {
    expect(numberCodec(2).encode(12.3456)).toBe('12.35');
    expect(numberCodec(2).decode('12.35')).toBe(12.35);
    expect(numberCodec(2).decode('no-es-un-numero')).toBeNull();
  });

  it('intCodec rechaza los decimales al codificar', () => {
    expect(intCodec.encode(8)).toBe('8');
    expect(intCodec.encode(8.5)).toBeNull();
    expect(intCodec.decode('9')).toBe(9);
  });

  it('boolCodec entiende 1/0 y true/false', () => {
    expect(boolCodec.encode(true)).toBe('1');
    expect(boolCodec.decode('1')).toBe(true);
    expect(boolCodec.decode('false')).toBe(false);
    expect(boolCodec.decode('quizá')).toBeNull();
  });

  it('bboxCodec va y vuelve sin perder precisión útil', () => {
    const bbox: [number, number, number, number] = [-74.0821, 4.6097, -74.0431, 4.6512];
    const encoded = bboxCodec.encode(bbox);
    expect(encoded).toBe('-74.0821,4.6097,-74.0431,4.6512');
    expect(bboxCodec.decode(encoded ?? '')).toEqual(bbox);
  });

  it('bboxCodec descarta un bbox mal formado en lugar de romper la vista', () => {
    expect(bboxCodec.decode('1,2,3')).toBeNull();
    expect(bboxCodec.decode('a,b,c,d')).toBeNull();
  });

  it('listCodec separa por comas y descarta vacíos', () => {
    expect(listCodec.encode(['parcel', 'h3'])).toBe('parcel,h3');
    expect(listCodec.decode('parcel, ,h3')).toEqual(['parcel', 'h3']);
    expect(listCodec.decode('')).toBeNull();
    expect(listCodec.encode([])).toBeNull();
  });

  it('enumCodec rechaza valores fuera del conjunto', () => {
    const codec = enumCodec(['urbano', 'rural'] as const);
    expect(codec.decode('urbano')).toBe('urbano');
    expect(codec.decode('marciano')).toBeNull();
  });

  it('weightsCodec usa el formato clave:valor legible y acota a 0–1', () => {
    expect(weightsCodec.encode({ vias: 0.2, poblacion: 0.4 })).toBe('poblacion:0.4,vias:0.2');
    expect(weightsCodec.decode('poblacion:0.4,vias:0.2')).toEqual({ poblacion: 0.4, vias: 0.2 });
    expect(weightsCodec.decode('poblacion:5')).toEqual({ poblacion: 1 });
    expect(weightsCodec.decode('basura')).toBeNull();
  });

  it('jsonCodec sobrevive a un viaje por base64url', () => {
    const codec = jsonCodec<{ scope: { municipality: string }; limit: number }>();
    const value = { scope: { municipality: '08573' }, limit: 100 };
    const encoded = codec.encode(value);
    expect(encoded).not.toBeNull();
    // base64url: sin +, / ni =
    expect(encoded).not.toMatch(/[+/=]/);
    expect(codec.decode(encoded ?? '')).toEqual(value);
  });

  it('jsonCodec devuelve null ante un texto corrupto, no lanza', () => {
    expect(jsonCodec<unknown>().decode('esto-no-es-base64-de-json')).toBeNull();
  });

  it('base64url conserva las tildes y la ñ', () => {
    const text = 'zona homogénea, año 2025, Chocó';
    expect(fromBase64Url(toBase64Url(text))).toBe(text);
  });

  it('nullable trata null como ausencia del parámetro', () => {
    const codec = nullable(bboxCodec);
    expect(codec.encode(null)).toBeNull();
    expect(codec.decode('-74,4,-73,5')).toEqual([-74, 4, -73, 5]);
  });
});

// ─── Núcleo puro ──────────────────────────────────────────────────────────────

const DEFS = {
  zoom: { default: 5, codec: numberCodec(2) },
  capas: { default: ['municipality'] as string[], codec: listCodec },
  corte: { default: '', codec: stringCodec },
  bbox: { default: null as [number, number, number, number] | null, codec: nullable(bboxCodec) },
  pesos: { default: {} as Record<string, number>, codec: weightsCodec },
} satisfies UrlParamDefs;

describe('encodeState / decodeState', () => {
  it('omite los valores iguales al de por omisión para que los enlaces sean cortos', () => {
    const encoded = encodeState(DEFS, {
      zoom: 5,
      capas: ['municipality'],
      corte: '',
      bbox: null,
      pesos: {},
    });
    expect(encoded).toEqual({});
  });

  it('escribe solo lo que cambió', () => {
    const encoded = encodeState(DEFS, {
      zoom: 14,
      capas: ['parcel', 'school'],
      corte: '2025-03-01',
      bbox: null,
      pesos: {},
    });
    expect(encoded).toEqual({
      zoom: '14',
      capas: 'parcel,school',
      corte: '2025-03-01',
    });
  });

  it('completa con los valores por omisión lo que falta en la URL', () => {
    const state = decodeState(DEFS, { zoom: '12' });
    expect(state.zoom).toBe(12);
    expect(state.capas).toEqual(['municipality']);
    expect(state.corte).toBe('');
    expect(state.bbox).toBeNull();
  });

  it('cae al valor por omisión cuando el parámetro es inválido, sin romperse', () => {
    const state = decodeState(DEFS, { zoom: 'catorce', bbox: 'no-es-un-bbox' });
    expect(state.zoom).toBe(5);
    expect(state.bbox).toBeNull();
  });

  it('toma el primer valor cuando un parámetro llega repetido', () => {
    const state = decodeState(DEFS, { zoom: ['12', '18'] });
    expect(state.zoom).toBe(12);
  });

  it('serializeUrlState y parseUrlState son inversos', () => {
    const original = {
      zoom: 16.25,
      capas: ['parcel', 'building'],
      corte: '2025-07-01',
      bbox: [-74.1, 4.6, -74.0, 4.7] as [number, number, number, number],
      pesos: { poblacion: 0.6, vias: 0.4 },
    };
    const qs = serializeUrlState(DEFS, original);
    expect(qs.startsWith('?')).toBe(true);
    expect(parseUrlState(DEFS, qs)).toEqual(original);
  });

  it('serializa vacío cuando todo está en su valor por omisión', () => {
    expect(
      serializeUrlState(DEFS, { zoom: 5, capas: ['municipality'], corte: '', bbox: null, pesos: {} }),
    ).toBe('');
  });

  it('ordena los parámetros para que dos estados iguales den el mismo enlace', () => {
    const a = serializeUrlState(DEFS, {
      zoom: 10,
      capas: ['parcel'],
      corte: '2025-01-01',
      bbox: null,
      pesos: {},
    });
    const b = serializeUrlState(DEFS, {
      corte: '2025-01-01',
      capas: ['parcel'],
      zoom: 10,
      pesos: {},
      bbox: null,
    });
    expect(a).toBe(b);
  });

  it('respeta el nombre de parámetro personalizado', () => {
    const defs = { municipio: { default: '', codec: stringCodec, key: 'muni' } } satisfies UrlParamDefs;
    expect(encodeState(defs, { municipio: '08001' })).toEqual({ muni: '08001' });
    expect(decodeState(defs, { muni: '08001' }).municipio).toBe('08001');
  });
});

// ─── Integración con vue-router ───────────────────────────────────────────────

function mountWithRouter(initialUrl: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/predio/:npn', component: { template: '<div />' } },
    ],
  });

  const Harness = defineComponent({
    setup() {
      // `debounceMs: 0` para no depender de temporizadores en la prueba.
      const api = useUrlState(DEFS, { debounceMs: 0 });
      return { api };
    },
    render() {
      return h('div');
    },
  });

  const wrapper = mount(Harness, { global: { plugins: [router] } });
  return { router, wrapper, ready: router.push(initialUrl).then(() => router.isReady()) };
}

describe('useUrlState con vue-router', () => {
  it('lee el estado inicial de la query', async () => {
    const { wrapper, ready } = mountWithRouter('/?zoom=13&capas=parcel,school');
    await ready;
    await flushPromises();

    const api = wrapper.vm.api;
    expect(api.state.zoom).toBe(13);
    expect(api.state.capas).toEqual(['parcel', 'school']);
  });

  it('escribe en la URL cuando cambia el estado', async () => {
    const { router, wrapper, ready } = mountWithRouter('/');
    await ready;
    await flushPromises();

    wrapper.vm.api.state.zoom = 17;
    await nextTick();
    // El `replace` se programa con setTimeout(0).
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushPromises();

    expect(router.currentRoute.value.query['zoom']).toBe('17');
  });

  it('conserva los parámetros que no pertenecen a sus definiciones', async () => {
    const { router, wrapper, ready } = mountWithRouter('/?utm_source=correo&zoom=8');
    await ready;
    await flushPromises();

    wrapper.vm.api.state.corte = '2025-05-01';
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushPromises();

    expect(router.currentRoute.value.query['utm_source']).toBe('correo');
    expect(router.currentRoute.value.query['corte']).toBe('2025-05-01');
  });

  it('reset devuelve todo a los valores por omisión', async () => {
    const { wrapper, ready } = mountWithRouter('/?zoom=18&corte=2025-01-01');
    await ready;
    await flushPromises();

    const api = wrapper.vm.api;
    api.reset();
    expect(api.state.zoom).toBe(5);
    expect(api.state.corte).toBe('');
  });

  it('patch aplica varios cambios de una vez', async () => {
    const { wrapper, ready } = mountWithRouter('/');
    await ready;
    await flushPromises();

    const api = wrapper.vm.api;
    api.patch({ zoom: 15, capas: ['parcel'] });
    expect(api.state.zoom).toBe(15);
    expect(api.state.capas).toEqual(['parcel']);
  });

  it('shareUrl incluye la ruta y solo los parámetros que cambiaron', async () => {
    const { wrapper, ready } = mountWithRouter('/?zoom=11');
    await ready;
    await flushPromises();

    const url = wrapper.vm.api.shareUrl();
    expect(url).toContain('/');
    expect(url).toContain('zoom=11');
    expect(url).not.toContain('capas=');
  });
});
