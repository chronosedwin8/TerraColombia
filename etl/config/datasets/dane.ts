/**
 * DANE — límites administrativos, unidades censales y población.
 *
 * Estado de la Fase 0: el geoportal del DANE responde 200 pero **no expone un
 * índice de descargas legible por máquina**; las descargas son por formulario.
 * Por eso los datasets del Marco Geoestadístico Nacional van `NOT_INSPECTED`
 * (regla 2 de CLAUDE.md): se conoce la fuente, no los campos.
 *
 * Evidencia: `data-catalog/dane/manual__dane-geoportal.json`.
 */

import { NOT_INSPECTED, type DatasetDefinition } from '../types.js';

const DANE_GEOPORTAL = 'https://geoportal.dane.gov.co/';
const CATALOG_FILE = 'data-catalog/dane/manual__dane-geoportal.json';
const INSPECTED_AT = '2026-09-21';

const DANE_ATTRIBUTION = 'Fuente: DANE, Marco Geoestadístico Nacional';
const DANE_LICENSE =
  'NO_VERIFICADO — el geoportal no declara licencia en la página de entrada. Pendiente de confirmar antes de publicar dato derivado.';

const MGN_ADMIN: DatasetDefinition = {
  id: 'dane-mgn-limites',
  source: 'DANE',
  name: 'Marco Geoestadístico Nacional — departamentos y municipios',
  url: DANE_GEOPORTAL,
  connector: 'file-download',
  format: 'zip',
  crs: 4686,
  frequency: 'anual',
  license: DANE_LICENSE,
  attribution: DANE_ATTRIBUTION,
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [],
  targetTable: 'core.department / core.municipality',
  validations: [
    {
      id: 'divipola-complete',
      description:
        'Deben llegar los 32 departamentos y Bogotá D.C., y el número de municipios debe coincidir con la DIVIPOLA vigente.',
      severity: 'blocker',
    },
    {
      id: 'muni-code-format',
      description: 'El código de municipio debe ser de 5 dígitos y empezar por el código de su departamento.',
      severity: 'blocker',
    },
    {
      id: 'geom-no-gaps',
      description:
        'La unión de los municipios de un departamento debe cubrir el departamento sin huecos significativos (> 1 km²).',
      severity: 'warning',
    },
  ],
  modules: ['M1', 'M2', 'M3', 'M4', 'M9', 'M10'],
  justification:
    'Los límites oficiales y la DIVIPOLA son el esqueleto del producto: sin ellos no hay buscador de municipios, ni particionado de `core.parcel` por departamento, ni tabla de cobertura por gestor catastral. El IGAC publica límites, pero la DIVIPOLA —el código con el que se cruza TODO lo demás (MEN, REPS, SECOP, proyecciones)— es del DANE.',
  inspection: 'url-verificada',
  evidence: { inspectedFrom: DANE_GEOPORTAL, catalogFile: CATALOG_FILE, inspectedAt: INSPECTED_AT },
  priority: 1,
  phase: 2,
  notes: [
    'fieldMapping: NO_INSPECCIONADO. El geoportal responde 200 pero no publica un índice de descargas recorrible: hay que bajar el ZIP a mano y fijar aquí la URL y los campos reales.',
    'DECISIÓN PENDIENTE: confirmar la licencia del MGN. Sin licencia clara no se puede redistribuir el dato derivado.',
  ],
};

const MGN_CENSUS_BLOCKS: DatasetDefinition = {
  id: 'dane-mgn-manzanas-censales',
  source: 'DANE',
  name: 'Marco Geoestadístico Nacional — sectores, secciones y manzanas censales con CNPV 2018',
  url: DANE_GEOPORTAL,
  connector: 'file-download',
  format: 'zip',
  crs: 4686,
  frequency: 'decenal',
  license: DANE_LICENSE,
  attribution: 'Fuente: DANE, Marco Geoestadístico Nacional y CNPV 2018',
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [
    // El CNPV agregado a manzana no trae datos individuales, pero la lista negra
    // se declara igualmente: si un archivo trajera microdatos, la carga se aborta.
    'NOMBRE',
    'DOCUMENTO',
    'CEDULA',
    'DIRECCION_RESIDENCIA',
  ],
  targetTable: 'ctx.census_block',
  validations: [
    {
      id: 'no-microdata',
      description:
        'Ninguna fila puede representar una persona u hogar individual: se verifica que toda unidad tenga población agregada y que no existan columnas de identificación.',
      severity: 'blocker',
    },
    {
      id: 'pop-consistency',
      description:
        'La suma de población por municipio debe ser coherente (±2 %) con el total municipal publicado por el DANE.',
      severity: 'warning',
    },
    {
      id: 'age-bands-sum',
      description: 'Los grupos de edad deben sumar la población total de la unidad.',
      severity: 'warning',
    },
  ],
  modules: ['M2', 'M4', 'M6', 'M7', 'M9'],
  justification:
    'Es la única fuente abierta de población georreferenciada a escala de manzana en Colombia. Sin ella no se puede responder "cuánta gente vive alrededor de este predio" (M2), ni dimensionar un mercado en un polígono (M4), ni calcular población en edad escolar para la plantilla de colegios de M6, que es uno de los casos de uso que el plan nombra explícitamente.',
  inspection: 'url-verificada',
  evidence: { inspectedFrom: DANE_GEOPORTAL, catalogFile: CATALOG_FILE, inspectedAt: INSPECTED_AT },
  priority: 1,
  phase: 4,
  notes: [
    'fieldMapping: NO_INSPECCIONADO.',
    'El CNPV es de 2018: toda cifra de población que muestre el producto debe llevar esa fecha de corte (regla 4) y advertir que no es actual.',
    'El código de manzana censal del DANE NO coincide con el de manzana catastral del IGAC: el enlace es por geometría.',
  ],
};

// ─── DIVIPOLA (inspeccionada de verdad) ───────────────────────────────────────

const DIVIPOLA_LICENSE = 'CC BY-SA 4.0';
const SOCRATA = 'https://www.datos.gov.co/resource';

const DIVIPOLA_DEPARTMENTS: DatasetDefinition = {
  id: 'dane-divipola-departamentos',
  source: 'DANE',
  name: 'DIVIPOLA — códigos de departamento',
  url: `${SOCRATA}/vcjz-niiq.json`,
  connector: 'socrata',
  format: 'json',
  crs: 4326,
  frequency: 'anual',
  license: DIVIPOLA_LICENSE,
  attribution: 'Fuente: DANE, DIVIPOLA, corte 2025-01, CC BY-SA 4.0',
  fieldMapping: {
    codigo_departamento: {
      target: 'code',
      sqlType: 'CHAR(2)',
      note: 'Código de 2 dígitos con cero a la izquierda ("05" para Antioquia). Verificado.',
    },
    nombre_departamento: {
      target: 'name',
      sqlType: 'TEXT',
      note: 'Nombre en mayúsculas ("ANTIOQUIA"). Normalizar a capitalización de título para la UI.',
    },
    longitud: {
      target: 'centroid_lng',
      sqlType: 'NUMERIC',
      note: 'ATENCIÓN: viene con coma decimal ("-75,504557037"), no con punto. Hay que sustituirla antes de convertir.',
      transform: "replace(longitud, ',', '.')::numeric",
    },
    latitud: {
      target: 'centroid_lat',
      sqlType: 'NUMERIC',
      transform: "replace(latitud, ',', '.')::numeric",
    },
  },
  piiBlocklist: [],
  targetTable: 'core.department',
  validations: [
    {
      id: 'department-count',
      description: 'Deben llegar 33 filas (32 departamentos + Bogotá D.C.). Verificado: 33.',
      severity: 'blocker',
    },
    {
      id: 'decimal-comma',
      description:
        'Si alguna coordenada no puede convertirse tras sustituir la coma, se aborta: un centroide mal parseado manda el mapa al Atlántico Norte.',
      severity: 'blocker',
    },
  ],
  modules: ['M1', 'M3', 'M9', 'M10'],
  justification:
    'La DIVIPOLA es el código con el que se cruza absolutamente todo lo demás (catastro, MEN, REPS, SECOP, proyecciones). 33 filas, licencia CC BY-SA 4.0, corte 2025-01. Es el dataset más pequeño y más imprescindible del catálogo.',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${SOCRATA}/vcjz-niiq.json (4 columnas, 33 filas)`,
    catalogFile: 'data-catalog/dane/socrata__vcjz-niiq.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 1,
  phase: 2,
  notes: [
    'Solo trae el centroide, no el polígono: la geometría departamental viene del MGN (`dane-mgn-limites`) o del IGAC.',
    'Coma decimal en las coordenadas: error clásico de ingesta, declarado en el transform.',
  ],
};

const DIVIPOLA_POPULATED_CENTERS: DatasetDefinition = {
  id: 'dane-divipola-centros-poblados',
  source: 'DANE',
  name: 'DIVIPOLA — códigos de cabeceras y centros poblados',
  url: `${SOCRATA}/xaxy-8nri.json`,
  connector: 'socrata',
  format: 'json',
  crs: 4326,
  frequency: 'anual',
  license: DIVIPOLA_LICENSE,
  attribution: 'Fuente: DANE, DIVIPOLA, corte 2025-01, CC BY-SA 4.0',
  fieldMapping: {
    codigo_departamento: { target: 'dept_code', sqlType: 'CHAR(2)' },
    nombre_departamento: { target: 'attrs.departamento_nombre', sqlType: 'TEXT' },
    codigo_municipio: {
      target: 'muni_code',
      sqlType: 'CHAR(5)',
      note: 'Código de 5 dígitos ("17050"). Es la llave de core.municipality.',
    },
    nombre_municipio: { target: 'attrs.municipio_nombre', sqlType: 'TEXT' },
    codigo_centro_poblado: {
      target: 'code',
      sqlType: 'VARCHAR(8)',
      note: 'Código de 8 dígitos ("17050006"): municipio + secuencial del centro poblado.',
    },
    nombre_centro_poblado: {
      target: 'name',
      sqlType: 'TEXT',
      note: 'Topónimo del centro poblado ("SAN RAFAEL"). Es lo que la gente escribe en el buscador.',
    },
    tipo_centro_poblado: {
      target: 'kind',
      sqlType: 'TEXT',
      note: 'Valores observados: "CP" (centro poblado). Verificar el dominio completo.',
    },
    longitud: {
      target: 'lng',
      sqlType: 'NUMERIC',
      transform: "replace(longitud, ',', '.')::numeric",
      note: 'Coma decimal, igual que en departamentos.',
    },
    latitud: { target: 'lat', sqlType: 'NUMERIC', transform: "replace(latitud, ',', '.')::numeric" },
  },
  piiBlocklist: [],
  targetTable: 'core.populated_center',
  validations: [
    {
      id: 'muni-code-exists',
      description: 'codigo_municipio debe existir en core.municipality.',
      severity: 'blocker',
    },
    {
      id: 'center-code-prefix',
      description: 'codigo_centro_poblado debe empezar por codigo_municipio.',
      severity: 'warning',
    },
    {
      id: 'coordinate-in-colombia',
      description: 'El punto debe caer dentro de la extensión de Colombia.',
      severity: 'blocker',
    },
  ],
  modules: ['M1', 'M2', 'M4'],
  justification:
    '8 161 cabeceras y centros poblados con nombre y coordenada. Es lo que permite que el buscador universal de M1 responda a "Sabanas del Rincón" y no solo a códigos y municipios, y explica los códigos de zona 01–06 del NPN (hay varias áreas urbanas por municipio).',
  inspection: 'inspeccionado',
  evidence: {
    inspectedFrom: `${SOCRATA}/xaxy-8nri.json (9 columnas, 8 161 filas)`,
    catalogFile: 'data-catalog/dane/socrata__xaxy-8nri.json',
    inspectedAt: INSPECTED_AT,
  },
  priority: 2,
  phase: 2,
  notes: [
    'Es un punto por centro poblado, no un polígono: para el polígono está `U_PERIMETRO` del catastro.',
    'El dataset de municipios (`gdxc-w37w`) existe en el portal pero lo publica una gobernación, no el DANE: se prefiere el MGN como fuente de municipios.',
  ],
};

const POPULATION_PROJECTIONS: DatasetDefinition = {
  id: 'dane-proyecciones-poblacion',
  source: 'DANE',
  name: 'Proyecciones de población por municipio',
  url: 'https://www.datos.gov.co/',
  connector: 'socrata',
  format: 'json',
  crs: null,
  frequency: 'anual',
  license: 'NO_VERIFICADO — ver ficha del dataset en datos.gov.co',
  attribution: 'Fuente: DANE, proyecciones de población',
  fieldMapping: NOT_INSPECTED,
  piiBlocklist: [],
  targetTable: 'analytics.muni_indicator',
  validations: [
    {
      id: 'muni-code-exists',
      description: 'Todo código de municipio debe existir en core.municipality.',
      severity: 'blocker',
    },
    {
      id: 'year-range',
      description: 'El año de proyección debe estar dentro del rango publicado por el DANE.',
      severity: 'warning',
    },
  ],
  modules: ['M9', 'M6'],
  justification:
    'Actualiza la población municipal más allá del censo de 2018, que es lo que permite hablar de dinámica poblacional en el observatorio (M9) sin mentir con cifras de hace ocho años.',
  inspection: 'no-inspeccionado',
  evidence: { inspectedFrom: null, catalogFile: 'data-catalog/dane/', inspectedAt: INSPECTED_AT },
  priority: 3,
  phase: 9,
  notes: [
    'fieldMapping: NO_INSPECCIONADO. La búsqueda de Fase 0 solo encontró proyecciones municipales sueltas publicadas por alcaldías (p. ej. `stc8-i9y9`, Chiquinquirá, 54 filas), no la serie nacional del DANE.',
    'DECISIÓN PENDIENTE: la serie nacional de proyecciones se publica en el sitio del DANE en XLSX, no en datos.gov.co. Hay que decidir si se ingiere desde ahí (y entonces el conector es `file-download`, no `socrata`).',
  ],
};

export const DANE_DATASETS: readonly DatasetDefinition[] = [
  DIVIPOLA_DEPARTMENTS,
  DIVIPOLA_POPULATED_CENTERS,
  MGN_ADMIN,
  MGN_CENSUS_BLOCKS,
  POPULATION_PROJECTIONS,
];
