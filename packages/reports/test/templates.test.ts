import { describe, expect, it } from 'vitest';
import { ALL_DISCLAIMERS, MESSAGES, buildMeta } from '@terracolombia/shared';
import { escapeHtml, html, joinHtml, raw } from '../src/templates/html.js';
import { renderReportHtml } from '../src/templates/index.js';
import { REPORT_LEVELS } from '../src/types.js';
import { SOURCES, municipalitySpec, parcelSpec } from './fixtures.js';

describe('plantillas etiquetadas', () => {
  it('escapa por defecto los valores interpolados', () => {
    const evil = '<script>alert("x")</script>';
    const out = html`<p>${evil}</p>`.value;
    expect(out).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
    expect(out).not.toContain('<script>');
  });

  it('escapa comillas y apóstrofos para que no se rompan los atributos', () => {
    const out = html`<img alt="${`a" onerror='x'`}" />`.value;
    expect(out).toContain('&quot;');
    expect(out).toContain('&#39;');
    expect(out).not.toContain('onerror=\'x\'');
  });

  it('solo inserta HTML sin escapar a través de raw()', () => {
    expect(html`${raw('<b>ok</b>')}`.value).toBe('<b>ok</b>');
    expect(html`${'<b>no</b>'}`.value).toBe('&lt;b&gt;no&lt;/b&gt;');
  });

  it('no deja que un objeto cualquiera se haga pasar por HTML seguro', () => {
    const impostor = { value: '<b>x</b>', toString: () => '<b>x</b>' };
    expect(html`${impostor}`.value).not.toContain('<b>');
  });

  it('aplana arreglos y omite nulos y booleanos', () => {
    expect(joinHtml([raw('<i>'), 'a&b', null, undefined, false, 3]).value).toBe('<i>a&amp;b3');
  });

  it('escapeHtml cubre los cinco caracteres peligrosos', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('Informe Territorial de Predio', () => {
  const SECTIONS = MESSAGES.reports.sections;

  it('tiene las 10 secciones de §11 del plan, en ese orden y con esos títulos', () => {
    const out = renderReportHtml(parcelSpec());
    const positions = SECTIONS.map((title) => out.indexOf(escapeHtml(title)));
    positions.forEach((p, i) => {
      expect(p, `falta la sección ${i + 1}: ${SECTIONS[i]}`).toBeGreaterThan(-1);
    });
    // Estrictamente creciente: el orden de las secciones es el del plan.
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1] as number);
    }
    // Y los números de sección 1..10 aparecen en el encabezado de cada una.
    for (let i = 1; i <= 10; i += 1) {
      expect(out).toContain(`<span class="section__num">${i}</span>`);
    }
  });

  it.each(REPORT_LEVELS)('conserva las 10 secciones en el nivel %s', (level) => {
    const out = renderReportHtml(parcelSpec({ level }));
    for (const title of SECTIONS) expect(out).toContain(escapeHtml(title));
  });

  it('lista fuente, dataset, fecha de corte y licencia de cada cifra', () => {
    const out = renderReportHtml(parcelSpec());
    for (const s of SOURCES) {
      expect(out).toContain(escapeHtml(s.name));
      expect(out).toContain(s.datasetId);
      expect(out).toContain(s.cutDate as string);
      expect(out).toContain(s.license);
      expect(out).toContain(escapeHtml(s.attribution));
    }
    expect(out).toContain(MESSAGES.common.cutDate);
    expect(out).toContain(MESSAGES.common.license);
  });

  it('incluye íntegros todos los textos de DISCLAIMERS', () => {
    const out = renderReportHtml(parcelSpec());
    for (const d of ALL_DISCLAIMERS) {
      expect(out, `falta el descargo: ${d.slice(0, 40)}…`).toContain(escapeHtml(d));
    }
  });

  it.each(REPORT_LEVELS)('incluye los descargos también en el nivel %s', (level) => {
    const out = renderReportHtml(parcelSpec({ level }));
    for (const d of ALL_DISCLAIMERS) expect(out).toContain(escapeHtml(d));
  });

  it('acompaña el avalúo catastral con la advertencia obligatoria', () => {
    const out = renderReportHtml(parcelSpec());
    expect(out).toContain('avalúo catastral ≠ valor comercial');
  });

  it('marca la portada cuando el snapshot es sintético', () => {
    const out = renderReportHtml(parcelSpec());
    expect(out).toContain('DATOS DE DEMOSTRACIÓN');
  });

  it('no marca datos de demostración cuando todas las fuentes son reales', () => {
    const real = SOURCES.map((s) => ({ ...s, synthetic: false }));
    const out = renderReportHtml(parcelSpec({ meta: buildMeta(real) }));
    expect(out).not.toContain('DATOS DE DEMOSTRACIÓN');
  });

  it('incluye la atribución obligatoria al IGAC', () => {
    const out = renderReportHtml(parcelSpec());
    expect(out).toContain('Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0');
  });

  it('dice qué implica la cláusula ShareAlike', () => {
    const out = renderReportHtml(parcelSpec());
    expect(out).toContain('ShareAlike');
    expect(out).toContain('misma licencia');
  });

  it('escapa los datos de la fuente dentro de las tablas', () => {
    const out = renderReportHtml(parcelSpec());
    // El nombre del colegio de la fixture trae un `<script>`.
    expect(out).not.toContain('<script>');
    expect(out).toContain('Colegio de prueba &lt;script&gt;');
  });

  it('explica la cobertura cuando el municipio no es del IGAC', () => {
    const out = renderReportHtml(parcelSpec());
    expect(out).toContain('Cobertura parcial');
  });

  it('solo imprime los anexos en el nivel técnico', () => {
    const annexTitle = 'Anexo A1 — Registro 1 del catastro, tal como llega';
    expect(renderReportHtml(parcelSpec({ level: 'completo' }))).not.toContain(escapeHtml(annexTitle));
    expect(renderReportHtml(parcelSpec({ level: 'tecnico' }))).toContain(escapeHtml(annexTitle));
  });

  it('respeta la marca blanca en el pie', () => {
    const withBrand = renderReportHtml(
      parcelSpec({ branding: { organizationName: 'Inmobiliaria X', whiteLabel: true } }),
    );
    expect(withBrand).toContain('Inmobiliaria X');
    expect(withBrand).not.toContain('Generado por TerraColombia');

    const withoutBrand = renderReportHtml(
      parcelSpec({ branding: { organizationName: 'Inmobiliaria X', whiteLabel: false } }),
    );
    expect(withoutBrand).toContain('Generado por TerraColombia');
  });

  it('descarta un color de marca que no sea hexadecimal', () => {
    const out = renderReportHtml(
      parcelSpec({ branding: { primaryColor: 'red; } body { display:none } /*' } }),
    );
    expect(out).not.toContain('display:none');
    expect(out).toContain('--primary: #184f95');
  });

  it('descarta un logo que no sea un data URI de imagen', () => {
    const out = renderReportHtml(
      parcelSpec({ branding: { logoDataUri: 'https://ejemplo.com/logo.png' } }),
    );
    expect(out).not.toContain('https://ejemplo.com/logo.png');
  });

  it('produce un documento HTML completo', () => {
    const out = renderReportHtml(parcelSpec());
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('lang="es-CO"');
    expect(out).toContain('@page');
    expect(out).toContain('break-inside: avoid');
  });
});

describe('otros informes', () => {
  it('el informe municipal cierra con la sección de fuentes y los descargos', () => {
    const out = renderReportHtml(municipalitySpec());
    expect(out).toContain(escapeHtml(MESSAGES.reports.sections[9]));
    for (const d of ALL_DISCLAIMERS) expect(out).toContain(escapeHtml(d));
    expect(out).toContain('Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0');
  });
});
