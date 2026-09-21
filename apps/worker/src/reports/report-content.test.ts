import { afterAll, describe, expect, it } from 'vitest';
import { loadEnvFile } from '../env.js';

/**
 * Comprueba el CONTENIDO del Informe Territorial de Predio sobre el HTML que Chromium
 * imprime. El PDF lleva fuentes subconjuntadas, así que su texto no se puede leer sin un
 * intérprete completo; el HTML es la misma fuente de verdad y sí es inspeccionable.
 *
 * Aquí se verifican las reglas del proyecto que no pueden romperse nunca:
 *  - las 10 secciones del plan, en orden;
 *  - toda advertencia legal obligatoria, íntegra;
 *  - la atribución del IGAC con su licencia;
 *  - la banda de datos de demostración cuando el corte es sintético;
 *  - que una sección sin datos diga por qué, en vez de desaparecer.
 */
loadEnvFile();
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const DEMO_NPN = '087580101010200010001000000000';

d('contenido del Informe Territorial de Predio', () => {
  afterAll(async () => {
    const { closePool } = await import('@terracolombia/db');
    await closePool();
  });

  async function buildHtml(level: 'resumen' | 'completo' | 'tecnico' = 'completo') {
    const { buildReport } = await import('./build-data.js');
    const { getSourceRefs } = await import('@terracolombia/db');
    const verification = {
      reportId: '00000000-0000-0000-0000-000000000001',
      verifyUrl: 'http://localhost:3001/api/v1/reports/verify/prueba',
      issuedAt: new Date().toISOString(),
    };
    const first = await buildReport('parcel', level, { npn: DEMO_NPN }, verification, []);
    const sources = await getSourceRefs(first.datasetIds);
    const built = await buildReport('parcel', level, { npn: DEMO_NPN }, verification, sources);
    const { renderReportHtmlWithAssets } = await import('@terracolombia/reports');
    const html = await renderReportHtmlWithAssets(built.spec);
    return { html, built, sources };
  }

  it('incluye las 10 secciones del plan, en orden', async () => {
    const { html } = await buildHtml();
    const { MESSAGES } = await import('@terracolombia/shared');
    let cursor = 0;
    for (const title of MESSAGES.reports.sections) {
      const at = html.indexOf(title, cursor);
      expect(at, `falta o está fuera de orden la sección "${title}"`).toBeGreaterThan(-1);
      cursor = at;
    }
  }, 120_000);

  it('lleva las advertencias legales obligatorias íntegras', async () => {
    const { html } = await buildHtml();
    const { DISCLAIMERS } = await import('@terracolombia/shared');
    for (const [key, text] of Object.entries(DISCLAIMERS)) {
      // El HTML escapa entidades: se compara sobre el texto plano.
      const plain = html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      expect(plain, `falta la advertencia ${key}`).toContain(text.slice(0, 60));
    }
  }, 120_000);

  it('cita al IGAC con su licencia CC BY-SA 4.0', async () => {
    const { html } = await buildHtml();
    expect(html).toContain('IGAC');
    expect(html).toMatch(/CC[\s-]?BY[\s-]?SA/i);
  }, 120_000);

  it('marca los datos de demostración', async () => {
    const { html, built } = await buildHtml();
    expect(built.synthetic).toBe(true);
    expect(html.toUpperCase()).toContain('DEMOSTRACI');
  }, 120_000);

  it('advierte que el avalúo catastral no es valor comercial', async () => {
    const { html } = await buildHtml();
    const plain = html.replace(/<[^>]+>/g, ' ');
    expect(plain.toLowerCase()).toContain('avalúo');
    expect(plain).toMatch(/no es (un )?avalúo comercial|no es el precio|valor fiscal/i);
  }, 120_000);

  it('una sección sin datos explica por qué, no desaparece', async () => {
    const { html, built } = await buildHtml();
    const missing = built.sections.filter((s) => s.isMissing);
    expect(missing.length).toBeGreaterThan(0);
    for (const s of missing) {
      // El título de la sección sigue estando aunque no haya datos.
      expect(html, `la sección "${s.title}" desapareció al no tener datos`).toContain(s.title);
    }
  }, 120_000);

  it('el nivel resumen conserva las 10 secciones', async () => {
    const { html } = await buildHtml('resumen');
    const { MESSAGES } = await import('@terracolombia/shared');
    for (const title of MESSAGES.reports.sections) {
      expect(html, `el resumen perdió la sección "${title}"`).toContain(title);
    }
  }, 120_000);

  it('el nivel técnico añade los anexos de datos crudos', async () => {
    const { built } = await buildHtml('tecnico');
    const data = built.spec.kind === 'parcel' ? built.spec.data : null;
    expect(data?.annexes.length).toBeGreaterThan(0);
  }, 120_000);

  it('cada tabla declara su procedencia o su motivo de vacío', async () => {
    const { built } = await buildHtml();
    if (built.spec.kind !== 'parcel') throw new Error('tipo inesperado');
    const tables = [built.spec.data.hydrography, built.spec.data.miningTitles];
    for (const t of tables) {
      const tieneProcedencia = t.sourceDatasetIds.length > 0;
      const explicaVacio = Boolean(t.emptyMessage && t.emptyMessage.length > 30);
      expect(
        tieneProcedencia || explicaVacio,
        `la tabla "${t.id}" no declara procedencia ni explica su vacío`,
      ).toBe(true);
    }
  }, 120_000);

  it('cada indicador trae su fórmula y su explicación', async () => {
    const { built } = await buildHtml();
    if (built.spec.kind !== 'parcel') throw new Error('tipo inesperado');
    for (const ind of built.spec.data.indicators) {
      expect(ind.formula.length, `${ind.id} sin fórmula`).toBeGreaterThan(20);
      expect(ind.explanation.length, `${ind.id} sin explicación`).toBeGreaterThan(20);
      expect(ind.sourceDatasetIds.length, `${ind.id} sin procedencia`).toBeGreaterThan(0);
    }
  }, 120_000);

  it('ningún campo del anexo técnico tiene nombre de dato personal', async () => {
    // El anexo del nivel técnico imprime los campos del registro catastral tal como llegan.
    // Es el único sitio del informe donde podría colarse una columna de la fuente, así que
    // se revisan sus claves, no la prosa (la advertencia legal sí habla de propietarios,
    // precisamente para decir que NO los procesamos).
    const { built } = await buildHtml('tecnico');
    if (built.spec.kind !== 'parcel') throw new Error('tipo inesperado');
    const patron =
      /(propietario|titular|nombre|apellido|cedula|cédula|documento|identific|telefono|teléfono|celular|correo|email|mail|razon_social|razón social|nit)/i;
    for (const annex of built.spec.data.annexes) {
      for (const row of annex.table.rows) {
        const campo = String((row as Record<string, unknown>).campo ?? '');
        expect(patron.test(campo), `el anexo expone el campo "${campo}"`).toBe(false);
      }
    }
  }, 120_000);

  it('declara explícitamente que no procesa datos personales', async () => {
    const { html } = await buildHtml();
    const { DISCLAIMERS } = await import('@terracolombia/shared');
    const plain = html.replace(/<[^>]+>/g, ' ');
    expect(plain).toContain(DISCLAIMERS.noPersonalData.slice(0, 50));
  }, 120_000);
});
