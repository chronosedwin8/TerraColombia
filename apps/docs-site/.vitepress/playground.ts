/**
 * Playground de la GeoAPI: un formulario mínimo para probar endpoints con la llave del usuario.
 *
 * Vive en un módulo aparte y no dentro de `playground.md` porque el contenido de un archivo
 * Markdown se compila como plantilla de Vue, y las cadenas con HTML dentro de un bloque
 * `<script>` confunden al compilador de SFC.
 *
 * Reglas de seguridad de este módulo:
 * - La llave se guarda solo en `sessionStorage`, que muere al cerrar la pestaña.
 * - La llave se envía únicamente a la URL base que el usuario ve en el formulario.
 * - El botón "copiar como curl" escribe `$TC_API_KEY`, nunca la llave real.
 * - Todo lo que viene de la respuesta se escapa antes de insertarlo en el DOM.
 */

export interface PlaygroundEndpoint {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  path: string;
  body: unknown | null;
  doc: string;
}

export const PLAYGROUND_ENDPOINTS: PlaygroundEndpoint[] = [
  {
    id: 'search',
    label: 'GET /search — buscador universal',
    method: 'GET',
    path: '/search?q=Sabanalarga&limit=5',
    body: null,
    doc: '/referencia/search',
  },
  {
    id: 'municipality',
    label: 'GET /municipalities/:code — ficha de municipio',
    method: 'GET',
    path: '/municipalities/08638',
    body: null,
    doc: '/referencia/municipios',
  },
  {
    id: 'parcel',
    label: 'GET /parcels/:npn — ficha de predio',
    method: 'GET',
    path: '/parcels/080010102000000010001000000000',
    body: null,
    doc: '/referencia/predios',
  },
  {
    id: 'context',
    label: 'GET /parcels/:npn/context — entorno del predio',
    method: 'GET',
    path: '/parcels/080010102000000010001000000000/context?radius=800&sections=population,education,health',
    body: null,
    doc: '/referencia/predios-contexto',
  },
  {
    id: 'history',
    label: 'GET /parcels/:npn/history — historial de cambios',
    method: 'GET',
    path: '/parcels/080010102000000010001000000000/history',
    body: null,
    doc: '/referencia/predios-historial',
  },
  {
    id: 'nearby',
    label: 'GET /nearby — qué hay alrededor de un punto',
    method: 'GET',
    path: '/nearby?lat=10.9878&lng=-74.7964&radius=800&layers=school,health_facility&limit=10',
    body: null,
    doc: '/referencia/cercanos',
  },
  {
    id: 'layers',
    label: 'GET /layers — catálogo de capas y glosario',
    method: 'GET',
    path: '/layers?muniCode=08638',
    body: null,
    doc: '/referencia/capas',
  },
  {
    id: 'indicators',
    label: 'GET /indicators/:muniCode — indicadores del municipio',
    method: 'GET',
    path: '/indicators/08638',
    body: null,
    doc: '/referencia/indicadores',
  },
  {
    id: 'templates',
    label: 'GET /location-intel/templates — plantillas de negocio',
    method: 'GET',
    path: '/location-intel/templates',
    body: null,
    doc: '/referencia/localizacion',
  },
  {
    id: 'query',
    label: 'POST /parcels/query — búsqueda avanzada (DSL)',
    method: 'POST',
    path: '/parcels/query',
    doc: '/referencia/predios-consulta',
    body: {
      scope: { municipality: '08638' },
      where: { zone: 'urbano', area_m2: { gte: 1000 } },
      near: [{ layer: 'road', class: ['primary', 'trunk'], max_m: 300 }],
      sort: 'area_m2:desc',
      limit: 20,
      geometry: 'centroid',
    },
  },
  {
    id: 'analyze',
    label: 'POST /areas/analyze — tablero de zona',
    method: 'POST',
    path: '/areas/analyze',
    doc: '/referencia/areas-analizar',
    body: {
      scope: { kind: 'radius', center: [-74.7964, 10.9878], radiusM: 1000 },
      sections: ['parcels', 'population', 'education', 'health'],
    },
  },
  {
    id: 'suitability',
    label: 'POST /suitability — semáforo de aptitud',
    method: 'POST',
    path: '/suitability',
    doc: '/referencia/aptitud',
    body: {
      target: { kind: 'parcel', npn: '080010102000000010001000000000' },
      use: 'vivienda_unifamiliar',
    },
  },
];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Crea un elemento con clase y contenido de texto (nunca HTML sin escapar). */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const FORM_HTML = `
<fieldset>
  <legend>1. Tu llave</legend>
  <label for="tc-key">Llave de API</label>
  <input id="tc-key" type="password" autocomplete="off" spellcheck="false" placeholder="tc_sandbox_…" />
  <p class="tc-hint">Se guarda solo en esta pestaña y se envía únicamente a <code id="tc-base"></code>.
     Usa una llave de <strong>sandbox</strong>.</p>
  <label for="tc-url">URL base de la API</label>
  <input id="tc-url" type="text" spellcheck="false" />
  <p class="tc-hint">Cámbiala si apuntas a tu propio proxy.</p>
</fieldset>

<fieldset>
  <legend>2. Qué quieres probar</legend>
  <label for="tc-endpoint">Endpoint</label>
  <select id="tc-endpoint"></select>
  <p class="tc-hint" id="tc-doclink"></p>

  <label for="tc-method">Método</label>
  <select id="tc-method">
    <option value="GET">GET</option>
    <option value="POST">POST</option>
  </select>

  <label for="tc-path">Ruta y parámetros</label>
  <input id="tc-path" type="text" spellcheck="false" />

  <label for="tc-body">Cuerpo JSON <span class="tc-hint tc-inline">(solo para POST)</span></label>
  <textarea id="tc-body" spellcheck="false"></textarea>

  <div class="tc-row">
    <button id="tc-send" type="button">Enviar</button>
    <button id="tc-copy" type="button" class="tc-secondary">Copiar como curl</button>
    <span id="tc-status" class="tc-status"></span>
  </div>
</fieldset>

<fieldset>
  <legend>3. Respuesta</legend>
  <div id="tc-summary"></div>
  <pre id="tc-out">Aún no has enviado ninguna petición.</pre>
  <pre id="tc-curl" class="tc-curl tc-hidden"></pre>
</fieldset>
`;

export function mountPlayground(): void {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('tc-playground');
  if (!root || root.dataset['mounted'] === 'true') return;
  root.dataset['mounted'] = 'true';
  root.innerHTML = FORM_HTML;

  const pick = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;

  const keyInput = pick<HTMLInputElement>('tc-key');
  const urlInput = pick<HTMLInputElement>('tc-url');
  const endpointSelect = pick<HTMLSelectElement>('tc-endpoint');
  const methodSelect = pick<HTMLSelectElement>('tc-method');
  const pathInput = pick<HTMLInputElement>('tc-path');
  const bodyInput = pick<HTMLTextAreaElement>('tc-body');
  const sendButton = pick<HTMLButtonElement>('tc-send');
  const copyButton = pick<HTMLButtonElement>('tc-copy');
  const statusEl = pick<HTMLElement>('tc-status');
  const summaryEl = pick<HTMLElement>('tc-summary');
  const outEl = pick<HTMLElement>('tc-out');
  const curlEl = pick<HTMLElement>('tc-curl');
  const baseEl = pick<HTMLElement>('tc-base');

  const configured = (window as unknown as { __TC_API_URL__?: string }).__TC_API_URL__;
  const apiBase = `${configured ?? 'https://api.terracolombia.co'}/geo/v1`;
  urlInput.value = apiBase;
  baseEl.textContent = apiBase;

  // sessionStorage puede estar bloqueado (modo privado, políticas del navegador).
  try {
    const saved = sessionStorage.getItem('tc_playground_key');
    if (saved) keyInput.value = saved;
  } catch {
    /* sin memoria de la llave: el formulario sigue funcionando */
  }
  keyInput.addEventListener('input', () => {
    try {
      sessionStorage.setItem('tc_playground_key', keyInput.value);
    } catch {
      /* ignorado a propósito */
    }
  });

  for (const endpoint of PLAYGROUND_ENDPOINTS) {
    const option = document.createElement('option');
    option.value = endpoint.id;
    option.textContent = endpoint.label;
    endpointSelect.appendChild(option);
  }

  function applyEndpoint(id: string): void {
    const endpoint = PLAYGROUND_ENDPOINTS.find((e) => e.id === id) ?? PLAYGROUND_ENDPOINTS[0]!;
    methodSelect.value = endpoint.method;
    pathInput.value = endpoint.path;
    bodyInput.value = endpoint.body ? JSON.stringify(endpoint.body, null, 2) : '';
    bodyInput.disabled = endpoint.method !== 'POST';

    const docs = pick<HTMLElement>('tc-doclink');
    docs.textContent = 'Documentación: ';
    const link = el('a', undefined, endpoint.label.split(' — ')[0] ?? endpoint.label);
    link.setAttribute('href', endpoint.doc);
    docs.appendChild(link);
  }

  endpointSelect.addEventListener('change', () => applyEndpoint(endpointSelect.value));
  methodSelect.addEventListener('change', () => {
    bodyInput.disabled = methodSelect.value !== 'POST';
  });
  applyEndpoint(PLAYGROUND_ENDPOINTS[0]!.id);

  function buildCurl(): string {
    const base = urlInput.value.replace(/\/+$/, '');
    const lines = [`curl -s${methodSelect.value === 'POST' ? ' -X POST' : ''} "${base}${pathInput.value}"`];
    lines.push('  -H "X-API-Key: $TC_API_KEY"');
    if (methodSelect.value === 'POST') {
      lines.push('  -H "Content-Type: application/json"');
      const payload = bodyInput.value.trim();
      if (payload) lines.push(`  -d '${payload.replace(/\s*\n\s*/g, ' ')}'`);
    }
    return lines.join(' \\\n');
  }

  copyButton.addEventListener('click', () => {
    const command = buildCurl();
    curlEl.textContent = command;
    curlEl.classList.remove('tc-hidden');
    void navigator.clipboard
      ?.writeText(command)
      .then(() => {
        statusEl.textContent = 'Comando copiado. Lleva $TC_API_KEY, no tu llave.';
        statusEl.className = 'tc-status tc-ok';
      })
      .catch(() => {
        statusEl.textContent = 'No se pudo copiar; el comando está abajo.';
        statusEl.className = 'tc-status';
      });
  });

  function addBox(title: string, items: string[], modifier = ''): void {
    const box = el('div', `tc-meta ${modifier}`.trim());
    box.appendChild(el('h4', undefined, title));
    const list = el('ul');
    for (const item of items) list.appendChild(el('li', undefined, item));
    box.appendChild(list);
    summaryEl.appendChild(box);
  }

  interface ResponseMetaLike {
    synthetic?: boolean;
    sources?: Array<{ source?: string; name?: string; cutDate?: string | null; license?: string }>;
    coverage?: { status?: string; message?: string | null } | null;
    warnings?: string[];
  }

  function renderSummary(payload: unknown, response: Response): void {
    summaryEl.textContent = '';
    if (!payload || typeof payload !== 'object') return;
    const meta = (payload as { meta?: ResponseMetaLike }).meta;

    if (meta?.synthetic) {
      const band = el(
        'div',
        'tc-meta tc-demo',
        'DATOS DE DEMOSTRACIÓN — esta respuesta usa un snapshot sintético. Las cifras no provienen de la fuente oficial.',
      );
      summaryEl.appendChild(band);
    }

    if (meta?.sources && meta.sources.length > 0) {
      addBox(
        'Procedencia (meta.sources)',
        meta.sources.map(
          (s) =>
            `${s.source ?? '—'} · ${s.name ?? '—'} · corte ${s.cutDate ?? 'no disponible'} · ${s.license ?? '—'}`,
        ),
      );
    }

    if (meta?.coverage && meta.coverage.status && meta.coverage.status !== 'full') {
      addBox(
        `Cobertura: ${meta.coverage.status}`,
        [meta.coverage.message ?? 'Cobertura incompleta para este municipio.'],
        'tc-warn',
      );
    }

    if (meta?.warnings && meta.warnings.length > 0) {
      addBox('Advertencias', meta.warnings, 'tc-warn');
    }

    const remaining = response.headers.get('x-ratelimit-remaining');
    const credits = response.headers.get('x-tc-credits-remaining');
    const quota: string[] = [];
    if (remaining) quota.push(`Peticiones restantes en esta ventana: ${remaining}`);
    if (credits) quota.push(`Créditos restantes: ${credits}`);
    if (quota.length > 0) addBox('Cuota', quota);
  }

  sendButton.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) {
      statusEl.textContent = 'Falta la llave de API.';
      statusEl.className = 'tc-status tc-err';
      return;
    }

    let body: string | undefined;
    if (methodSelect.value === 'POST' && bodyInput.value.trim()) {
      try {
        body = JSON.stringify(JSON.parse(bodyInput.value));
      } catch (e) {
        statusEl.textContent = `El cuerpo no es JSON válido: ${e instanceof Error ? e.message : String(e)}`;
        statusEl.className = 'tc-status tc-err';
        return;
      }
    }

    const url = urlInput.value.replace(/\/+$/, '') + pathInput.value;
    const started = performance.now();
    sendButton.disabled = true;
    statusEl.textContent = 'Enviando…';
    statusEl.className = 'tc-status';
    summaryEl.textContent = '';

    try {
      const response = await fetch(url, {
        method: methodSelect.value,
        headers: {
          'X-API-Key': key,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body } : {}),
      });

      const elapsed = Math.round(performance.now() - started);
      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }

      outEl.textContent = payload ? JSON.stringify(payload, null, 2) : text;
      statusEl.textContent = `HTTP ${response.status} · ${elapsed} ms`;
      statusEl.className = `tc-status ${response.ok ? 'tc-ok' : 'tc-err'}`;
      renderSummary(payload, response);
    } catch (e) {
      outEl.textContent = String(e);
      statusEl.textContent = 'Fallo de red. Revisa CORS, la URL base o tu conexión.';
      statusEl.className = 'tc-status tc-err';
    } finally {
      sendButton.disabled = false;
    }
  });

  // `escapeHtml` queda disponible por si se añade contenido HTML en el futuro; hoy todo el
  // contenido dinámico se inserta con textContent, que ya es seguro por construcción.
  void escapeHtml;
}
