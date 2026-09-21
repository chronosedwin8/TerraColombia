/**
 * Regla 4 de CLAUDE.md: «Toda cifra mostrada lleva procedencia: fuente, dataset, fecha de corte
 * y licencia. Sin procedencia no se muestra.»
 *
 * Estas pruebas verifican que `ProvenanceFooter` **oculta su contenido** cuando no hay fuentes
 * y que, cuando las hay, reproduce la atribución obligatoria del IGAC.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { buildMeta, type ResponseMeta, type SourceRef } from '@terracolombia/shared';
import ProvenanceFooter from './ProvenanceFooter.vue';

function igacSource(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    datasetId: 'igac.base_catastral',
    source: 'IGAC',
    name: 'Base Catastral Pública',
    cutDate: '2025-03-01',
    license: 'CC BY-SA 4.0',
    attribution: 'Fuente: IGAC, Base Catastral, corte 2025-03, CC BY-SA 4.0',
    url: 'https://datos.gov.co/',
    synthetic: false,
    ...overrides,
  };
}

const CIFRA = '1.234 m²';

describe('ProvenanceFooter', () => {
  it('NO renderiza la cifra cuando no hay fuentes', () => {
    const wrapper = mount(ProvenanceFooter, {
      props: { sources: [] },
      slots: { default: `<p>${CIFRA}</p>` },
    });

    expect(wrapper.text()).not.toContain(CIFRA);
    expect(wrapper.find('[data-testid="provenance-missing"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="provenance-footer"]').exists()).toBe(false);
  });

  it('tampoco la renderiza cuando la meta llega con sources vacío', () => {
    const meta: ResponseMeta = buildMeta([]);
    const wrapper = mount(ProvenanceFooter, {
      props: { meta },
      slots: { default: `<p>${CIFRA}</p>` },
    });

    expect(wrapper.text()).not.toContain(CIFRA);
    expect(wrapper.find('[data-testid="provenance-missing"]').exists()).toBe(true);
  });

  it('explica por qué no se muestra, en lugar de dejar un hueco', () => {
    const wrapper = mount(ProvenanceFooter, { props: { sources: [] } });
    const text = wrapper.get('[data-testid="provenance-missing"]').text();
    expect(text).toContain('No disponible');
    expect(text.toLowerCase()).toContain('fuente');
  });

  it('renderiza la cifra y el pie de fuentes cuando hay procedencia', () => {
    const wrapper = mount(ProvenanceFooter, {
      props: { sources: [igacSource()] },
      slots: { default: `<p>${CIFRA}</p>` },
    });

    expect(wrapper.text()).toContain(CIFRA);
    expect(wrapper.find('[data-testid="provenance-sources"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="source-badge"]')).toHaveLength(1);
  });

  it('reproduce literalmente la atribución obligatoria del IGAC', () => {
    const source = igacSource();
    const wrapper = mount(ProvenanceFooter, { props: { sources: [source] } });
    expect(wrapper.get('[data-testid="igac-attribution"]').text()).toBe(source.attribution);
  });

  it('no inventa la atribución del IGAC para fuentes que no lo son', () => {
    const dane = igacSource({
      datasetId: 'dane.mgn',
      source: 'DANE',
      name: 'Marco Geoestadístico Nacional',
      license: 'CC BY 4.0',
      attribution: 'Fuente: DANE, MGN 2018',
    });
    const wrapper = mount(ProvenanceFooter, { props: { sources: [dane] } });
    expect(wrapper.find('[data-testid="igac-attribution"]').exists()).toBe(false);
  });

  it('muestra los avisos de la respuesta junto a las fuentes', () => {
    const meta = buildMeta([igacSource()], { warnings: ['Cobertura parcial en zona rural'] });
    const wrapper = mount(ProvenanceFooter, { props: { meta } });
    expect(wrapper.text()).toContain('Cobertura parcial en zona rural');
  });

  it('marca como demostración las fuentes sintéticas', () => {
    const wrapper = mount(ProvenanceFooter, {
      props: { sources: [igacSource({ synthetic: true })] },
    });
    expect(wrapper.get('[data-testid="source-badge"]').text().toLowerCase()).toContain('demo');
  });
});
