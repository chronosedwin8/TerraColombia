/**
 * Equipamientos sociales: educación (MEN), salud (MinSalud/REPS) y contratación
 * pública (SECOP II).
 *
 * Los tres se descubrieron y se inspeccionaron de verdad en la Fase 0 a través de
 * la API de descubrimiento de Socrata; los nombres de columna de abajo son los que
 * devuelve `/resource/{id}.json`. Evidencia en `data-catalog/<fuente>/socrata__*.json`.
 *
 * Todos declaran licencia **CC BY-SA 4.0** en `customFields["Common Core"].License`,
 * lo que arrastra la cláusula de compartir-igual a cualquier base derivada que se
 * redistribuya (PLAN.md §2).
 */

import { type DatasetDefinition } from '../types.js';

const SOCRATA = 'https://www.datos.gov.co/resource';
const INSPECTED_AT = '2026-09-21';
const CC_BY_SA = 'CC BY-SA 4.0';

// ─── Educación ────────────────────────────────────────────────────────────────

const SCHOOLS: DatasetDefinition = {
  id: 'men-establecimientos-educativos',
  source: 'MEN',
  name: 'Establecimientos educativos de preescolar, básica y media',
  url: `${SOCRATA}/cfw5-qzt5.json`,
  connector: 'socrata',
  format: 'json',
  crs: null,
  frequency: 'anual',
  license: CC_BY_SA,
  attribution: 'Fuente: Ministerio de Educación Nacional, corte 2026-09, CC BY-SA 4.0',
  fieldMapping: {
    codigo_dane: {
      target: 'dane_code',
      sqlType: 'VARCHAR(12)',
      note: 'Código DANE del establecimiento, 12 dígitos. Llave natural del sector educativo.',
    },
    nombre_establecimiento: { target: 'name', sqlType: 'TEXT' },
    a_o: {
      target: 'year',
      sqlType: 'INTEGER',
      note: 'Año del reporte. El dataset es histórico: 606 206 filas para varios años, hay que quedarse con el último por establecimiento.',
    },
    cod_dane_departamento: { target: 'dept_code', sqlType: 'CHAR(2)' },
    departamento: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    cod_dane_municipio: {
      target: 'muni_code',
      sqlType: 'CHAR(5)',
      note: 'Código DIVIPOLA del municipio. Llave a core.municipality.',
    },
    municipio: { target: 'attrs.municipio_nombre', sqlType: 'TEXT' },
    cod_secretaria: { target: 'attrs.cod_secretaria', sqlType: 'TEXT' },
    secretaria: { target: 'attrs.secretaria', sqlType: 'TEXT' },
    cod_sector: { target: 'attrs.cod_sector', sqlType: 'TEXT' },
    sector: {
      target: 'sector',
      sqlType: 'TEXT',
      note: 'Valores observados: OFICIAL, NO_OFICIAL. Es el filtro que más usa el usuario.',
    },
    cod_caracter: { target: 'attrs.cod_caracter', sqlType: 'TEXT' },
    caracter: {
      target: 'attrs.caracter',
      sqlType: 'TEXT',
      note: 'Carácter del establecimiento (académico, técnico…). Observado también "-" como valor faltante.',
    },
    cod_calendario: { target: 'attrs.cod_calendario', sqlType: 'TEXT' },
    calendario: { target: 'attrs.calendario', sqlType: 'TEXT', note: 'Observado: A.' },
    direccion: {
      target: 'address',
      sqlType: 'TEXT',
      note: 'Dirección del establecimiento (no de una persona). Observada "IND MZ 27 LT 9 - 10 -11": útil para geocodificar aproximadamente.',
    },
    barrio_vereda: { target: 'attrs.barrio_vereda', sqlType: 'TEXT' },
    total_matricula: {
      target: 'enrollment',
      sqlType: 'INTEGER',
      note: 'Matrícula total. Es el dato que da tamaño de mercado a la plantilla de colegios de M6.',
    },
    cantidad_sedes: { target: 'attrs.cantidad_sedes', sqlType: 'INTEGER' },
    web: { target: 'attrs.web', sqlType: 'TEXT' },
  },
  // Detectadas por la lista negra en la inspección real: `email`, `telefono`, `fax`.
  // `rector` es el nombre del rector: persona natural identificable.
  piiBlocklist: ['email', 'telefono', 'fax', 'rector'],
  targetTable: 'ctx.school',
  validations: [
    {
      id: 'no-pii-columns',
      description:
        'email, telefono, fax y rector no pueden llegar a ctx.school. La ingesta usa $select explícito.',
      severity: 'blocker',
    },
    {
      id: 'muni-code-exists',
      description: 'cod_dane_municipio debe existir en core.municipality.',
      severity: 'blocker',
    },
    {
      id: 'latest-year-only',
      description:
        'Solo se publica la fila del año más reciente por codigo_dane; los años anteriores quedan en `raw` para series.',
      severity: 'blocker',
    },
    {
      id: 'enrollment-numeric',
      description: 'total_matricula debe ser un entero no negativo; los no numéricos se reportan.',
      severity: 'warning',
    },
  ],
  modules: ['M2', 'M4', 'M6', 'M7', 'M9'],
  justification:
    'La oferta educativa es uno de los tres contextos que cualquier comprador de vivienda pregunta, y es el insumo de la plantilla "¿dónde abro un colegio?" que PLAN.md §1.3 nombra explícitamente en M6. 606 206 filas con matrícula, sector y municipio, licencia CC BY-SA 4.0 y corte 2026-09: es el dataset de equipamiento social mejor mantenido del catálogo colombiano.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${SOCRATA}/cfw5-qzt5.json (24 columnas, 606 206 filas)`,
    catalogFile: 'data-catalog/men/socrata__cfw5-qzt5.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 4,
  notes: [
    'NO trae coordenadas: hay que geocodificar por municipio + dirección, o cruzar con `men-sedes-educativas`, que sí las trae.',
    '3 columnas de PII detectadas (email, telefono, fax) y descartadas; `rector` se añade a mano por ser nombre de persona.',
    'El dataset es una serie histórica, no un directorio: filtrar por año es obligatorio o se cuentan colegios varias veces.',
  ],
};

const SCHOOL_CAMPUSES: DatasetDefinition = {
  id: 'men-sedes-educativas',
  source: 'MEN',
  name: 'Sedes educativas de preescolar, básica y media',
  url: `${SOCRATA}/x5ay-984n.json`,
  connector: 'socrata',
  format: 'json',
  crs: 4326,
  frequency: 'anual',
  license: CC_BY_SA,
  attribution: 'Fuente: Ministerio de Educación Nacional, corte 2021-03, CC BY-SA 4.0',
  fieldMapping: {
    codigo_dane_sede: {
      target: 'dane_code',
      sqlType: 'VARCHAR(12)',
      note: 'Código DANE de la SEDE (12 dígitos). Es la unidad que se pinta en el mapa.',
    },
    sede_id: { target: 'attrs.sede_id', sqlType: 'TEXT' },
    nombre_sede: { target: 'name', sqlType: 'TEXT' },
    codigo_dane: {
      target: 'attrs.establecimiento_dane',
      sqlType: 'VARCHAR(12)',
      note: 'Código DANE del establecimiento padre. Llave a `men-establecimientos-educativos`.',
    },
    est_id: { target: 'attrs.est_id', sqlType: 'TEXT' },
    nombre_establecimiento: { target: 'attrs.establecimiento_nombre', sqlType: 'TEXT' },
    principal: {
      target: 'attrs.es_principal',
      sqlType: 'BOOLEAN',
      note: 'S/N: indica si la sede es la principal del establecimiento.',
    },
    coordenada_x_sede: {
      target: 'lng',
      sqlType: 'NUMERIC',
      note: 'Longitud. Observado "-74.18" con solo dos decimales: precisión de ~1 km. Ver validación.',
    },
    coordenada_y_sede: {
      target: 'lat',
      sqlType: 'NUMERIC',
      note: 'Latitud. Observado "0.50", también con dos decimales.',
    },
    zona: {
      target: 'attrs.zona',
      sqlType: 'TEXT',
      note: 'Valores observados: URBANO, RURAL.',
    },
    cte_id_sector: { target: 'sector', sqlType: 'TEXT', note: 'Observado: OFICIAL.' },
    cte_id_calendario: { target: 'attrs.calendario', sqlType: 'TEXT' },
    cod_dane_municipio: { target: 'muni_code', sqlType: 'CHAR(5)' },
    municipio: { target: 'attrs.municipio_nombre', sqlType: 'TEXT' },
    departamento: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    secretaria: { target: 'attrs.secretaria', sqlType: 'TEXT' },
    direccion: { target: 'address', sqlType: 'TEXT' },
    barrio_vereda: { target: 'attrs.barrio_vereda', sqlType: 'TEXT' },
    total_matricula: { target: 'enrollment', sqlType: 'INTEGER' },
    a_o: { target: 'year', sqlType: 'INTEGER' },
  },
  piiBlocklist: ['email', 'telefono', 'fax'],
  targetTable: 'ctx.school',
  validations: [
    {
      id: 'no-pii-columns',
      description: 'email, telefono y fax no pueden llegar a ctx.school.',
      severity: 'blocker',
    },
    {
      id: 'coordinate-precision',
      description:
        'Se mide el número de decimales de las coordenadas. Con 2 decimales el error es de ~1 km: insuficiente para distancias a pie. Si más del 20 % tiene 2 o menos decimales, la distancia a colegio se declara aproximada en la UI.',
      severity: 'blocker',
    },
    {
      id: 'coordinate-in-colombia',
      description: 'El punto debe caer dentro de la extensión de Colombia; los que no, se descartan.',
      severity: 'warning',
    },
  ],
  modules: ['M2', 'M4', 'M6', 'M7'],
  justification:
    'Es el único dataset de educación con coordenadas, y la sede —no el establecimiento— es la que el usuario ve como "el colegio de la esquina". 53 796 sedes. Sin coordenadas no hay distancia a colegio, que es el indicador de entorno más pedido en la ficha de predio.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${SOCRATA}/x5ay-984n.json (23 columnas, 53 796 filas)`,
    catalogFile: 'data-catalog/men/socrata__x5ay-984n.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 4,
  notes: [
    'RIESGO: el corte declarado es 2021-03-19, cinco años más antiguo que el de establecimientos (2026-09). Toda cifra debe llevar su propia fecha de corte (regla 4), no la del otro dataset.',
    'RIESGO: las coordenadas observadas traen solo dos decimales (~1 km de error). Hay que medirlo sobre el total antes de prometer distancias.',
  ],
};

// ─── Salud ────────────────────────────────────────────────────────────────────

const HEALTH_FACILITIES: DatasetDefinition = {
  id: 'reps-prestadores-sedes',
  source: 'MinSalud',
  name: 'Registro Especial de Prestadores y Sedes de Servicios de Salud (REPS)',
  url: `${SOCRATA}/c36g-9fc2.json`,
  connector: 'socrata',
  format: 'json',
  crs: null,
  frequency: 'mensual',
  license: CC_BY_SA,
  attribution:
    'Fuente: Ministerio de Salud y Protección Social, REPS, corte 2026-03, CC BY-SA 4.0',
  fieldMapping: {
    codigohabilitacionsede: {
      target: 'reps_code',
      sqlType: 'VARCHAR(20)',
      note: 'Código de habilitación de la sede. Es la llave natural: identifica el punto de atención.',
    },
    nombresede: { target: 'name', sqlType: 'TEXT' },
    nombreprestador: {
      target: 'attrs.prestador_nombre',
      sqlType: 'TEXT',
      note: 'ATENCIÓN: cuando `claseprestador` es "Profesional Independiente", este campo ES el nombre de una persona natural. Ver validación `no-independent-professionals`.',
    },
    codigoprestador: { target: 'attrs.codigo_prestador', sqlType: 'TEXT' },
    claseprestador: {
      target: 'level',
      sqlType: 'TEXT',
      note: 'Valores observados: "Profesional Independiente", además de IPS y otros. Es el campo que decide si la fila es una persona o una institución.',
    },
    naturalezajuridica: {
      target: 'attrs.naturaleza_juridica',
      sqlType: 'TEXT',
      note: 'Observado: Privada.',
    },
    ese: { target: 'attrs.es_ese', sqlType: 'BOOLEAN', note: 'SÍ/NO: Empresa Social del Estado.' },
    municipiosede: {
      target: 'muni_code',
      sqlType: 'CHAR(5)',
      note: 'Código DIVIPOLA del municipio de la sede.',
    },
    municipiosededesc: { target: 'attrs.municipio_nombre', sqlType: 'TEXT' },
    departamentodededesc: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    direcci_nsede: {
      target: 'address',
      sqlType: 'TEXT',
      note: 'Dirección de la sede. Observada "Carrera 6 No. 10-12 Local 2": es una dirección real y geocodificable, a diferencia de la nomenclatura del catastro.',
    },
    fecha_corte_reps: {
      target: 'attrs.fecha_corte',
      sqlType: 'TEXT',
      note: 'Texto libre ("Fecha corte REPS: Mar 12 2026  3:11PM"): parsear con cuidado, no es una fecha ISO.',
    },
  },
  // Detectadas por la lista negra en la inspección real.
  piiBlocklist: [
    'numeroidentificacion',
    'tipoid',
    'email_prestador',
    'email_sede',
    'telefonoprestador',
    't_lefonosede',
    'direccionprestador',
    'municipio_prestador',
    'municipioprestadordesc',
    'departamentoprestadordesc',
  ],
  targetTable: 'ctx.health_facility',
  validations: [
    {
      id: 'no-pii-columns',
      description:
        'numeroidentificacion, tipoid, los dos correos, los dos teléfonos y la dirección del prestador no pueden llegar a la base.',
      severity: 'blocker',
    },
    {
      id: 'no-independent-professionals',
      description:
        'Las filas con claseprestador = "Profesional Independiente" NO se publican con nombre: el nombre del prestador es el nombre de una persona natural. Se cuentan como oferta de salud, pero se muestran sin nombre.',
      severity: 'blocker',
    },
    {
      id: 'muni-code-exists',
      description: 'municipiosede debe existir en core.municipality.',
      severity: 'blocker',
    },
  ],
  modules: ['M2', 'M4', 'M6', 'M7'],
  justification:
    'Es el registro oficial y único de la oferta de salud del país: 76 821 sedes con municipio, dirección y clase de prestador, actualizado a 2026-03. Alimenta la distancia a servicio de salud de la ficha (M2) y la plantilla de clínicas de M6. La dirección viene en formato real, así que sirve para geocodificar.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${SOCRATA}/c36g-9fc2.json (22 columnas, 76 821 filas)`,
    catalogFile: 'data-catalog/minsalud/socrata__c36g-9fc2.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 4,
  notes: [
    '4 columnas de PII detectadas automáticamente; la lista negra del dataset añade 6 más que identifican al prestador persona natural.',
    'HALLAZGO SENSIBLE: una parte importante del REPS son profesionales independientes, cuyo `nombreprestador` y `nombresede` son el nombre de una persona (observado "MANUEL DE JESUS LUBO OROZCO"). Publicarlos violaría la regla 3 aunque el dato sea público en el REPS.',
    'NO trae coordenadas: hay que geocodificar por dirección + municipio.',
  ],
};

// ─── Contratación pública ─────────────────────────────────────────────────────

const PUBLIC_CONTRACTS: DatasetDefinition = {
  id: 'secop-ubicaciones-contratos',
  source: 'Colombia Compra Eficiente',
  name: 'SECOP II — ubicaciones de ejecución de contratos',
  url: `${SOCRATA}/gra4-pcp2.json`,
  connector: 'socrata',
  format: 'json',
  crs: null,
  frequency: 'diaria',
  license: CC_BY_SA,
  attribution:
    'Fuente: Agencia Nacional de Contratación Pública — Colombia Compra Eficiente, SECOP II, CC BY-SA 4.0',
  fieldMapping: {
    id_contrato: {
      target: 'id',
      sqlType: 'TEXT',
      note: 'Identificador del contrato, p. ej. "CO1.PCCNTR.3795896".',
    },
    referencia_del_contrato: { target: 'attrs.referencia', sqlType: 'TEXT' },
    proceso_de_compra: { target: 'attrs.proceso_de_compra', sqlType: 'TEXT' },
    nombre_entidad: { target: 'entity', sqlType: 'TEXT', note: 'Entidad contratante.' },
    codigo_entidad: { target: 'attrs.codigo_entidad', sqlType: 'TEXT' },
    localizaci_n: {
      target: 'attrs.localizacion',
      sqlType: 'TEXT',
      note: 'Jerarquía separada por ";": "Colombia;  Valle del Cauca ;  Cali". Hay que partirla y normalizar espacios.',
    },
    ubicacion: {
      target: 'location_label',
      sqlType: 'TEXT',
      note: 'Misma jerarquía con "»": "COLOMBIA»Valle del Cauca»Cali". Es la que conviene parsear.',
    },
    urlproceso: {
      target: 'attrs.url_proceso',
      sqlType: 'TEXT',
      note: 'Objeto JSON `{url: …}`, no una cadena: hay que extraer `.url`.',
    },
  },
  // `nit_entidad` y `documento_proveedor` los marcó la lista negra. El proveedor
  // puede ser persona natural (observado "Cédula de Ciudadanía" en tipodocproveedor).
  piiBlocklist: [
    'nit_entidad',
    'documento_proveedor',
    'tipodocproveedor',
    'proveedor_adjudicado',
    'codigo_proveedor',
  ],
  targetTable: 'ctx.public_contract',
  validations: [
    {
      id: 'no-supplier-identity',
      description:
        'Ninguna columna que identifique al proveedor puede llegar a la base: en SECOP muchos proveedores son personas naturales con cédula.',
      severity: 'blocker',
    },
    {
      id: 'municipality-resolvable',
      description:
        'El último nivel de `ubicacion` debe resolverse a un código DIVIPOLA por nombre normalizado; los no resueltos se reportan y no se publican.',
      severity: 'warning',
    },
  ],
  modules: ['M9'],
  justification:
    'La inversión pública ejecutada en un municipio es un indicador de dinámica territorial que ninguna otra fuente da, y con 6 333 733 filas georreferenciadas a municipio alimenta el observatorio (M9). Entra con prioridad baja: es valor añadido, no núcleo.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${SOCRATA}/gra4-pcp2.json (13 columnas, 6 333 733 filas)`,
    catalogFile: 'data-catalog/secop/socrata__gra4-pcp2.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 3,
  phase: 9,
  notes: [
    'Este dataset no trae el valor del contrato: para eso está `SECOP II - Contratos Electrónicos` (jbjy-vk9h, 6 066 730 filas, 85 columnas), en el que la lista negra detectó 16 columnas de PII. Se deja fuera del MVP por ese coste de saneamiento.',
    '2 columnas de PII detectadas automáticamente; la lista negra del dataset añade 3 más.',
    'La ubicación es solo a nivel de municipio: no sirve para análisis intraurbano.',
  ],
};

export const SOCIAL_INFRASTRUCTURE_DATASETS: readonly DatasetDefinition[] = [
  SCHOOLS,
  SCHOOL_CAMPUSES,
  HEALTH_FACILITIES,
  PUBLIC_CONTRACTS,
];
