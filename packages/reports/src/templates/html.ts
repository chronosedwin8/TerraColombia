/**
 * Motor de plantillas mínimo: plantillas etiquetadas que **escapan por defecto**.
 * No hay dependencia externa (ni Handlebars ni EJS) y el único camino para insertar
 * HTML sin escapar es `raw()`, que se lee en el código fuente.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const RAW_BRAND = Symbol('terracolombia.rawHtml');

/** Fragmento marcado como ya seguro. Solo `raw()` y `html` lo producen. */
export class RawHtml {
  /** Marca interna: impide que un objeto cualquiera se haga pasar por HTML seguro. */
  readonly [RAW_BRAND] = true;

  constructor(readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

export function isRawHtml(v: unknown): v is RawHtml {
  return v instanceof RawHtml;
}

/**
 * Marca una cadena como HTML seguro. Úsese solo con contenido generado por este paquete
 * (SVG de gráficos, SVG del QR, fragmentos de otras plantillas). **Nunca** con datos de entrada.
 */
export function raw(value: string): RawHtml {
  return new RawHtml(value);
}

function stringify(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (value === true) return '';
  if (isRawHtml(value)) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  if (typeof value === 'number' || typeof value === 'bigint') return escapeHtml(String(value));
  if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): RawHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i += 1) {
    out += stringify(values[i]);
    out += strings[i + 1] ?? '';
  }
  return new RawHtml(out);
}

export function joinHtml(parts: unknown[], separator = ''): RawHtml {
  return new RawHtml(parts.map(stringify).join(separator));
}

/** Convierte cualquier valor a texto seguro para atributos y nodos de texto. */
export function text(value: unknown): RawHtml {
  return new RawHtml(stringify(value));
}

/** Clase CSS saneada: solo se aceptan identificadores conocidos. */
export function cssClass(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '');
}
