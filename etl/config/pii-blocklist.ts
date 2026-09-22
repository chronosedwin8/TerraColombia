/**
 * Lista negra de columnas con datos personales (regla 3 de CLAUDE.md).
 *
 * Contexto: las fuentes catastrales colombianas (base catastral del IGAC, Registro 1
 * y Registro 2, capas ArcGIS de gestores catastrales, extractos de VUR/ORIP y
 * planillas municipales) traen con frecuencia columnas de titularidad. El producto
 * NO almacena ni expone la ruta predio → persona: todo campo que caiga aquí se
 * descarta en la ingesta y se anota en el log de descartes.
 *
 * Reglas de uso:
 *  - `isPiiColumn(name)` decide por NOMBRE de columna (es la defensa principal).
 *  - `PII_CONTENT_PATTERNS` detecta por CONTENIDO en muestras (segunda defensa,
 *    para columnas con nombre opaco tipo `CAMPO_12` u `OBSERVACIONES`).
 *  - `redactValue` sustituye el valor cuando hay que conservar la fila para conteos.
 *
 * Criterio: ante la duda se descarta. Un falso positivo cuesta una columna; un
 * falso negativo cuesta una violación de la Ley 1581/2012.
 */

// ─── Normalización ────────────────────────────────────────────────────────────

/**
 * Normaliza un nombre de columna: minúsculas, sin tildes/diéresis, y separadores
 * (`_`, `-`, `.`, espacio) colapsados a `_`. Así `Nombre Propietario`,
 * `NOMBRE_PROPIETARIO` y `nombre.propietario` comparan igual.
 */
export function normalizeColumnName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ─── Columnas exactas ─────────────────────────────────────────────────────────

/**
 * Nombres exactos (ya normalizados) observados o esperables en fuentes
 * colombianas. La comparación es exacta contra `normalizeColumnName`.
 */
export const PII_EXACT_COLUMNS: readonly string[] = [
  // Titularidad — base catastral, Registro 1 / Registro 2
  'propietario',
  'propietarios',
  'nombre_propietario',
  'nombres_propietario',
  'propietario_nombre',
  'nombre_del_propietario',
  'titular',
  'titulares',
  'nombre_titular',
  'titular_derecho',
  'titular_catastral',
  'poseedor',
  'nombre_poseedor',
  'ocupante',
  'nombre_ocupante',
  'tenedor',
  'arrendatario',
  'usufructuario',
  'heredero',
  'causante',
  'copropietario',
  'interesado',
  'nombre_interesado',
  'solicitante',
  'nombre_solicitante',
  'responsable_predio',
  'contribuyente',
  'nombre_contribuyente',
  'sujeto_activo',
  'sujeto_pasivo',

  // Nombres de persona natural
  'nombre',
  'nombres',
  'apellido',
  'apellidos',
  'primer_nombre',
  'segundo_nombre',
  'primer_apellido',
  'segundo_apellido',
  'nombre_completo',
  'nombre_persona',
  'nombre_natural',
  'razon_social', // en R1/R2 se usa indistintamente para jurídica y natural
  'razon_social_propietario',
  'nombre_razon_social',

  // Documentos de identidad
  'documento',
  'documentos',
  'num_documento',
  'numero_documento',
  'nro_documento',
  'documento_identidad',
  'doc_identidad',
  'tipo_documento',
  'tipo_doc',
  'identificacion',
  'num_identificacion',
  'numero_identificacion',
  'nro_identificacion',
  'id_persona',
  'cedula',
  'cedulas',
  'num_cedula',
  'numero_cedula',
  'cedula_ciudadania',
  'cc',
  'cedula_catastral_titular',
  'tarjeta_identidad',
  'cedula_extranjeria',
  'pasaporte',
  'nuip',
  'nit', // NIT de persona natural = cédula; se descarta por defecto
  'nit_propietario',
  'num_nit',
  'numero_nit',
  'digito_verificacion',

  // Contacto
  'telefono',
  'telefonos',
  'num_telefono',
  'numero_telefono',
  'tel',
  'celular',
  'movil',
  'fax',
  'correo',
  'correos',
  'correo_electronico',
  'email',
  'e_mail',
  'mail',
  'direccion_correspondencia',
  'direccion_notificacion',
  'direccion_notificaciones',
  'direccion_contacto',
  'direccion_residencia',
  'direccion_domicilio',
  'direccion_titular',
  'direccion_propietario',
  'buzon',
  'contacto',
  'nombre_contacto',

  // Registro / relación con titularidad
  // `matricula_inmobiliaria` sola es un identificador registral del inmueble, no
  // de la persona; se descarta cuando llega acompañada de titular (ver
  // MATRICULA_WITH_HOLDER_HINTS) o cuando la fuente la publica junto a nombres.
  'matricula_titular',
  'matricula_propietario',
  'numero_escritura',
  'escritura',
  'notaria',
  'notario',
  'acto_administrativo_titular',

  // Datos sensibles adicionales
  'firma',
  'huella',
  'foto',
  'fotografia',
  'genero',
  'sexo',
  'fecha_nacimiento',
  'estado_civil',
  'etnia',
  'discapacidad',
  'usuario',
  'usuario_creacion',
  'usuario_modificacion',
  // `USUARIO_LOG` aparece en las geodatabases catastrales de varios departamentos
  // (Sucre, Amazonas, Vaupés, Vichada entre otros): es el nombre de quien editó el
  // registro en el sistema del IGAC. Identifica a una persona concreta —un funcionario—,
  // así que se descarta en la ingesta y queda registrado en `meta.pii_discard_log` con el
  // nombre de la columna, nunca con su contenido.
  'usuario_log',
  'usuario_log_creacion',
  'usuario_edicion',
  'created_user',
  'last_edited_user',
  'editor',
  'digitalizador',
  'funcionario',
  'operario',

  // OpenStreetMap (etiquetas reales observadas en `colombia-latest.osm.pbf`, corte
  // 2026-09-20; conteos en `data-catalog/osm/etiquetas-observadas.json`). El nombre del
  // comercio (`name`) NO está aquí: un rótulo comercial es dato público. Sí están los
  // contactos, que en el comercio pequeño colombiano son los de una persona natural.
  'operator', // 18 876 nodos + 12 486 ways
  'operator_email',
  'operator_phone',
  'contact_phone', // 804
  'contact_mobile', // 351
  'contact_whatsapp',
  'contact_fax',
  'contact_instagram', // 835
  'contact_facebook', // 536
  'contact_twitter',
  'contact_person',
  // Solo los componentes de dirección que localizan una puerta concreta. `addr:city`,
  // `addr:state`, `addr:country` y `addr:postcode` son geografía, no dato personal.
  'addr_street', // 45 135 nodos + 54 217 ways
  'addr_housenumber', // 19 431
  'addr_housename',
  'addr_unit',
  'addr_full', // 1 830
  'addr_flats',
  'addr_door',

  // Inglés (fuentes internacionales / esquemas ArcGIS Online)
  'owner',
  'owner_name',
  'ownername',
  'property_owner',
  'holder',
  'holder_name',
  'taxpayer',
  'taxpayer_name',
  'first_name',
  'last_name',
  'full_name',
  'person_name',
  'national_id',
  'tax_id',
  'phone',
  'phone_number',
  'mobile',
  'cell_phone',
  'contact_email',
  'mailing_address',
  'birth_date',
  'date_of_birth',
  'gender',
  'signature',
  'fingerprint',
] as const;

const EXACT_SET = new Set<string>(PII_EXACT_COLUMNS.map(normalizeColumnName));

// ─── Patrones de nombre ───────────────────────────────────────────────────────

export interface PiiPattern {
  /** Identificador estable para el log de descartes. */
  readonly id: string;
  /** Se evalúa contra el nombre ya normalizado (minúsculas, sin tildes, `_`). */
  readonly pattern: RegExp;
  /** Por qué se descarta, en español, para el informe de PII. */
  readonly reason: string;
}

/**
 * Patrones sobre el nombre normalizado. Se evalúan después de `PII_EXACT_COLUMNS`
 * y capturan las variantes con prefijos/sufijos (`R1_NOMBRE_PROP`, `TEL_1`,
 * `PROPIETARIO_2`, `NOMBRE_PROP_JUR`, …) que abundan en los R1/R2.
 */
export const PII_BLOCKLIST_PATTERNS: readonly PiiPattern[] = [
  {
    id: 'owner',
    // propietar*, titular*, poseedor, ocupante, tenedor, usufructuario, heredero
    pattern: /(propietar|titular|poseedor|ocupante|tenedor|usufructuar|heredero|causante|copropiet)/,
    reason: 'Identifica al titular o poseedor del predio (ruta predio → persona).',
  },
  {
    id: 'person_name',
    // nombre/apellido en cualquier posición: nom_prop, r1_nombres, apell_1
    pattern: /(^|_)(nombre|nombres|nom|nomb|apellido|apellidos|apell|apel)(_|$|[0-9])/,
    reason: 'Nombre o apellido de persona.',
  },
  {
    id: 'person_name_en',
    pattern: /(^|_)(first|last|middle|full|given|family)_?name(_|$|[0-9])/,
    reason: 'Nombre de persona (esquema en inglés).',
  },
  {
    id: 'business_name_natural',
    // razón social: en catastro colombiano se usa también para persona natural
    pattern: /(razon_?social|razonsocial)/,
    reason: 'Razón social: en R1/R2 se usa también para persona natural.',
  },
  {
    id: 'identity_document',
    pattern:
      /(cedula|c_?dula|nuip|documento|identificacion|ident_?doc|doc_?ident|tarjeta_identidad|ced_?extranj|pasaporte|national_?id)/,
    reason: 'Documento de identidad.',
  },
  {
    id: 'tax_id',
    // NIT: de persona natural equivale a la cédula; se descarta por defecto
    pattern: /(^|_)(nit|rut|tax_?id)(_|$|[0-9])/,
    reason: 'NIT/RUT: de persona natural equivale a la cédula.',
  },
  {
    id: 'phone',
    pattern: /(telefono|tel_?fono|(^|_)(tel|telef|celular|movil|cel|fax|phone|mobile)(_|$|[0-9]))/,
    reason: 'Teléfono o celular de contacto.',
  },
  {
    id: 'email',
    pattern: /(correo|e_?mail|(^|_)mail(_|$|[0-9])|buzon)/,
    reason: 'Correo electrónico.',
  },
  {
    id: 'contact_address',
    // dirección de correspondencia/notificación/residencia (≠ dirección del predio)
    pattern:
      /direccion_?(correspondencia|notificacion|notificaciones|contacto|residencia|domicilio|titular|propietario|envio)|mailing_?address/,
    reason: 'Dirección de correspondencia o residencia de la persona.',
  },
  {
    id: 'notary_deed',
    pattern: /(notari|escritura_?publica|(^|_)escritura(_|$|[0-9]))/,
    reason: 'Acto notarial: enlaza el predio con las partes del negocio jurídico.',
  },
  {
    id: 'biometric',
    pattern: /(huella|firma_?digital|(^|_)firma(_|$)|biometr|fotograf|(^|_)foto(_|$|[0-9]))/,
    reason: 'Dato biométrico o imagen de la persona.',
  },
  {
    id: 'sensitive_attribute',
    pattern:
      /(fecha_?nacimiento|birth_?date|date_?of_?birth|estado_?civil|(^|_)(genero|sexo|gender|etnia|raza)(_|$)|discapacidad|orientacion_?sexual|afiliacion_?politica|religion)/,
    reason: 'Dato sensible de la persona (Ley 1581/2012, art. 5).',
  },
  {
    id: 'operator_user',
    // metadatos de edición: identifican al funcionario que digitó el registro
    pattern:
      /(^|_)(usuario|user|created_?user|last_?edited_?user|editor|digitalizador|funcionario|operario|operador|responsable)(_|$|[0-9])/,
    reason: 'Identifica al funcionario u operario que editó el registro.',
  },
  {
    id: 'taxpayer',
    pattern: /(contribuyente|taxpayer|sujeto_?pasivo|deudor|obligado_?tributario)/,
    reason: 'Identifica al contribuyente del impuesto predial.',
  },
  {
    id: 'interested_party',
    pattern: /(interesado|solicitante|peticionario|reclamante|demandante|demandado|apoderado)/,
    reason: 'Identifica a la parte interesada en un trámite.',
  },
];

/**
 * Nombres que por sí solos NO son PII pero que se vuelven sospechosos si en la
 * misma capa hay columnas de titularidad. El crawler los reporta como aviso.
 */
export const PII_ADJACENT_COLUMNS: readonly string[] = [
  'matricula_inmobiliaria',
  'matricula',
  'nro_matricula',
  'numero_matricula',
  'folio_matricula',
  'fmi',
] as const;

const ADJACENT_SET = new Set<string>(PII_ADJACENT_COLUMNS.map(normalizeColumnName));

/**
 * Falsos positivos conocidos: nombres que los patrones marcarían pero que en el
 * dominio geográfico colombiano designan cosas, no personas. Se revisan ANTES de
 * los patrones (nunca antes de `PII_EXACT_COLUMNS`).
 *
 * Ej.: `nombre_geografico` (topónimos del IGAC), `nombre_municipio`,
 * `nombre_vereda`, `nombre_via`, `nombre_capa`.
 */
export const PII_ALLOWLIST_PATTERNS: readonly RegExp[] = [
  /^(nombre|nom|nmbr)_?(geografico|geo|toponimo|topon|lugar|sitio|entidad_territorial)/,
  /^(nombre|nom)_?(departamento|dpto|depto|municipio|mpio|mun|corregimiento|vereda|barrio|comuna|localidad|sector|manzana|centro_poblado|cpoblado|region|pais|zona|subzona|cuenca|subcuenca|parque|area_protegida|resguardo|consejo_comunitario)/,
  /^(nombre|nom)_?(via|vial|calle|carrera|predio|inmueble|proyecto|obra|capa|layer|campo|archivo|fuente|dataset|servicio|tabla|clase|categoria|tipo|unidad|suelo|paisaje|cultivo|especie|institucion|establecimiento|sede|colegio|ips|hospital|empresa|entidad|gestor|gestor_catastral|oficina|direccion_territorial|estacion|embalse|rio|quebrada|humedal|grupo|lote|item|programa|contrato|proceso|producto|medicamento|banco|fondo|plan|actividad|indicador|variable)/,
  // Una URL o un enlace no es un dato personal por su nombre. Observado en la
  // Fase 0: `url_descarga_documento` de SECOP se descartaba por contener
  // "documento". Si el valor trae PII, lo atrapa la heurística de contenido.
  /^(url|uri|enlace|link|ruta|path)(_|$)/,
  /_(url|uri|link|enlace)$/,
  // La FECHA de una firma es una fecha, no un dato biométrico. Observado en
  // `fecha_de_firma_del_contrato` y `fecha_firma` de SECOP.
  /^fecha_?(de_)?firma/,
  /^firma_?(del?_)?(contrato|acta|convenio|documento|proceso)/,
  /^(departamento|dpto|depto|municipio|mpio)_nombre$/,
  /_(geografico|toponimo)$/,
  /^nombre_?(1|2|3)?_?(oficial|comun|alterno|anterior)$/,
  // `DIRECCION` a secas, en catastro, es la dirección del inmueble (dato público)
  /^direccion(_predio|_inmueble|_catastral|_oficial|_normalizada)?$/,
  /^direccion_?(via|vial|nomenclatura)/,
  // Metadatos técnicos de ArcGIS/PostGIS que contienen la palabra "user" del esquema
  /^(user|usuario)_?(campo|field|dato|definido)/,
] as const;

// ─── Decisión por nombre ──────────────────────────────────────────────────────

export type PiiVerdict =
  | { readonly pii: false; readonly adjacent: boolean }
  | { readonly pii: true; readonly ruleId: string; readonly reason: string };

/**
 * Evalúa un nombre de columna y devuelve el veredicto con la regla que lo
 * produjo, para poder registrarlo en `data-catalog/PII_DESCARTES.md`.
 */
export function classifyPiiColumn(name: string): PiiVerdict {
  const n = normalizeColumnName(name);
  if (n.length === 0) return { pii: false, adjacent: false };

  // 1. Coincidencia exacta: manda sobre la allowlist.
  if (EXACT_SET.has(n)) {
    return {
      pii: true,
      ruleId: 'exact',
      reason: `Columna en la lista negra exacta (${n}).`,
    };
  }

  // 2. Allowlist de topónimos y nombres de cosas.
  for (const allow of PII_ALLOWLIST_PATTERNS) {
    if (allow.test(n)) return { pii: false, adjacent: ADJACENT_SET.has(n) };
  }

  // 3. Patrones.
  for (const p of PII_BLOCKLIST_PATTERNS) {
    if (p.pattern.test(n)) return { pii: true, ruleId: p.id, reason: p.reason };
  }

  return { pii: false, adjacent: ADJACENT_SET.has(n) };
}

/** Atajo booleano de `classifyPiiColumn`. */
export function isPiiColumn(name: string): boolean {
  return classifyPiiColumn(name).pii;
}

/** true si la columna es un identificador registral que conviene vigilar. */
export function isPiiAdjacentColumn(name: string): boolean {
  const v = classifyPiiColumn(name);
  return v.pii === false && v.adjacent;
}

// ─── Detección por contenido ──────────────────────────────────────────────────

export interface PiiContentPattern {
  readonly id: string;
  readonly label: string;
  readonly pattern: RegExp;
  readonly reason: string;
}

/**
 * Heurísticas de contenido para columnas con nombre opaco. Son deliberadamente
 * conservadoras (piden delimitadores de palabra) para no marcar códigos
 * catastrales ni coordenadas.
 *
 * El ORDEN importa: se devuelve la primera coincidencia y los formatos se
 * solapan (un celular colombiano `3151234567` también es una cadena de 10
 * dígitos, que es lo que busca `co_cedula`). Van primero los patrones con
 * estructura propia —correo, NIT con dígito de verificación, teléfono— y de
 * último los genéricos, para que el motivo registrado sea el más preciso.
 */
export const PII_CONTENT_PATTERNS: readonly PiiContentPattern[] = [
  {
    id: 'email',
    label: 'Correo electrónico',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    reason: 'El valor contiene una dirección de correo electrónico.',
  },
  {
    id: 'co_nit',
    label: 'NIT colombiano',
    // 9 dígitos + dígito de verificación: 900123456-7 / 900.123.456-7
    pattern: /(?<![\d.-])\d{3}[.]?\d{3}[.]?\d{3}\s?-\s?\d(?![\d-])/,
    reason: 'El valor parece un NIT con dígito de verificación.',
  },
  {
    id: 'co_phone',
    label: 'Teléfono colombiano',
    // Celular 3XXXXXXXXX, fijo con indicativo (60X) XXXXXXX, o +57 …
    // El `(?<![\d])` inicial es imprescindible: sin él, los últimos 10 dígitos de
    // cualquier código largo (p. ej. un código DANE de 12 dígitos) pasaban por
    // teléfono. Observado en la columna `codigo_dane` del MEN en la Fase 0.
    pattern:
      /(?<![\d])(?:\+?57[\s.-]?)?(?:\(?(?:60[1-8]|3\d{2})\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?![\d])|(?<![\d])3\d{9}(?![\d])/,
    reason: 'El valor parece un teléfono fijo o celular colombiano.',
  },
  {
    id: 'co_cedula',
    label: 'Cédula colombiana',
    // 6–10 dígitos, con o sin puntos de miles, aislados del resto del texto.
    pattern: /(?<![\d.,-])\d{1,3}(?:\.\d{3}){1,3}(?![\d.,-])|(?<![\d.,-])\d{6,10}(?![\d.,-])/,
    reason: 'El valor parece un número de cédula (6 a 10 dígitos).',
  },
  {
    id: 'person_full_name',
    label: 'Nombre completo de persona',
    // Tres o más palabras capitalizadas seguidas, con partículas típicas.
    pattern:
      /\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+){2,}(?:DE\s+|DEL\s+|LA\s+|LOS\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b/,
    reason: 'El valor parece un nombre propio de persona (3+ palabras capitalizadas).',
  },
] as const;

export interface PiiContentHit {
  readonly patternId: string;
  readonly label: string;
  readonly reason: string;
}

/**
 * Columnas cuyo nombre declara inequívocamente un código, conteo o medida del
 * territorio. Para ellas se omiten las heurísticas **numéricas** (`co_cedula` y
 * `co_phone`), que de otro modo marcarían códigos DIVIPOLA, códigos DANE de 12
 * dígitos, identificadores de manzana, áreas en m² o poblaciones.
 * Las heurísticas de correo, NIT y nombre propio siguen aplicándose.
 *
 * El nombre se reconoce tanto con separador (`codigo_dane`) como pegado
 * (`codigoprestador`), porque las dos formas aparecen en datos.gov.co.
 */
const NUMERIC_CODE_COLUMN_HINTS =
  /(^|_)(fid|oid|objectid|globalid|clave|llave|key|npn|cod_?predial|matricula|manzana|vereda|sector|barrio|comuna|terreno|zona|divipola|dane|dpto|depto|departamento|municipio|mpio|area|areas|superficie|perimetro|longitud|latitud|len|leng|length|shape|cantidad|conteo|total|orden|version|anio|ano|year|vigencia|piso|pisos|altura|habitaciones|banos|poblacion|pop|hogares|viviendas|valor|avaluo|escala|resolucion|hectareas|has|m2|km2)(_|$|[0-9])|^(codigo|cod|id|num|numero|nro|secuencial|pk)/;

/** Heurísticas que solo miran dígitos y por tanto son sensibles a códigos largos. */
const NUMERIC_ONLY_PATTERN_IDS = new Set(['co_cedula', 'co_phone']);

/**
 * Busca PII en un valor escalar. Devuelve el primer patrón que coincida.
 * `columnName` es opcional y solo sirve para desactivar la heurística numérica
 * en columnas declaradamente de código o medida.
 */
export function detectPiiContent(value: unknown, columnName?: string): PiiContentHit | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.length === 0 || s.length > 500) return null;

  // Código predial nacional (30) o anterior (20): dato público del inmueble.
  if (/^\d{20}$|^\d{30}$/.test(s)) return null;
  // GlobalID/GUID de ArcGIS.
  if (/^\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?$/.test(s))
    return null;
  // Fechas ISO y números con decimales (áreas, coordenadas).
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  if (/^-?\d+[.,]\d+$/.test(s)) return null;

  const skipNumeric =
    columnName !== undefined && NUMERIC_CODE_COLUMN_HINTS.test(normalizeColumnName(columnName));

  for (const p of PII_CONTENT_PATTERNS) {
    if (skipNumeric && NUMERIC_ONLY_PATTERN_IDS.has(p.id)) continue;
    if (p.pattern.test(s)) {
      return { patternId: p.id, label: p.label, reason: p.reason };
    }
  }
  return null;
}

// ─── Redacción ────────────────────────────────────────────────────────────────

/**
 * Sustituye un valor por un marcador auditable. Se usa cuando hay que conservar
 * la fila (conteos, muestras del catálogo) pero no el dato.
 * Nunca devuelve un hash del valor original: un hash de cédula sigue siendo un
 * identificador reversible por fuerza bruta.
 */
export function redactValue(value: unknown, patternId = 'pii'): string {
  if (value === null || value === undefined) return '';
  return `[REDACTADO:${patternId}]`;
}

/**
 * Aplica la lista negra a un registro completo: quita las columnas PII por nombre
 * y redacta los valores que la heurística de contenido marque.
 */
export function sanitizeRecord(record: Record<string, unknown>): {
  readonly clean: Record<string, unknown>;
  readonly droppedColumns: readonly { column: string; ruleId: string; reason: string }[];
  readonly redactedColumns: readonly { column: string; patternId: string; reason: string }[];
} {
  const clean: Record<string, unknown> = {};
  const droppedColumns: { column: string; ruleId: string; reason: string }[] = [];
  const redactedColumns: { column: string; patternId: string; reason: string }[] = [];

  for (const [key, value] of Object.entries(record)) {
    const verdict = classifyPiiColumn(key);
    if (verdict.pii) {
      droppedColumns.push({ column: key, ruleId: verdict.ruleId, reason: verdict.reason });
      continue;
    }
    const hit = detectPiiContent(value, key);
    if (hit) {
      redactedColumns.push({ column: key, patternId: hit.patternId, reason: hit.reason });
      clean[key] = redactValue(value, hit.patternId);
      continue;
    }
    clean[key] = value;
  }

  return { clean, droppedColumns, redactedColumns };
}
