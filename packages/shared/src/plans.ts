import { z } from 'zod';
import { AREA_ANALYSIS_HARD_LIMIT_KM2, MAX_PAGE_SIZE } from './constants.js';

/**
 * Definición canónica de planes. Los precios son **hipótesis a validar** (PLAN.md §12)
 * y viven aquí para que la UI, la API y la facturación no se desincronicen.
 * Los montos están en pesos colombianos (COP), sin centavos.
 */

export const PLAN_CODES = ['free', 'per_report', 'pro', 'business', 'api', 'enterprise'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const EntitlementsSchema = z.object({
  /** Consultas de ficha detallada por mes; null = sin límite. */
  detailedQueriesPerMonth: z.number().nullable(),
  /** Informes incluidos por mes. */
  reportsPerMonth: z.number().nullable(),
  /** Área máxima analizable en una operación, km². */
  maxAnalysisAreaKm2: z.number(),
  /** Filas máximas por exportación. */
  maxExportRows: z.number(),
  /** Máximo de resultados por consulta de la API. */
  maxQueryLimit: z.number(),
  /** Peticiones por minuto. */
  rateLimitPerMinute: z.number(),
  /** Teselas por día (anti-scraping). */
  tilesPerDay: z.number(),
  /** Usuarios incluidos en la organización. */
  seats: z.number(),
  canExport: z.boolean(),
  canUseAdvancedSearch: z.boolean(),
  canUseAreaAnalysis: z.boolean(),
  canUseSuitability: z.boolean(),
  canUseLocationIntel: z.boolean(),
  canUseChangeDetection: z.boolean(),
  canUseApi: z.boolean(),
  canUseWhiteLabel: z.boolean(),
  canUseAlerts: z.boolean(),
  canUseBulk: z.boolean(),
  /** Marca de agua en mapas e informes. */
  watermark: z.boolean(),
  exportFormats: z.array(z.enum(['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml'])),
});
export type Entitlements = z.infer<typeof EntitlementsSchema>;

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  audience: string;
  /** Precio mensual en COP; 0 para gratis, null para cotización. */
  monthlyPriceCop: number | null;
  /** Precio por unidad (informe) en COP, si aplica. */
  unitPriceCop: number | null;
  /** Créditos que se recargan al inicio de cada periodo. */
  monthlyCredits: number;
  entitlements: Entitlements;
  highlights: string[];
}

const base: Entitlements = {
  detailedQueriesPerMonth: 3,
  reportsPerMonth: 0,
  maxAnalysisAreaKm2: 1,
  maxExportRows: 0,
  maxQueryLimit: 50,
  /*
   * 90, no 30: una sola pantalla de la interfaz hace entre 4 y 6 peticiones (ficha,
   * contexto, historial, cobertura…) y con 30 por minuto un usuario gratuito que abría
   * seis pantallas seguidas recibía 429 en la séptima. Lo midió el recorrido automatizado
   * (ADR-013). El límite protege de abuso, no de usar el producto. Pro sube a 240 para que
   * la escalera siga creciendo (los tests lo exigen).
   */
  rateLimitPerMinute: 90,
  tilesPerDay: 20_000,
  seats: 1,
  canExport: false,
  canUseAdvancedSearch: false,
  canUseAreaAnalysis: false,
  canUseSuitability: false,
  canUseLocationIntel: false,
  canUseChangeDetection: false,
  canUseApi: false,
  canUseWhiteLabel: false,
  canUseAlerts: false,
  canUseBulk: false,
  watermark: true,
  exportFormats: [],
};

export const PLANS: Record<PlanCode, PlanDefinition> = {
  free: {
    code: 'free',
    name: 'Gratis',
    audience: 'Curiosos y primer contacto',
    monthlyPriceCop: 0,
    unitPriceCop: null,
    monthlyCredits: 0,
    entitlements: base,
    highlights: [
      'Mapa nacional y capas de contexto',
      'Ficha básica de predio',
      '3 consultas detalladas al mes',
      'Sin exportación',
    ],
  },
  per_report: {
    code: 'per_report',
    name: 'Pago por informe',
    audience: 'Persona natural que evalúa un predio',
    monthlyPriceCop: 0,
    unitPriceCop: 45_000,
    monthlyCredits: 0,
    entitlements: {
      ...base,
      detailedQueriesPerMonth: 10,
      maxAnalysisAreaKm2: 1,
      canExport: true,
      exportFormats: ['pdf'],
      watermark: false,
    },
    highlights: [
      'Un Informe Territorial de Predio completo en PDF',
      'Fuentes, fechas de corte y advertencias legales incluidas',
      'Verificable por QR',
    ],
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    audience: 'Avaluadores, arquitectos, independientes',
    monthlyPriceCop: 190_000,
    unitPriceCop: null,
    monthlyCredits: 200,
    entitlements: {
      ...base,
      detailedQueriesPerMonth: null,
      reportsPerMonth: 20,
      maxAnalysisAreaKm2: 25,
      maxExportRows: 20_000,
      maxQueryLimit: 500,
      rateLimitPerMinute: 240,
      tilesPerDay: 200_000,
      canExport: true,
      canUseAdvancedSearch: true,
      canUseAreaAnalysis: true,
      canUseSuitability: true,
      watermark: false,
      exportFormats: ['pdf', 'xlsx', 'csv', 'geojson', 'kml'],
    },
    highlights: [
      'Buscador avanzado de predios',
      'Analizador de zona',
      'Aptitud de terreno explicada',
      '20 informes al mes y exportación',
    ],
  },
  business: {
    code: 'business',
    name: 'Business',
    audience: 'Inmobiliarias, constructoras, retail',
    monthlyPriceCop: 1_200_000,
    unitPriceCop: null,
    monthlyCredits: 2000,
    entitlements: {
      ...base,
      detailedQueriesPerMonth: null,
      reportsPerMonth: 200,
      maxAnalysisAreaKm2: 500,
      maxExportRows: 250_000,
      maxQueryLimit: 1000,
      rateLimitPerMinute: 600,
      tilesPerDay: 2_000_000,
      seats: 5,
      canExport: true,
      canUseAdvancedSearch: true,
      canUseAreaAnalysis: true,
      canUseSuitability: true,
      canUseLocationIntel: true,
      canUseChangeDetection: true,
      canUseApi: true,
      canUseWhiteLabel: true,
      canUseAlerts: true,
      canUseBulk: true,
      watermark: false,
      exportFormats: ['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml'],
    },
    highlights: [
      '5 usuarios',
      'Localización de negocio con pesos editables',
      'Cambio territorial y alertas',
      'Marca blanca y lotes de informes',
    ],
  },
  api: {
    code: 'api',
    name: 'API',
    audience: 'Desarrolladores y proptech',
    monthlyPriceCop: 250_000,
    unitPriceCop: null,
    monthlyCredits: 5000,
    entitlements: {
      ...base,
      detailedQueriesPerMonth: null,
      maxAnalysisAreaKm2: 100,
      maxExportRows: 100_000,
      maxQueryLimit: 1000,
      rateLimitPerMinute: 300,
      tilesPerDay: 1_000_000,
      canExport: true,
      canUseAdvancedSearch: true,
      canUseAreaAnalysis: true,
      canUseSuitability: true,
      canUseApi: true,
      watermark: false,
      exportFormats: ['geojson', 'csv', 'xlsx'],
    },
    highlights: ['GeoAPI con llaves y cuotas', 'Sandbox gratuito', 'Escalones por consumo'],
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise / Institucional',
    audience: 'Bancos, aseguradoras, entidades públicas',
    monthlyPriceCop: null,
    unitPriceCop: null,
    monthlyCredits: 0,
    entitlements: {
      ...base,
      detailedQueriesPerMonth: null,
      reportsPerMonth: null,
      maxAnalysisAreaKm2: 2000,
      maxExportRows: 5_000_000,
      maxQueryLimit: 1000,
      rateLimitPerMinute: 3000,
      tilesPerDay: 50_000_000,
      seats: 50,
      canExport: true,
      canUseAdvancedSearch: true,
      canUseAreaAnalysis: true,
      canUseSuitability: true,
      canUseLocationIntel: true,
      canUseChangeDetection: true,
      canUseApi: true,
      canUseWhiteLabel: true,
      canUseAlerts: true,
      canUseBulk: true,
      watermark: false,
      exportFormats: ['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml'],
    },
    highlights: ['SLA', 'SSO', 'Despliegue dedicado', 'Integraciones y estudios a medida'],
  },
};

/** Costo en créditos de cada operación costosa. */
export const CREDIT_COST = {
  report_summary: 5,
  report_full: 15,
  report_technical: 25,
  area_analysis_large: 10,
  location_intel: 20,
  bulk_export: 15,
  change_compare: 8,
  ai_ask: 1,
} as const;
export type CreditOperation = keyof typeof CREDIT_COST;

export function entitlementsFor(plan: PlanCode): Entitlements {
  return PLANS[plan].entitlements;
}

/**
 * Permisos de quien opera la plataforma (rol `admin`), sin límites comerciales.
 *
 * Un administrador no es un cliente: no tiene a quién comprarle un plan superior, y pedirle
 * que lo haga para revisar su propio producto no tiene sentido. Aquí no hay cupos, ni marca
 * de agua, ni funciones cerradas.
 *
 * El ÚNICO tope que se conserva es `maxAnalysisAreaKm2`, y no por comercial: analizar de una
 * sola vez un polígono mayor que ese techo cruza millones de geometrías en una petición
 * síncrona y tumbaría el servidor para todos. Es una barrera técnica y aplica a cualquiera,
 * incluido quien opera la plataforma; para más superficie está el análisis por municipios.
 */
export function entitlementsForPlatformAdmin(): Entitlements {
  return {
    ...PLANS.enterprise.entitlements,
    detailedQueriesPerMonth: null,
    reportsPerMonth: null,
    maxAnalysisAreaKm2: AREA_ANALYSIS_HARD_LIMIT_KM2,
    maxExportRows: Number.MAX_SAFE_INTEGER,
    maxQueryLimit: MAX_PAGE_SIZE,
    rateLimitPerMinute: 6000,
    tilesPerDay: Number.MAX_SAFE_INTEGER,
    seats: Number.MAX_SAFE_INTEGER,
    canExport: true,
    canUseAdvancedSearch: true,
    canUseAreaAnalysis: true,
    canUseSuitability: true,
    canUseLocationIntel: true,
    canUseChangeDetection: true,
    canUseApi: true,
    canUseWhiteLabel: true,
    canUseAlerts: true,
    canUseBulk: true,
    watermark: false,
    exportFormats: ['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml'],
  };
}
