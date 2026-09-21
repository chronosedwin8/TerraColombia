/**
 * Guardas de la salida y de la entrada del asistente (PLAN.md §13).
 *
 * La regla dura: **el asistente no inventa cifras**. Aquí se hace cumplir de forma
 * mecánica: se extraen todas las cifras del texto generado y se verifica que cada una
 * aparezca en el contexto de datos que se le pasó. Si aparece una cifra sin respaldo, la
 * respuesta se rechaza y se devuelve la versión plantillada (determinista).
 *
 * También se limpia y se revisa la entrada del usuario: datos personales (`redact`) y
 * intentos de inyección de instrucciones.
 */

import { MESSAGES } from '@terracolombia/shared';
import { redact, type RedactionFinding } from './redact.js';

// ─── Extracción de cifras ─────────────────────────────────────────────────────

export interface ExtractedNumber {
  /** El texto tal como apareció, por ejemplo `1.234,5`. */
  raw: string;
  value: number;
  /** Posición en el texto, para señalar el problema. */
  index: number;
}

/**
 * Números en formato colombiano (`1.234,56`), inglés (`1,234.56`) o simple (`1234.5`).
 * Se exige que el número no esté pegado a letras o dígitos para no partir identificadores.
 */
const NUMBER_RE =
  /(?<![\w.,])-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?![\w])|(?<![\w.,])-?\d+(?:[.,]\d+)?(?![\w])/g;

/**
 * Cadenas que parecen identificadores y no cifras: códigos prediales de 30 o 20 dígitos,
 * códigos DIVIPOLA con cero inicial, celdas H3 y códigos EPSG. No se verifican como
 * magnitudes porque no lo son: un identificador no se "inventa", se cita o no se cita.
 */
const IDENTIFIER_RE = /(?<![\w])(?:\d{30}|\d{20}|EPSG\s*:\s*\d{4,5}|0\d{4}|[0-9a-f]{15})(?![\w])/gi;

/** Interpreta un número escrito en formato colombiano o inglés. */
export function parseNumericToken(raw: string): number | null {
  const token = raw.trim();
  if (token.length === 0) return null;
  const hasDot = token.includes('.');
  const hasComma = token.includes(',');
  let normalized = token;
  if (hasDot && hasComma) {
    // El último separador que aparece es el decimal.
    const lastDot = token.lastIndexOf('.');
    const lastComma = token.lastIndexOf(',');
    if (lastComma > lastDot) {
      normalized = token.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = token.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = token.split(',');
    const last = parts.at(-1) ?? '';
    // `1,234` con tres dígitos detrás es separador de miles; `12,5` es decimal.
    normalized =
      parts.length > 1 && last.length === 3 ? token.replace(/,/g, '') : token.replace(',', '.');
  } else if (hasDot) {
    const parts = token.split('.');
    const last = parts.at(-1) ?? '';
    normalized = parts.length > 1 && last.length === 3 ? token.replace(/\./g, '') : token;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Todas las cifras de un texto, ignorando los identificadores. */
export function extractNumbers(text: string): ExtractedNumber[] {
  const masked = text.replace(IDENTIFIER_RE, (m) => '#'.repeat(m.length));
  const out: ExtractedNumber[] = [];
  for (const match of masked.matchAll(NUMBER_RE)) {
    const raw = match[0];
    const value = parseNumericToken(raw);
    if (value === null) continue;
    out.push({ raw, value, index: match.index ?? 0 });
  }
  return out;
}

// ─── Contexto de datos ────────────────────────────────────────────────────────

/**
 * Tolerancia de comparación. Cubre el redondeo que hace la interfaz (`formatNumber`,
 * `formatArea`, `formatDistance`): 0,5 en valor absoluto para los redondeos a entero y
 * 0,5 % en relativo para las cifras grandes.
 */
export const ROUNDING_TOLERANCE = { absolute: 0.5, relative: 0.005 } as const;

/**
 * Factores de unidad admitidos: el producto muestra la misma magnitud en m y km, y en m² y
 * hectáreas, así que una cifra puede aparecer convertida sin ser inventada.
 */
export const UNIT_FACTORS: readonly number[] = [
  1,
  1000,
  1 / 1000,
  10_000,
  1 / 10_000,
  100,
  1 / 100,
];

/**
 * Cifras que siempre se admiten porque son la escala del propio producto, no un dato:
 * 0 y 100 son los extremos de todo puntaje normalizado.
 */
export const ALWAYS_ALLOWED_NUMBERS: readonly number[] = [0, 100];

export interface NumberContext {
  /** Valores tomados del contexto de datos. */
  values: number[];
  /** Cifras extra que el llamador declara admisibles. */
  allowed: number[];
}

/**
 * Recoge todos los números de un contexto de datos: los numéricos, los que vengan escritos
 * dentro de textos y el **tamaño de cada lista** (para que el asistente pueda contar los
 * elementos que la herramienta devolvió sin que se tome por inventado).
 */
export function collectContextNumbers(value: unknown, depth = 0): number[] {
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) return [];
  if (value === null || value === undefined) return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : [];
  if (typeof value === 'boolean') return [];
  if (typeof value === 'string') return extractNumbers(value).map((n) => n.value);
  if (Array.isArray(value)) {
    const out: number[] = [value.length];
    for (const item of value) out.push(...collectContextNumbers(item, depth + 1));
    return out;
  }
  if (typeof value === 'object') {
    const out: number[] = [];
    for (const item of Object.values(value as Record<string, unknown>)) {
      out.push(...collectContextNumbers(item, depth + 1));
    }
    return out;
  }
  return [];
}

export function buildNumberContext(
  data: unknown,
  extraAllowed: readonly number[] = [],
): NumberContext {
  return {
    values: collectContextNumbers(data),
    allowed: [...ALWAYS_ALLOWED_NUMBERS, ...extraAllowed],
  };
}

function matchesWithTolerance(candidate: number, reference: number): boolean {
  const tolerance = Math.max(
    ROUNDING_TOLERANCE.absolute,
    Math.abs(reference) * ROUNDING_TOLERANCE.relative,
  );
  return Math.abs(candidate - reference) <= tolerance;
}

/** ¿La cifra está respaldada por el contexto, admitiendo redondeo y cambio de unidad? */
export function isNumberSupported(candidate: number, context: NumberContext): boolean {
  for (const allowed of context.allowed) {
    if (candidate === allowed) return true;
  }
  for (const reference of context.values) {
    for (const factor of UNIT_FACTORS) {
      if (matchesWithTolerance(candidate, reference * factor)) return true;
    }
  }
  return false;
}

export interface UnsupportedNumber {
  raw: string;
  value: number;
  index: number;
}

export interface NumberVerification {
  ok: boolean;
  checked: number;
  unsupported: UnsupportedNumber[];
}

/**
 * Verifica que toda cifra del texto esté respaldada por el contexto de datos.
 * Es la guarda central de §13: sin esto, el asistente puede sonar convincente e inventar.
 */
export function verifyNumbers(text: string, context: NumberContext): NumberVerification {
  const numbers = extractNumbers(text);
  const unsupported: UnsupportedNumber[] = [];
  for (const n of numbers) {
    if (!isNumberSupported(n.value, context)) {
      unsupported.push({ raw: n.raw, value: n.value, index: n.index });
    }
  }
  return { ok: unsupported.length === 0, checked: numbers.length, unsupported };
}

// ─── Inyección de instrucciones ───────────────────────────────────────────────

export interface InjectionMatch {
  pattern: string;
  excerpt: string;
}

export interface InjectionDetection {
  detected: boolean;
  matches: InjectionMatch[];
}

/**
 * Patrones de inyección de instrucciones. No pretenden ser exhaustivos —ninguna lista lo
 * es—: son la primera barrera. La barrera de verdad es de diseño: el asistente solo puede
 * llamar herramientas tipadas y nunca ejecuta texto.
 */
export const INJECTION_PATTERNS: readonly { name: string; re: RegExp }[] = [
  {
    name: 'ignorar_instrucciones',
    re: /\b(?:ignora|olvida|descarta)\s+(?:todas\s+)?(?:las\s+)?(?:instrucciones|reglas|indicaciones|lo\s+anterior)/i,
  },
  {
    name: 'ignore_previous',
    re: /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/i,
  },
  {
    name: 'revelar_prompt',
    re: /\b(?:mu[eé]strame|rev[eé]la|repite|imprime|dime)\s+(?:tu|el|las)\s+(?:prompt|instrucciones|system\s*prompt|reglas\s+del\s+sistema)/i,
  },
  {
    name: 'reveal_prompt',
    re: /\b(?:show|reveal|print|repeat)\s+(?:me\s+)?(?:your|the)\s+(?:system\s*)?(?:prompt|instructions)/i,
  },
  {
    name: 'cambio_de_rol',
    re: /\b(?:ahora\s+eres|act[uú]a\s+como|haz\s+de\s+cuenta\s+que\s+eres|finge\s+ser|a\s+partir\s+de\s+ahora\s+eres)\b/i,
  },
  { name: 'role_change', re: /\b(?:you\s+are\s+now|pretend\s+to\s+be|act\s+as\s+(?:if|a))\b/i },
  {
    name: 'sin_restricciones',
    re: /\b(?:sin\s+(?:restricciones|filtros|l[ií]mites)|modo\s+(?:desarrollador|dios|libre)|developer\s+mode|jailbreak|\bDAN\b)/i,
  },
  { name: 'marcador_de_sistema', re: /(?:^|\n)\s*(?:system|assistant|developer)\s*[:>]/i },
  { name: 'etiqueta_de_sistema', re: /<\/?\s*(?:system|instructions|prompt)\s*>/i },
  {
    name: 'sql_libre',
    re: /\b(?:select|insert|update|delete|drop|alter|truncate|union)\b[\s\S]{0,40}\b(?:from|into|table|where|join)\b/i,
  },
  {
    name: 'ejecutar_codigo',
    re: /\b(?:ejecuta|corre|run|execute)\b[^.\n]{0,30}\b(?:sql|consulta|query|script|comando|shell)\b/i,
  },
  {
    name: 'exfiltracion',
    re: /\b(?:env[ií]a|reenv[ií]a|manda|filtra|sube|publica)\b[^.\n]{0,40}(?:https?:\/\/|webhook|curl\s|api[\s_-]?key|bearer\s)/i,
  },
];

export function detectPromptInjection(text: string): InjectionDetection {
  const matches: InjectionMatch[] = [];
  for (const { name, re } of INJECTION_PATTERNS) {
    const found = re.exec(text);
    if (found) {
      matches.push({ pattern: name, excerpt: found[0].slice(0, 80) });
    }
  }
  return { detected: matches.length > 0, matches };
}

// ─── Contenido prohibido en la salida ─────────────────────────────────────────

export const FORBIDDEN_OUTPUT_PATTERNS: readonly { name: string; re: RegExp; why: string }[] = [
  {
    name: 'sql',
    re: /\bselect\b[\s\S]{0,80}\bfrom\b/i,
    why: 'El asistente no genera SQL: solo llama herramientas tipadas.',
  },
  {
    name: 'avaluo_comercial',
    re: /\b(?:el\s+)?(?:valor|precio)\s+(?:comercial|de\s+mercado|de\s+venta)\s+(?:es|ser[ií]a|asciende|estimado\s+es)/i,
    why: 'El producto no entrega avalúos comerciales ni precios de venta.',
  },
  {
    name: 'concepto_juridico',
    re: /\b(?:legalmente\s+(?:puedes|podr[ií]as|est[aá]s\s+autorizado)|te\s+autorizo|es\s+legal\s+construir|tienes\s+derecho\s+a)/i,
    why: 'El producto no emite conceptos jurídicos ni autoriza usos.',
  },
];

export interface ForbiddenContent {
  detected: boolean;
  matches: { name: string; why: string }[];
}

export function detectForbiddenClaims(text: string): ForbiddenContent {
  const matches: { name: string; why: string }[] = [];
  for (const { name, re, why } of FORBIDDEN_OUTPUT_PATTERNS) {
    if (re.test(text)) matches.push({ name, why });
  }
  return { detected: matches.length > 0, matches };
}

// ─── Entrada del usuario ──────────────────────────────────────────────────────

export interface SanitizedInput {
  /** Texto ya sin datos personales, listo para enviarse al modelo. */
  text: string;
  pii: RedactionFinding[];
  injection: InjectionDetection;
  /** false si no se debe enviar al modelo. */
  safeToSend: boolean;
  /** Avisos en español para el usuario. */
  warnings: string[];
}

/** Longitud máxima de una pregunta. Más allá de esto, casi siempre es texto pegado. */
export const MAX_QUESTION_LENGTH = 2000;

export function sanitizeUserInput(input: string): SanitizedInput {
  const trimmed = input.slice(0, MAX_QUESTION_LENGTH);
  const { text, findings } = redact(trimmed);
  const injection = detectPromptInjection(trimmed);
  const warnings: string[] = [];

  if (findings.length > 0) {
    warnings.push(
      'Quitamos de tu mensaje datos que parecen personales (documentos, teléfonos, correos o nombres). Este producto no procesa datos personales.',
    );
  }
  if (injection.detected) {
    warnings.push(
      'Tu mensaje contiene instrucciones dirigidas al asistente que no vamos a ejecutar. Respondemos con la explicación de los datos que ya calculamos.',
    );
  }
  if (input.length > MAX_QUESTION_LENGTH) {
    warnings.push(`Recortamos la pregunta a ${MAX_QUESTION_LENGTH} caracteres.`);
  }

  return {
    text,
    pii: findings,
    injection,
    safeToSend: !injection.detected,
    warnings,
  };
}

// ─── Guarda de la respuesta ───────────────────────────────────────────────────

export type RejectionReason =
  'unsupported_numbers' | 'forbidden_claim' | 'empty_answer' | 'injection_in_input';

export interface GuardedAnswer {
  /** Texto final: el del modelo si pasó la guarda, o el plantillado si no. */
  text: string;
  accepted: boolean;
  reason: RejectionReason | null;
  /** Detalle para el log y para el panel de administración. */
  detail: string[];
  verification: NumberVerification;
}

/**
 * Decide si la respuesta del modelo se publica o se reemplaza por la plantillada.
 *
 * @param generated  Texto del modelo.
 * @param context    Contexto numérico construido con los resultados de las herramientas.
 * @param fallback   Respuesta determinista plantillada que se usa si la guarda rechaza.
 */
export function guardAnswer(
  generated: string,
  context: NumberContext,
  fallback: string,
): GuardedAnswer {
  const text = generated.trim();
  const verification = verifyNumbers(text, context);

  if (text.length === 0) {
    return {
      text: fallback,
      accepted: false,
      reason: 'empty_answer',
      detail: ['El modelo no devolvió texto.'],
      verification,
    };
  }

  const forbidden = detectForbiddenClaims(text);
  if (forbidden.detected) {
    return {
      text: fallback,
      accepted: false,
      reason: 'forbidden_claim',
      detail: forbidden.matches.map((m) => m.why),
      verification,
    };
  }

  if (!verification.ok) {
    return {
      text: fallback,
      accepted: false,
      reason: 'unsupported_numbers',
      detail: verification.unsupported.map(
        (n) =>
          `La cifra "${n.raw}" no aparece en los datos que consultamos, así que la respuesta se rechazó.`,
      ),
      verification,
    };
  }

  return { text, accepted: true, reason: null, detail: [], verification };
}

/** Texto único para cuando no hay dato. Se usa igual con IA y sin ella. */
export const NO_DATA_ANSWER = MESSAGES.ai.noData;
