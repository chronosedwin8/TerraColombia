// Recorrido de la interfaz con un Chromium real (Playwright): registra errores de consola,
// errores de página, peticiones fallidas y respuestas 4xx/5xx, y guarda una captura por
// pantalla en `.ui-audit/shots/` para mirarla. Complementa a las pruebas de API: estas
// dicen si la ruta responde; esto dice si el usuario ve lo que debe ver.
//
//   pnpm ui:audit                       (predio y municipio de Palmira por omisión)
//   pnpm ui:audit -- <npn> <muniCode>
//
// Requiere la web en http://localhost:5173 y la API en http://127.0.0.1:3001 (pnpm dev),
// y Chromium de Playwright: `pnpm exec playwright install chromium` la primera vez.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WEB = 'http://localhost:5173';
const API = 'http://127.0.0.1:3001/api/v1';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const OUT = path.join(ROOT, '.ui-audit', 'shots');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2).filter((a) => a !== '--');
const npn = argv[0] ?? '765200001000000010681000000000';
const muni = argv[1] ?? '76520';

// Cuenta de prueba con plan alto, creada por la API (igual que la prueba de humo).
const email = `ui-${Date.now()}@terracolombia.test`;
const password = 'contrasena-de-prueba-larga';
const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, acceptedTerms: true }) })).json();
if (!reg?.data?.user) { console.error('No se pudo registrar:', JSON.stringify(reg).slice(0, 300)); process.exit(1); }
console.log('cuenta', email, 'org', reg.data.user.organizationId);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'es-CO' });
const page = await ctx.newPage();

const problemas = [];
function pasaUi(nombre, cond, detalle) { if (!cond) problemas.push({ kind: 'ui', url: page.url(), text: `${nombre} — ${detalle}` }); else console.log('  ✓', nombre); }
page.on('console', async (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  // `text()` de un Error impreso con console.error es solo "Error": hay que pedir los argumentos.
  let text = m.text();
  if (text === 'Error' || text.length < 12) {
    const parts = [];
    for (const a of m.args()) {
      const v = await a
        .evaluate((x) => (x instanceof Error ? x.name + ': ' + x.message + ' | ' + String(x.stack ?? '').split(String.fromCharCode(10)).slice(1, 3).join(' | ') : String(x)))
        .catch(() => '?');
      parts.push(v);
    }
    text = parts.join(' ');
  }
  const loc = m.location();
  problemas.push({ kind: `console.${m.type()}`, url: page.url(), text: `${text.slice(0, 400)} @ ${(loc.url ?? '').split('/').slice(-2).join('/')}:${loc.lineNumber ?? ''}` });
});
page.on('pageerror', (e) => problemas.push({ kind: 'pageerror', url: page.url(), text: String(e).slice(0, 400) }));
page.on('requestfailed', (r) => {
  // ERR_ABORTED es el navegador cancelando peticiones en vuelo al cambiar de página: no es un fallo.
  if (r.failure()?.errorText === 'net::ERR_ABORTED') return;
  problemas.push({ kind: 'requestfailed', url: page.url(), text: `${r.method()} ${r.url()} — ${r.failure()?.errorText}` });
});
page.on('response', (r) => { const s = r.status(); if (s >= 400 && !r.url().includes('/auth/refresh')) problemas.push({ kind: `http${s}`, url: page.url(), text: `${r.request().method()} ${r.url()}` }); });

/** El recorrido de bienvenida es modal: si está abierto, se salta como haría un usuario. */
async function saltarRecorrido() {
  const saltar = page.getByRole('button', { name: 'Saltar' });
  if (await saltar.count()) { await saltar.first().click().catch(() => null); await page.waitForTimeout(400); }
}
async function shot(nombre) {
  await page.waitForTimeout(1500);
  await saltarRecorrido();
  const f = path.join(OUT, `${nombre}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log('  captura', nombre);
}
async function visita(nombre, url, espera = 'networkidle') {
  console.log('→', nombre, url);
  try {
    await page.goto(`${WEB}${url}`, { waitUntil: espera, timeout: 45_000 });
  } catch (e) {
    problemas.push({ kind: 'goto', url, text: String(e).slice(0, 200) });
  }
  await shot(nombre);
}

// 1. Inicio anónimo
await visita('01-inicio-anonimo', '/');
// 2. Ingresar por el formulario real
await page.goto(`${WEB}/ingresar`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/ingresar'), { timeout: 20_000 }).catch(() => null), page.click('button[type="submit"]')]);
await shot('02-tras-ingresar');
console.log('  url tras ingresar:', page.url());
// La sesión debe sobrevivir a una recarga completa: el token de acceso vive en memoria y
// se recupera con la cookie HttpOnly de refresco. Si no, el usuario se «desloguea» al
// abrir cualquier enlace directo.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const salir = await page.getByRole('button', { name: 'Salir' }).count() + await page.getByRole('link', { name: 'Salir' }).count();
pasaUi('la sesión sobrevive a recargar la página', salir > 0, 'no aparece «Salir» tras recargar');

// 3. Buscador universal: escribir el nombre del municipio y elegir el primero
await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
const sb = page.locator('#tc-search');
if (await sb.count()) {
  await sb.fill('Palmira');
  await page.waitForTimeout(1500);
  await shot('03-busqueda-palmira');
  const opt = page.locator('[role="option"]').first();
  if (await opt.count()) { await opt.click(); await page.waitForTimeout(2500); await shot('04-resultado-busqueda'); console.log('  url tras elegir:', page.url()); }
  else problemas.push({ kind: 'ui', url: page.url(), text: 'El buscador no mostró opciones para "Palmira"' });
} else problemas.push({ kind: 'ui', url: page.url(), text: 'No existe #tc-search en la portada' });

// 4. Ficha de predio real
await visita('05-ficha-predio', `/predio/${npn}`);
const fichaTexto = await page.locator('main').innerText().catch(() => '');
if (!/Palmira/i.test(fichaTexto)) problemas.push({ kind: 'ui', url: page.url(), text: 'La ficha no muestra el municipio Palmira' });
if (/no disponible en las fuentes|no encontramos/i.test(fichaTexto.slice(0, 400))) problemas.push({ kind: 'ui', url: page.url(), text: 'La ficha arranca con un mensaje de no disponible' });
// scroll para ver el resto de la ficha
await page.mouse.wheel(0, 1400); await shot('06-ficha-predio-abajo');

// 5. Resto de pantallas
await visita('07-buscar', `/buscar`);
await visita('08-zona', `/zona`);
await visita('09-aptitud', `/aptitud?npn=${npn}`);
await visita('10-localizacion', `/localizacion`);
await visita('11-cambios', `/cambios`);
await visita('12-observatorio', `/observatorio/${muni}`);
await visita('13-proyectos', `/proyectos`);
await visita('14-plan', `/cuenta/plan`);
await visita('15-llaves', `/cuenta/llaves`);
await visita('16-desarrolladores', `/desarrolladores`);
await visita('17-glosario', `/glosario`);
await visita('18-404', `/no-existe`);

// Móvil: portada y ficha
await page.setViewportSize({ width: 390, height: 844 });
await visita('19-movil-inicio', '/');
await visita('20-movil-ficha', `/predio/${npn}`);

await browser.close();

// Resumen
const agrupado = {};
for (const p of problemas) { const k = `${p.kind} · ${p.text}`; agrupado[k] = (agrupado[k] ?? 0) + 1; }
console.log(`\n══ ${problemas.length} problemas (${Object.keys(agrupado).length} distintos) ══`);
for (const [k, n] of Object.entries(agrupado).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(3)}× ${k}`);
writeFileSync(path.join(OUT, 'problemas.json'), JSON.stringify(problemas, null, 2));
