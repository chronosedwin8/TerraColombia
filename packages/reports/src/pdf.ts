/* eslint-disable @typescript-eslint/no-explicit-any */
import { getLogger } from '@terracolombia/shared';
import { PAGE } from './templates/styles.js';
import { pdfFooterTemplate, pdfHeaderTemplate } from './templates/partials.js';

/**
 * Render de HTML a PDF A4 con Playwright (Chromium).
 *
 * Playwright se importa de forma diferida: el paquete `@terracolombia/reports` se puede usar
 * solo para exportar XLSX/CSV/GeoJSON sin tener un navegador instalado. Si falta el navegador,
 * el error dice exactamente qué comando ejecutar.
 */

const log = getLogger({ mod: 'reports/pdf' });

export class BrowserUnavailableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

const INSTALL_HINT = [
  'No se pudo abrir Chromium para generar el PDF.',
  '',
  'Cómo solucionarlo:',
  '  1) Instala el navegador de Playwright:  pnpm exec playwright install chromium',
  '  2) En Linux, instala además sus dependencias del sistema:  pnpm exec playwright install-deps chromium',
  '  3) Si usas un navegador ya instalado, define PLAYWRIGHT_CHROMIUM_EXECUTABLE con su ruta.',
  '',
  'Mientras tanto, el informe se puede entregar en XLSX, CSV o GeoJSON, que no necesitan navegador.',
].join('\n');

let browserPromise: Promise<any> | null = null;

async function loadPlaywright(): Promise<any> {
  try {
    return await import('playwright');
  } catch (e) {
    throw new BrowserUnavailableError(
      `No está instalado el paquete "playwright".\n\nInstálalo en el monorepo:  pnpm add -D playwright -F @terracolombia/reports\nY después:  pnpm exec playwright install chromium`,
      e,
    );
  }
}

/** Navegador compartido por proceso: lanzarlo cuesta ~300 ms y el worker genera muchos PDF. */
export async function getBrowser(): Promise<any> {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const { chromium } = await loadPlaywright();
    try {
      return await chromium.launch({
        args: ['--disable-dev-shm-usage', '--font-render-hinting=none'],
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {}),
      });
    } catch (e) {
      browserPromise = null;
      const detail = e instanceof Error ? e.message : String(e);
      throw new BrowserUnavailableError(`${INSTALL_HINT}\n\nDetalle del error:\n${detail}`, e);
    }
  })();
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const current = browserPromise;
  browserPromise = null;
  try {
    const browser = await current;
    await browser.close();
  } catch (e) {
    log.warn({ err: e }, 'No se pudo cerrar el navegador de Playwright');
  }
}

export interface PdfOptions {
  /** Texto del encabezado, izquierda y derecha. */
  headerLeft?: string;
  headerRight?: string;
  /** Texto del pie, a la izquierda de la paginación. */
  footerNote?: string;
  /** Milisegundos máximos de render. Objetivo del plan: informe PDF < 60 s. */
  timeoutMs?: number;
  /** Escala de impresión (1 = 100 %). */
  scale?: number;
  /** Base para resolver rutas relativas del HTML. Por omisión, ninguna (todo va incrustado). */
  baseUrl?: string;
  /** Imprime fondos y colores (necesario para los semáforos y las tramas). */
  printBackground?: boolean;
}

/** Espera a que todas las imágenes del documento estén decodificadas o hayan fallado. */
const WAIT_FOR_IMAGES = `
(async () => {
  const images = Array.from(document.images);
  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve(undefined);
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 8000);
    });
  }));
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
  return images.filter((i) => !i.complete || i.naturalWidth === 0).length;
})()
`;

/**
 * Convierte un documento HTML completo en un PDF A4.
 * Devuelve un `Buffer`; el llamador decide si lo sube al almacén de objetos.
 */
export async function renderPdf(htmlDocument: string, options: PdfOptions = {}): Promise<Buffer> {
  const timeout = options.timeoutMs ?? 60_000;
  const browser = await getBrowser();
  const context = await browser.newContext({
    // El informe no debe depender de la red: todo (mapas, gráficos, logo) va incrustado.
    offline: false,
    viewport: { width: 1240, height: 1754 },
    deviceScaleFactor: 2,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);

  try {
    await page.setContent(htmlDocument, { waitUntil: 'load', timeout });
    // `print` activa @page, los saltos de página y `break-inside: avoid`.
    await page.emulateMedia({ media: 'print' });

    const brokenImages = (await page.evaluate(WAIT_FOR_IMAGES)) as number;
    if (brokenImages > 0) {
      log.warn({ brokenImages }, 'El informe tiene imágenes que no cargaron; se imprimen vacías');
    }

    const buffer = (await page.pdf({
      format: 'A4',
      printBackground: options.printBackground !== false,
      // Los márgenes los manda esta opción, no el @page del CSS: así Chromium reserva el
      // espacio del encabezado y el pie con la paginación.
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: pdfHeaderTemplate(options.headerLeft ?? '', options.headerRight ?? ''),
      footerTemplate: pdfFooterTemplate(options.footerNote ?? ''),
      margin: {
        top: `${PAGE.marginTopMm}mm`,
        right: `${PAGE.marginRightMm}mm`,
        bottom: `${PAGE.marginBottomMm}mm`,
        left: `${PAGE.marginLeftMm}mm`,
      },
      scale: options.scale ?? 1,
      timeout,
    })) as Buffer;

    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

/**
 * Abre una página en blanco del navegador compartido y la entrega a `fn`.
 * Lo usa `static-map.ts` para renderizar MapLibre en modo headless.
 */
export async function withPage<T>(
  fn: (page: any) => Promise<T>,
  opts: { width: number; height: number; deviceScaleFactor?: number; timeoutMs?: number } = {
    width: 800,
    height: 600,
  },
): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.deviceScaleFactor ?? 2,
    locale: 'es-CO',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(opts.timeoutMs ?? 30_000);
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}
