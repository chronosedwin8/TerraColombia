/**
 * Textos legales obligatorios (PLAN.md §2 y §11). Se incluyen íntegros en cada informe
 * y en la sección de fuentes de la ficha. No editar sin revisión legal.
 */

export const DISCLAIMERS = {
  notCertificate:
    'Este documento no es un certificado catastral ni un certificado de tradición y libertad. No acredita propiedad ni linderos.',
  notAppraisal:
    'Este documento no es un avalúo comercial. El avalúo catastral que se reporta, cuando existe, es un valor fiscal determinado por la autoridad catastral y habitualmente difiere del valor de mercado.',
  notUrbanNorm:
    'Este documento no es un concepto de norma urbanística. Los usos y aprovechamientos permitidos los determina el Plan de Ordenamiento Territorial y los actos administrativos del municipio. Consulte la Secretaría de Planeación municipal.',
  notTitleStudy:
    'Este documento no reemplaza un estudio de títulos ni una asesoría jurídica. Antes de cualquier transacción consulte a un abogado y verifique el folio de matrícula inmobiliaria en la Oficina de Registro de Instrumentos Públicos.',
  hazardScale:
    'Las capas de amenaza provienen de estudios a escala regional o nacional. Sirven para orientar decisiones preliminares y no sustituyen los estudios de detalle exigidos para licencias de construcción o urbanización.',
  coverage:
    'La cobertura de datos catastrales depende del gestor catastral de cada municipio. Cuando un municipio no es jurisdicción del IGAC o no publica datos abiertos, este documento lo indica explícitamente y no infiere información.',
  dataFreshness:
    'Todo dato se presenta con su fecha de corte. Los procesos catastrales, ambientales y de ordenamiento cambian con el tiempo; verifique la vigencia antes de decidir.',
  noPersonalData:
    'Este producto no procesa ni entrega datos personales de propietarios u ocupantes. La información es de carácter territorial.',
} as const;

export const ALL_DISCLAIMERS = Object.values(DISCLAIMERS);

export const LICENSES = {
  CC_BY_SA_4: {
    id: 'CC-BY-SA-4.0',
    name: 'Creative Commons Atribución-CompartirIgual 4.0 Internacional',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
    shareAlike: true,
  },
  CC_BY_4: {
    id: 'CC-BY-4.0',
    name: 'Creative Commons Atribución 4.0 Internacional',
    url: 'https://creativecommons.org/licenses/by/4.0/deed.es',
    shareAlike: false,
  },
  ODBL: {
    id: 'ODbL-1.0',
    name: 'Open Database License 1.0 (OpenStreetMap)',
    url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    shareAlike: true,
  },
  GOV_CO_OPEN: {
    id: 'datos-abiertos-co',
    name: 'Datos Abiertos del Estado colombiano (Ley 1712 de 2014)',
    url: 'https://www.datos.gov.co/',
    shareAlike: false,
  },
  UNKNOWN: {
    id: 'NO_DISPONIBLE',
    name: 'Licencia no declarada por la fuente',
    url: null,
    shareAlike: false,
  },
} as const;
export type LicenseId = (typeof LICENSES)[keyof typeof LICENSES]['id'];

/**
 * Datasets con cláusula ShareAlike: deben quedar separados de los indicadores propios
 * en base de datos y en cualquier exportación (PLAN.md §2).
 */
export function isShareAlike(licenseId: string): boolean {
  return Object.values(LICENSES).some((l) => l.id === licenseId && l.shareAlike);
}

export const LEGAL_PENDING = [
  'Concepto de abogado sobre el alcance de la cláusula ShareAlike de CC BY-SA 4.0 en bases derivadas y en la redistribución vía API. Bloquea el lanzamiento comercial.',
  'Política de tratamiento de datos (Ley 1581/2012) publicada y aceptada en registro.',
  'Revisión de los textos de descargo por abogado antes del lanzamiento.',
] as const;
