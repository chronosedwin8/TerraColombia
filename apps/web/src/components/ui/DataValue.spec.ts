/**
 * `DataValue` es el único camino por el que una cifra llega a la pantalla, así que concentra
 * tres reglas del producto:
 *  - regla 4: sin procedencia no se muestra la cifra;
 *  - regla 2: lo que no existe se dice «No disponible», nunca se rellena con un cero;
 *  - regla 5: el avalúo catastral arrastra su advertencia.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { MESSAGES, NOT_AVAILABLE, type SourceRef } from '@terracolombia/shared';
import DataValue from './DataValue.vue';

const SOURCES: SourceRef[] = [
  {
    datasetId: 'igac.base_catastral',
    source: 'IGAC',
    name: 'Base Catastral Pública',
    cutDate: '2025-03-01',
    license: 'CC BY-SA 4.0',
    attribution: 'Fuente: IGAC, Base Catastral, corte 2025-03, CC BY-SA 4.0',
    url: null,
    synthetic: false,
  },
];

describe('DataValue', () => {
  it('NO muestra la cifra cuando no hay fuentes', () => {
    const wrapper = mount(DataValue, {
      props: { label: 'Área del terreno', value: 1234, format: 'area', sources: [] },
    });

    expect(wrapper.find('[data-testid="data-value-no-source"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="data-value-text"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('1.234');
  });

  it('muestra la cifra formateada cuando hay fuentes', () => {
    const wrapper = mount(DataValue, {
      props: { label: 'Área del terreno', value: 1234, format: 'area', sources: SOURCES },
    });

    const text = wrapper.get('[data-testid="data-value-text"]').text();
    expect(text).toContain('m²');
    expect(wrapper.find('[data-testid="data-value-no-source"]').exists()).toBe(false);
  });

  it('dice «No disponible» cuando el valor es null, nunca un cero inventado', () => {
    const wrapper = mount(DataValue, {
      props: { label: 'Avalúo catastral', value: null, format: 'currency', sources: SOURCES },
    });

    const text = wrapper.get('[data-testid="data-value-text"]').text();
    expect(text).toBe(MESSAGES.common.notAvailable);
    expect(text).not.toContain('0');
  });

  it('trata el centinela NO_DISPONIBLE igual que un null', () => {
    const wrapper = mount(DataValue, {
      props: { label: 'Destino económico', value: NOT_AVAILABLE, sources: SOURCES },
    });
    expect(wrapper.get('[data-testid="data-value-text"]').text()).toBe(
      MESSAGES.common.notAvailable,
    );
  });

  it('distingue el cero real del dato ausente', () => {
    const wrapper = mount(DataValue, {
      props: { label: 'Área construida', value: 0, format: 'area', sources: SOURCES },
    });
    // Un 0 que viene de la fuente es un dato: se muestra, no se oculta.
    expect(wrapper.get('[data-testid="data-value-text"]').text()).not.toBe(
      MESSAGES.common.notAvailable,
    );
  });

  it('añade la advertencia de avalúo catastral cuando hay un valor monetario', () => {
    const wrapper = mount(DataValue, {
      props: {
        label: 'Avalúo catastral',
        value: 85_000_000,
        format: 'currency',
        sources: SOURCES,
      },
    });
    expect(wrapper.get('[data-testid="cadastral-warning"]').text()).toBe(
      MESSAGES.parcel.cadastralValueWarning,
    );
  });

  it('no muestra la advertencia de avalúo cuando no hay cifra que advertir', () => {
    const wrapper = mount(DataValue, {
      props: { label: 'Avalúo catastral', value: null, format: 'currency', sources: SOURCES },
    });
    expect(wrapper.find('[data-testid="cadastral-warning"]').exists()).toBe(false);
  });

  it('emite el término de glosario al pulsar el icono de ayuda', async () => {
    const wrapper = mount(DataValue, {
      props: {
        label: 'Destino económico',
        value: 'Lote urbanizable',
        sources: SOURCES,
        glossaryId: 'destino_economico',
      },
    });

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('glossary')).toEqual([['destino_economico']]);
  });

  it('siempre renderiza la etiqueta, incluso sin procedencia', () => {
    const wrapper = mount(DataValue, {
      props: { label: 'Pendiente media', value: 12, sources: [] },
    });
    expect(wrapper.text()).toContain('Pendiente media');
  });
});
