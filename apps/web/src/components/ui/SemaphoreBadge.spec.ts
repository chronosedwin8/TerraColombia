/**
 * El semáforo NUNCA puede comunicar solo con color (PLAN.md §10.1, WCAG AA 1.4.1).
 * Estas pruebas son la red de seguridad de esa regla: si alguien "simplifica" el componente
 * dejando solo el punto de color, fallan.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { MESSAGES } from '@terracolombia/shared';
import SemaphoreBadge from './SemaphoreBadge.vue';
import type { SemaphoreStatus } from './types';

const ALL_STATUSES: SemaphoreStatus[] = [
  'ok',
  'caution',
  'blocker',
  'unknown',
  'favorable',
  'condicionado',
  'desfavorable',
  'sin_datos',
];

describe('SemaphoreBadge', () => {
  it('renderiza texto visible para todos los estados, no solo color', () => {
    for (const status of ALL_STATUSES) {
      const wrapper = mount(SemaphoreBadge, { props: { status } });
      const text = wrapper.get('[data-testid="semaphore-text"]').text();
      expect(text.length, `el estado ${status} no renderizó texto`).toBeGreaterThan(0);
      wrapper.unmount();
    }
  });

  it('usa los rótulos de MESSAGES para los veredictos de aptitud', () => {
    const cases: Array<[SemaphoreStatus, string]> = [
      ['favorable', MESSAGES.suitability.favorable],
      ['condicionado', MESSAGES.suitability.condicionado],
      ['desfavorable', MESSAGES.suitability.desfavorable],
      ['sin_datos', MESSAGES.suitability.sin_datos],
    ];
    for (const [status, expected] of cases) {
      const wrapper = mount(SemaphoreBadge, { props: { status } });
      expect(wrapper.get('[data-testid="semaphore-text"]').text()).toBe(expected);
      wrapper.unmount();
    }
  });

  it('respeta el rótulo propio cuando se le pasa uno', () => {
    const wrapper = mount(SemaphoreBadge, {
      props: { status: 'blocker', label: 'Dentro de área protegida' },
    });
    expect(wrapper.get('[data-testid="semaphore-text"]').text()).toBe('Dentro de área protegida');
  });

  it('anuncia el estado al lector de pantalla además del rótulo visible', () => {
    const wrapper = mount(SemaphoreBadge, { props: { status: 'blocker', label: 'Pendiente alta' } });
    const srText = wrapper.get('.sr-only').text();
    expect(srText).toContain('desfavorable');
    expect(srText).toContain('Pendiente alta');
  });

  it('dibuja un icono con forma distinta por estado, para no depender del color', () => {
    const shapes = new Set<string>();
    for (const status of ['ok', 'caution', 'blocker', 'unknown'] as const) {
      const wrapper = mount(SemaphoreBadge, { props: { status } });
      shapes.add(wrapper.get('svg').html());
      wrapper.unmount();
    }
    // Cuatro estados, cuatro dibujos distintos.
    expect(shapes.size).toBe(4);
  });

  it('normaliza los alias de veredicto al estado canónico', () => {
    expect(mount(SemaphoreBadge, { props: { status: 'favorable' } }).attributes('data-status')).toBe('ok');
    expect(mount(SemaphoreBadge, { props: { status: 'condicionado' } }).attributes('data-status')).toBe(
      'caution',
    );
    expect(
      mount(SemaphoreBadge, { props: { status: 'desfavorable' } }).attributes('data-status'),
    ).toBe('blocker');
    expect(mount(SemaphoreBadge, { props: { status: 'sin_datos' } }).attributes('data-status')).toBe(
      'unknown',
    );
  });

  it('muestra la descripción cuando se le da, sin sustituir al rótulo', () => {
    const wrapper = mount(SemaphoreBadge, {
      props: { status: 'caution', description: 'La pendiente encarece la cimentación.' },
    });
    expect(wrapper.text()).toContain('La pendiente encarece la cimentación.');
    expect(wrapper.get('[data-testid="semaphore-text"]').text().length).toBeGreaterThan(0);
  });
});
