/**
 * Registro de fuentes que recorre la Fase 0 (PLAN.md §5 y §6.4).
 *
 * Regla 2 de CLAUDE.md: aquí solo van URL verificadas. Cada entrada lleva un
 * comentario con cómo se comprobó. Lo que no se pudo verificar va como
 * descriptor manual con `pending`, nunca inventado.
 */

import type { ConnectorKind, SourceId } from './types.js';

// ─── ArcGIS REST ──────────────────────────────────────────────────────────────

export interface ArcgisSourceSpec {
  key: string;
  source: SourceId;
  label: string;
  /** Raíz del catálogo REST, sin `?f=json`. */
  root: string;
  /**
   * Carpetas de primer nivel a recorrer. `null` = todas.
   * Las del plan §5.1 van primero: son las que alimentan el MVP.
   */
  includeFolders: string[] | null;
  /** Carpetas a saltar siempre. */
  excludeFolders: string[];
  /** Servicios prioritarios: se inspeccionan aunque estén fuera de las carpetas. */
  prioritizedServices: string[];
  maxDepth: number;
}

/**
 * IGAC — ArcGIS Server 11.3.
 * Verificado: `GET https://mapas.igac.gov.co/server/rest/services?f=json` → 200
 * con 26 carpetas y 22 servicios en la raíz (corrida de Fase 0).
 * El servidor devuelve 504 de forma intermitente: el cliente reintenta.
 */
export const IGAC_ARCGIS: ArcgisSourceSpec = {
  key: 'igac-arcgis',
  source: 'igac',
  label: 'IGAC — ArcGIS REST (mapas.igac.gov.co)',
  root: 'https://mapas.igac.gov.co/server/rest/services',
  includeFolders: [
    // Carpetas nombradas por PLAN.md §5.1
    'catastro',
    'agrologia',
    'ambiente',
    'carto',
    'limites',
    'ordenamientoterritorial',
    'relieve',
    'nombresgeograficos',
    'poblacion',
    'infraestructura',
    // Añadidas tras ver el catálogo real: aportan a M5/M7/M9
    'ObservatorioInmobiliario',
    'indigenas',
    'minasyenergia',
  ],
  excludeFolders: [
    'Utilities', // servicios de geometría/impresión, sin datos
    'Hosted', // capas alojadas; se miran vía datos.gov.co
    'test',
    'imagenes', // ImageServer: ortoimágenes, no vectorial
    'cartografia_tableros',
    'centrocontrol',
    'atlas',
    'asuntosinternacionales',
    'seguridad',
    'regulacion',
    'geodesia',
    'ICDE',
    'otros',
  ],
  prioritizedServices: [
    // Raíz: capas R/U de terreno y construcción (PLAN.md §5.1)
    'Dato_Fundamental_Catastro/MapServer',
    'Datos_Fundamentales_Transporte_100k/MapServer',
    'Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer',
    'Dato_Fundamental_Curvas_de_nivel_500k/MapServer',
  ],
  maxDepth: 2,
};

export const ARCGIS_SOURCES: readonly ArcgisSourceSpec[] = [IGAC_ARCGIS];

// ─── Socrata (datos.gov.co) ───────────────────────────────────────────────────

export interface SocrataSourceSpec {
  key: string;
  source: SourceId;
  label: string;
  domain: string;
  /** Consultas de texto libre contra `/api/views/metadata/v1?q=`. */
  queries: string[];
  /** Filas por petición. El portal admite hasta 1 000 (verificado en Fase 0). */
  pageLimit: number;
  /** Filtro adicional por publicador (subcadenas sin tildes, minúsculas). */
  publishers: string[];
  /** Máximo de datasets a catalogar por fuente. */
  maxResults: number;
  /** Cuántos datasets de los hallados se inspeccionan a fondo (columnas+muestra). */
  inspectTop: number;
}

/**
 * datos.gov.co — portal Socrata del MinTIC.
 *
 * Verificado el 2026-09-21:
 *  - `/api/views/metadata/v1?q=…&limit=…` responde 200 pero **ignora `q` y
 *    `offset`**: seis consultas distintas devolvieron el mismo conjunto, y 34
 *    offsets consecutivos devolvieron los mismos 100 identificadores.
 *  - `api.us.socrata.com/api/catalog/v1?domains=www.datos.gov.co&q=…&only=dataset`
 *    sí filtra y pagina, y responde en menos de un segundo. Es la que usa el
 *    crawler para descubrir.
 *  - `/api/views/metadata/v1/{id}` devuelve los metadatos completos de un dataset
 *    en ~0,5 s, con la licencia en `customFields["Common Core"].License`.
 */
export const SOCRATA_SOURCES: readonly SocrataSourceSpec[] = [
  {
    key: 'igac-socrata',
    source: 'igac',
    label: 'IGAC en datos.gov.co',
    domain: 'https://www.datos.gov.co',
    queries: [
      'IGAC catastro',
      'base catastral',
      'zonas homogeneas geoeconomicas',
      'suelos capacidad de uso',
      'nombres geograficos Colombia',
      'gestores catastrales',
    ],
    publishers: ['instituto geografico agustin codazzi', 'igac'],
    pageLimit: 100,
    maxResults: 120,
    inspectTop: 12,
  },
  {
    key: 'dane-socrata',
    source: 'dane',
    label: 'DANE en datos.gov.co',
    domain: 'https://www.datos.gov.co',
    queries: [
      'DIVIPOLA',
      'proyecciones de poblacion municipios DANE',
      'censo nacional de poblacion y vivienda',
    ],
    publishers: ['departamento administrativo nacional de estadistica', 'dane'],
    pageLimit: 100,
    maxResults: 80,
    inspectTop: 8,
  },
  {
    key: 'men-socrata',
    source: 'men',
    label: 'MEN — educación en datos.gov.co',
    domain: 'https://www.datos.gov.co',
    queries: [
      'establecimientos educativos',
      'sedes educativas DANE codigo',
      'matricula estadisticas en educacion',
      'directorio unico de establecimientos',
    ],
    publishers: ['ministerio de educacion', 'men'],
    pageLimit: 100,
    maxResults: 80,
    inspectTop: 10,
  },
  {
    key: 'minsalud-socrata',
    source: 'minsalud',
    label: 'MinSalud / REPS en datos.gov.co',
    domain: 'https://www.datos.gov.co',
    queries: [
      'REPS prestadores',
      'registro especial de prestadores de servicios de salud',
      'IPS sedes habilitadas',
    ],
    publishers: ['ministerio de salud', 'minsalud', 'supersalud', 'sispro'],
    pageLimit: 100,
    maxResults: 60,
    inspectTop: 8,
  },
  {
    key: 'secop-socrata',
    source: 'secop',
    label: 'SECOP II en datos.gov.co',
    domain: 'https://www.datos.gov.co',
    queries: ['SECOP II contratos electronicos', 'SECOP procesos de contratacion'],
    publishers: ['colombia compra eficiente', 'agencia nacional de contratacion'],
    pageLimit: 100,
    maxResults: 40,
    inspectTop: 4,
  },
];

// ─── Descriptores manuales ────────────────────────────────────────────────────

export interface ManualSourceSpec {
  id: string;
  source: SourceId;
  connector: ConnectorKind;
  name: string;
  description: string;
  /** URL verificada; el crawler la comprueba con GET/HEAD y anota el estado. */
  url: string;
  format: string;
  license: string;
  attribution: string;
  frequency: string;
  /** Qué falta por verificar a mano antes de poder declarar el dataset. */
  pending: string[];
  notes: string[];
}

/**
 * Fuentes que no exponen un catálogo recorrible por API y que se registran con la
 * URL de entrada verificada. El crawler comprueba que la URL responda y anota el
 * código HTTP; el contenido concreto (nombres de archivo por corte) se confirma
 * en la Fase 2, cuando se descargue el piloto.
 */
export const MANUAL_SOURCES: readonly ManualSourceSpec[] = [
  {
    id: 'dane-geoportal',
    source: 'dane',
    connector: 'file-download',
    name: 'Geoportal DANE — descargas del Marco Geoestadístico Nacional',
    description:
      'Portal de descarga del MGN (departamentos, municipios, sectores y secciones urbanas y rurales, manzanas) y de los resultados del CNPV 2018 agregados a esas unidades. Es la fuente de `ctx.census_block` y de los límites administrativos oficiales.',
    url: 'https://geoportal.dane.gov.co/',
    format: 'SHP / GPKG / CSV dentro de ZIP',
    license: 'NO_VERIFICADO — el portal no declara licencia en la página de entrada',
    attribution: 'Fuente: DANE, Marco Geoestadístico Nacional',
    frequency: 'Anual (MGN) / decenal (CNPV)',
    pending: [
      'Obtener la URL directa y estable del ZIP del MGN del año en curso (el portal usa descargas por formulario).',
      'Confirmar la licencia de uso y la atribución exigida.',
      'Verificar el CRS de entrega (se espera EPSG:4686) y la codificación de los CSV.',
    ],
    notes: [
      'Verificado por el usuario: la raíz del geoportal responde 200.',
      'No se catalogan capas porque el portal no expone un índice de descargas legible por máquina.',
    ],
  },
  {
    id: 'igac-datos-abiertos-hub',
    source: 'igac',
    connector: 'manual',
    name: 'IGAC — portal de datos abiertos (ArcGIS Hub)',
    description:
      'Portal ArcGIS Hub del IGAC. Es el punto de entrada a la Base Catastral Pública por departamento (GDB/GPKG + Registros 1 y 2) y a los históricos mensuales citados en PLAN.md §5.1.',
    url: 'https://datos-abiertos-igac-igac-oit.hub.arcgis.com/',
    format: 'Portal HTML + descargas',
    license: 'CC BY 4.0 / CC BY-SA 4.0 según el producto — verificar por dataset',
    attribution: 'Fuente: IGAC',
    frequency: 'Mensual (base catastral)',
    pending: [
      'Localizar la URL directa del paquete departamental de la Base Catastral Pública del corte vigente.',
      'Confirmar si la licencia del paquete catastral es CC BY-SA 4.0 (como asume PLAN.md §2) o CC BY 4.0 (como declaran los datasets espejados en datos.gov.co).',
    ],
    notes: [
      'La URL aparece citada en `customFields["Common Core"].Homepage` de los datasets del IGAC en datos.gov.co, lo que confirma que es el portal oficial.',
    ],
  },
  {
    id: 'osm-geofabrik-colombia',
    source: 'osm',
    connector: 'osm',
    name: 'OpenStreetMap — extracto de Colombia (Geofabrik)',
    description:
      'Extracto diario de Colombia en formato PBF, más los subconjuntos "free" en SHP y GPKG. Fuente de `ctx.road` y `ctx.poi` vía osm2pgsql (PLAN.md §5.2).',
    url: 'https://download.geofabrik.de/south-america/colombia.html',
    format: 'PBF / SHP.ZIP / GPKG.ZIP',
    license: 'ODbL 1.0',
    attribution: '© colaboradores de OpenStreetMap, ODbL 1.0',
    frequency: 'Diaria',
    pending: [
      'Decidir el subconjunto de etiquetas a ingerir (osm2pgsql style) para no cargar todo el país.',
    ],
    notes: [
      'El descriptor completo (tamaños, fecha del corte, MD5) lo genera el conector `osm.ts` en cada corrida.',
    ],
  },
];

// ─── Selección de fuentes por CLI ─────────────────────────────────────────────

export const ALL_SOURCE_KEYS = [
  ...ARCGIS_SOURCES.map((s) => s.key),
  ...SOCRATA_SOURCES.map((s) => s.key),
  'osm',
  'manual',
] as const;

export type SourceKey = (typeof ALL_SOURCE_KEYS)[number];

/** Resuelve el argumento `--source`; `all` o vacío devuelve todas. */
export function resolveSourceKeys(requested: string | undefined): string[] {
  if (!requested || requested.toLowerCase() === 'all') return [...ALL_SOURCE_KEYS];
  const wanted = requested
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const out: string[] = [];
  for (const w of wanted) {
    const matches = ALL_SOURCE_KEYS.filter((k) => k.toLowerCase() === w || k.toLowerCase().startsWith(w));
    if (matches.length === 0) {
      throw new Error(
        `Fuente desconocida: "${w}". Disponibles: ${ALL_SOURCE_KEYS.join(', ')} (o "all").`,
      );
    }
    out.push(...matches);
  }
  return [...new Set(out)];
}
