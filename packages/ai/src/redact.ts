/**
 * Eliminación de datos personales de los *prompts* y de los registros.
 *
 * Regla 3 de CLAUDE.md: cero datos personales. Aquí hay dos usos:
 *  1. Antes de mandar el texto del usuario al modelo (`redact`).
 *  2. Antes de escribir cualquier cosa en el log (`redactForLog`, `redactObject`).
 *
 * Lo que **nunca** se toca es el código predial: el NPN de 30 dígitos (o el antiguo de 20)
 * es el identificador del producto, no un dato personal. Se protege antes de aplicar los
 * patrones y se restaura al final, para que ningún patrón de teléfono o de cédula se lo coma.
 */

export type PiiKind = 'email' | 'phone' | 'id_document' | 'nit' | 'person_name' | 'address';

export interface RedactionFinding {
  kind: PiiKind;
  /** Cuántas veces se encontró. Nunca se registra el valor original. */
  count: number;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
  /** true si se eliminó algo. */
  redacted: boolean;
}

export const REDACTION_TOKENS: Record<PiiKind, string> = {
  email: '[CORREO ELIMINADO]',
  phone: '[TELÉFONO ELIMINADO]',
  id_document: '[DOCUMENTO ELIMINADO]',
  nit: '[NIT ELIMINADO]',
  person_name: '[NOMBRE ELIMINADO]',
  address: '[DIRECCIÓN PERSONAL ELIMINADA]',
};

/** Marcadores internos para proteger los códigos prediales durante la limpieza. */
const PROTECT_OPEN = '\u0001';
const PROTECT_CLOSE = '\u0002';

const CADASTRAL_CODE_RE = /(?<!\d)(\d{30}|\d{20})(?!\d)/g;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** NIT colombiano: nueve dígitos y dígito de verificación. */
const NIT_RE = /(?<!\d)(\d{9})\s*-\s*(\d)(?!\d)/g;

/**
 * Cédula: solo se elimina cuando aparece con una palabra que la identifica. Un número de
 * ocho dígitos suelto puede ser una población, un área o un avalúo, y borrarlo dañaría el
 * producto sin proteger a nadie.
 */
const DOCUMENT_KEYWORDS =
  '(?:c\\.?\\s?c\\.?|c[eé]dula(?:\\s+de\\s+ciudadan[ií]a)?|documento(?:\\s+de\\s+identidad)?|identificaci[oó]n|tarjeta\\s+de\\s+identidad|pasaporte|nit)';
const DOCUMENT_WITH_KEYWORD_RE = new RegExp(
  `(${DOCUMENT_KEYWORDS})\\s*(?:n[°ºo]?\\.?|#|:)?\\s*((?:\\d[\\d.,\\s-]{4,18}\\d))`,
  'gi',
);

const DOCUMENT_KEYWORD_PRESENT_RE = new RegExp(DOCUMENT_KEYWORDS, 'i');

/**
 * Teléfonos colombianos: celular de diez dígitos que empieza por 3, o fijo con indicativo.
 * Se exige que no haya más dígitos pegados para no morder códigos largos.
 *
 * El fijo **exige un separador** después del indicativo: sin eso, el patrón se comería
 * cualquier número de ocho dígitos, como un área en m² o un avalúo. Al celular de diez
 * dígitos que empieza por 3 sí lo tratamos como teléfono aunque venga pegado: la
 * probabilidad de que sea un teléfono es mucho mayor que la de que sea una cifra del
 * territorio, y aquí preferimos proteger.
 */
const PHONE_RES: readonly RegExp[] = [
  /(?<!\d)(?:\+?57[\s.-]?)?\(?3\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
  /(?<!\d)(?:\+?57[\s.-]?)?(?:\((?:60)?[1-8]\)|(?:60)?[1-8])[\s.-]\d{3}[\s.-]?\d{4}(?!\d)/g,
];

/**
 * Nombres propios: solo se eliminan cuando vienen anunciados por una palabra que los
 * identifica como persona **y** en un texto donde también aparece un documento. Así no se
 * borran los nombres de municipios, veredas, colegios o áreas protegidas, que son parte del
 * producto.
 */
const NAME_LEAD =
  '(?:propietario|propietaria|titular|contribuyente|arrendatario|arrendataria|poseedor|poseedora|apoderado|apoderada|se[nñ]or(?:a)?|sr\\.?|sra\\.?|nombre(?:s)?(?:\\s+completo(?:s)?)?)';
const CAPITALIZED_WORD = '[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+';
const PERSON_NAME_RE = new RegExp(
  `(${NAME_LEAD})(\\s*(?:del\\s+predio|registrado)?\\s*:?\\s+)((?:${CAPITALIZED_WORD}|de|del|la|los|las)(?:\\s+(?:${CAPITALIZED_WORD}|de|del|la|los|las)){1,4})`,
  'g',
);

/** Direcciones con número de apartamento o interior: identifican una vivienda concreta. */
const PERSONAL_ADDRESS_RE =
  /\b(?:apto|apartamento|interior|int\.?|torre)\s*\.?\s*[A-Z0-9-]{1,6}\b/gi;

function protectCadastralCodes(text: string): { text: string; codes: string[] } {
  const codes: string[] = [];
  const protectedText = text.replace(CADASTRAL_CODE_RE, (match) => {
    const index = codes.push(match) - 1;
    return `${PROTECT_OPEN}${index}${PROTECT_CLOSE}`;
  });
  return { text: protectedText, codes };
}

function restoreCadastralCodes(text: string, codes: readonly string[]): string {
  return text.replace(
    new RegExp(`${PROTECT_OPEN}(\\d+)${PROTECT_CLOSE}`, 'g'),
    (_match, rawIndex: string) => codes[Number(rawIndex)] ?? '',
  );
}

/**
 * Limpia un texto de datos personales. Devuelve el texto limpio y el recuento por tipo,
 * nunca el valor eliminado (para que el propio log de la limpieza no sea una filtración).
 */
export function redact(input: string): RedactionResult {
  const counts = new Map<PiiKind, number>();
  const bump = (kind: PiiKind) => counts.set(kind, (counts.get(kind) ?? 0) + 1);

  const { text: protectedText, codes } = protectCadastralCodes(input);
  let text = protectedText;

  text = text.replace(EMAIL_RE, () => {
    bump('email');
    return REDACTION_TOKENS.email;
  });

  text = text.replace(NIT_RE, () => {
    bump('nit');
    return REDACTION_TOKENS.nit;
  });

  const hadDocumentKeyword = DOCUMENT_KEYWORD_PRESENT_RE.test(protectedText);

  text = text.replace(DOCUMENT_WITH_KEYWORD_RE, (_match, keyword: string) => {
    bump('id_document');
    return `${keyword} ${REDACTION_TOKENS.id_document}`;
  });

  for (const re of PHONE_RES) {
    text = text.replace(re, () => {
      bump('phone');
      return REDACTION_TOKENS.phone;
    });
  }

  if (hadDocumentKeyword) {
    text = text.replace(PERSON_NAME_RE, (_match, lead: string, separator: string) => {
      bump('person_name');
      return `${lead}${separator}${REDACTION_TOKENS.person_name}`;
    });
  }

  text = text.replace(PERSONAL_ADDRESS_RE, () => {
    bump('address');
    return REDACTION_TOKENS.address;
  });

  text = restoreCadastralCodes(text, codes);

  const findings = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  findings.sort((a, b) => a.kind.localeCompare(b.kind));
  return { text, findings, redacted: findings.length > 0 };
}

export function hasPii(input: string): boolean {
  return redact(input).redacted;
}

/** Atajo para logs: devuelve solo el texto limpio. */
export function redactForLog(input: string): string {
  return redact(input).text;
}

/** Claves cuyo valor se elimina completo al registrar un objeto. */
export const PII_KEY_PATTERN =
  /(nombre|propietario|titular|apellido|telefono|teléfono|celular|correo|email|cedula|cédula|documento|identificacion|identificación|direccion|dirección|contacto)/i;

/**
 * Limpia un objeto antes de registrarlo. Las claves sospechosas se eliminan enteras; el
 * resto de los textos pasa por los patrones. No muta la entrada.
 */
export function redactObject(value: unknown, depth = 0): unknown {
  const MAX_DEPTH = 8;
  if (depth > MAX_DEPTH) return '[PROFUNDIDAD MÁXIMA]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactForLog(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redactObject(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = PII_KEY_PATTERN.test(key)
        ? REDACTION_TOKENS.person_name
        : redactObject(v, depth + 1);
    }
    return out;
  }
  return '[VALOR NO REGISTRABLE]';
}
