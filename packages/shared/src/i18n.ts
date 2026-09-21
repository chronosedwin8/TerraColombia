/** Cadenas de interfaz en español (Colombia). Única fuente para API, web e informes. */

export const LOCALE = 'es-CO';
export const CURRENCY = 'COP';
export const TIMEZONE = 'America/Bogota';

export const MESSAGES = {
  common: {
    loading: 'Cargando…',
    error: 'Algo falló',
    retry: 'Intentar de nuevo',
    notAvailable: 'No disponible',
    notAvailableLong: 'No disponible en las fuentes que consultamos',
    source: 'Fuente',
    sources: 'Fuentes',
    cutDate: 'Fecha de corte',
    license: 'Licencia',
    save: 'Guardar',
    compare: 'Comparar',
    export: 'Exportar',
    share: 'Compartir enlace',
    explain: 'Explícame esto',
    howCalculated: '¿Cómo se calcula?',
    seeFullDetail: 'Ver detalle completo',
    rawData: 'Datos crudos',
  },
  coverage: {
    noneTitle: 'Aún no tenemos los predios de este municipio',
    noneBody:
      'Este municipio lo gestiona {manager}, que no publica su catastro como dato abierto o todavía no lo hemos integrado. Sí tenemos para esta zona: {layers}.',
    partialTitle: 'Cobertura parcial',
    partialBody:
      'Tenemos parte de la información catastral de este municipio. Lo que falta aparece marcado como no disponible.',
    igacTitle: 'Municipio con catastro del IGAC',
  },
  parcel: {
    title: 'Ficha de predio',
    identification: 'Identificación catastral',
    characteristics: 'Características',
    buildings: 'Construcciones',
    environment: 'Entorno',
    soil: 'Suelo y aptitud',
    hazards: 'Amenazas y restricciones',
    planning: 'Ordenamiento territorial',
    population: 'Población alrededor',
    history: 'Historial de cambios',
    cadastralValueWarning:
      'El avalúo catastral es un valor fiscal, no el precio de venta del predio.',
    noBuildings: 'El catastro no registra construcciones en este predio.',
  },
  suitability: {
    favorable: 'Favorable',
    condicionado: 'Favorable con condiciones',
    desfavorable: 'Desfavorable',
    sin_datos: 'Sin datos suficientes',
    favorableHelp: 'No encontramos restricciones relevantes para el uso que elegiste.',
    condicionadoHelp:
      'Es viable, pero hay factores que encarecen o limitan el proyecto. Revisa los puntos en amarillo.',
    desfavorableHelp:
      'Encontramos al menos una restricción fuerte. Revisa los puntos en rojo antes de seguir.',
    sinDatosHelp:
      'Faltan datos obligatorios para esta zona. Te mostramos lo que sí sabemos y lo que falta.',
  },
  errors: {
    notFound: 'No encontramos lo que buscas',
    parcelNotFound:
      'No hay un predio con ese código predial en los cortes que tenemos. Verifica los dígitos o busca por dirección.',
    invalidNpn:
      'Ese código predial no tiene una estructura válida. Debe tener 30 dígitos (o 20 en el formato anterior).',
    areaTooLarge:
      'El área que dibujaste ({area} km²) supera el límite de tu plan ({limit} km²). Dibuja un área más pequeña o mejora tu plan.',
    quotaExceeded:
      'Alcanzaste el límite de tu plan para esta operación. Puedes esperar al próximo periodo o mejorar tu plan.',
    insufficientCredits: 'No tienes créditos suficientes para esta operación (necesitas {needed}).',
    rateLimited: 'Demasiadas peticiones. Espera unos segundos.',
    timeout:
      'La consulta tardó demasiado. Reduce el área o el número de filtros, o ejecútala como tarea en segundo plano.',
    unauthorized: 'Necesitas iniciar sesión para esto.',
    forbidden: 'Tu plan no incluye esta función.',
  },
  ai: {
    disclaimer:
      'Esta explicación la genera un asistente a partir de los datos que ya calculamos. No agrega cifras nuevas: si un dato no está, dice que no está.',
    noData:
      'No tengo ese dato en las fuentes disponibles para esta zona, así que no voy a estimarlo.',
  },
  reports: {
    coverTitle: 'Informe Territorial de Predio',
    sections: [
      'Localización',
      'Identificación y características catastrales',
      'Construcciones',
      'Contexto geográfico',
      'Suelos, capacidad y vocación',
      'Amenazas y restricciones',
      'Ordenamiento territorial',
      'Entorno: población, educación, salud, comercio y accesibilidad',
      'Análisis y semáforos explicados',
      'Fuentes, fechas de corte, licencias y advertencias',
    ],
    verifyQr: 'Escanea para verificar la autenticidad de este informe',
    immutable:
      'Este informe es inmutable: quedó atado a las fechas de corte listadas en la sección 10.',
  },
} as const;

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return MESSAGES.common.notAvailable;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatCop(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return MESSAGES.common.notAvailable;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatArea(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined || Number.isNaN(m2)) return MESSAGES.common.notAvailable;
  if (m2 >= 10_000) return `${formatNumber(m2 / 10_000, 2)} ha (${formatNumber(m2)} m²)`;
  return `${formatNumber(m2, 1)} m²`;
}

export function formatDistance(m: number | null | undefined): string {
  if (m === null || m === undefined || Number.isNaN(m)) return MESSAGES.common.notAvailable;
  if (m >= 1000) return `${formatNumber(m / 1000, 1)} km`;
  return `${formatNumber(m)} m`;
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
