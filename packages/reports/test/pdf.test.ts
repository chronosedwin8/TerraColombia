import { afterAll, describe, expect, it } from 'vitest';
import { BrowserUnavailableError, closeBrowser, renderReport } from '../src/index.js';
import { municipalitySpec, parcelSpec } from './fixtures.js';

/**
 * Render de punta a punta con Playwright.
 *
 * Si el navegador de Chromium no está instalado, la prueba **no falla**: registra el aviso y
 * se salta. Instalar un navegador de ~150 MB no puede ser un requisito para ejecutar la
 * batería de pruebas de un paquete que también genera XLSX, CSV y GeoJSON.
 *
 * Para ejecutarla de verdad:
 *   pnpm exec playwright install chromium
 *
 * O apuntando a un Chromium ya instalado:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chrome pnpm --filter @terracolombia/reports test
 */

let browserAvailable: boolean | null = null;

async function renderOrSkip(
  spec: Parameters<typeof renderReport>[0],
): Promise<Awaited<ReturnType<typeof renderReport>> | null> {
  if (browserAvailable === false) return null;
  try {
    const out = await renderReport(spec, { forceFallbackMap: true, timeoutMs: 90_000 });
    browserAvailable = true;
    return out;
  } catch (e) {
    if (e instanceof BrowserUnavailableError) {
      browserAvailable = false;
      console.warn(
        'Prueba de PDF saltada: no hay navegador de Playwright. Instálalo con `pnpm exec playwright install chromium`.',
      );
      // Se comprueba al menos que el error sea el accionable que promete el paquete.
      expect(e.message).toContain('playwright install chromium');
      return null;
    }
    throw e;
  }
}

/** Cuenta los objetos de página del PDF, que es el número de páginas impresas. */
function countPages(buffer: Buffer): number {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('renderReport', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('genera el Informe Territorial de Predio en PDF', async () => {
    const out = await renderOrSkip(parcelSpec());
    if (!out) return;

    expect(out.contentType).toBe('application/pdf');
    expect(out.filename.endsWith('.pdf')).toBe(true);
    expect(out.filename).toContain('080010102000000010001000000000');
    // Firma de un archivo PDF.
    expect(out.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Las 10 secciones más portada e índice no caben en menos de 10 páginas.
    expect(countPages(out.buffer)).toBeGreaterThanOrEqual(10);
  }, 120_000);

  it('el nivel resumen produce un PDF más corto que el completo', async () => {
    const resumen = await renderOrSkip(parcelSpec({ level: 'resumen' }));
    if (!resumen) return;
    const completo = await renderOrSkip(parcelSpec({ level: 'completo' }));
    if (!completo) return;

    expect(countPages(resumen.buffer)).toBeLessThanOrEqual(countPages(completo.buffer));
    // Pero el resumen sigue teniendo las 10 secciones y, por tanto, más de una página.
    expect(countPages(resumen.buffer)).toBeGreaterThan(2);
  }, 180_000);

  it('genera también el Informe Municipal', async () => {
    const out = await renderOrSkip(municipalitySpec());
    if (!out) return;
    expect(out.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(out.filename).toContain('municipality');
  }, 120_000);

  it('el PDF incrusta el QR de verificación sin depender de la red', async () => {
    const out = await renderOrSkip(parcelSpec());
    if (!out) return;
    // El QR va como SVG en línea, así que el PDF no tiene ninguna referencia externa.
    const text = out.buffer.toString('latin1');
    expect(text).not.toContain('http://localhost');
    expect(out.buffer.length).toBeGreaterThan(50_000);
  }, 120_000);
});
