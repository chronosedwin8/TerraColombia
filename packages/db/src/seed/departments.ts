/**
 * Departamentos de Colombia según DIVIPOLA (DANE).
 * Códigos y nombres oficiales. La geometría no va aquí: se carga del MGN en el ETL.
 * Esta tabla existe para que la base sea usable antes de la primera carga geográfica.
 */
export interface DepartmentSeed {
  code: string;
  name: string;
  region: string;
}

export const DEPARTMENTS: DepartmentSeed[] = [
  { code: '05', name: 'Antioquia', region: 'Andina' },
  { code: '08', name: 'Atlántico', region: 'Caribe' },
  { code: '11', name: 'Bogotá, D.C.', region: 'Andina' },
  { code: '13', name: 'Bolívar', region: 'Caribe' },
  { code: '15', name: 'Boyacá', region: 'Andina' },
  { code: '17', name: 'Caldas', region: 'Andina' },
  { code: '18', name: 'Caquetá', region: 'Amazonía' },
  { code: '19', name: 'Cauca', region: 'Pacífica' },
  { code: '20', name: 'Cesar', region: 'Caribe' },
  { code: '23', name: 'Córdoba', region: 'Caribe' },
  { code: '25', name: 'Cundinamarca', region: 'Andina' },
  { code: '27', name: 'Chocó', region: 'Pacífica' },
  { code: '41', name: 'Huila', region: 'Andina' },
  { code: '44', name: 'La Guajira', region: 'Caribe' },
  { code: '47', name: 'Magdalena', region: 'Caribe' },
  { code: '50', name: 'Meta', region: 'Orinoquía' },
  { code: '52', name: 'Nariño', region: 'Pacífica' },
  { code: '54', name: 'Norte de Santander', region: 'Andina' },
  { code: '63', name: 'Quindío', region: 'Andina' },
  { code: '66', name: 'Risaralda', region: 'Andina' },
  { code: '68', name: 'Santander', region: 'Andina' },
  { code: '70', name: 'Sucre', region: 'Caribe' },
  { code: '73', name: 'Tolima', region: 'Andina' },
  { code: '76', name: 'Valle del Cauca', region: 'Pacífica' },
  { code: '81', name: 'Arauca', region: 'Orinoquía' },
  { code: '85', name: 'Casanare', region: 'Orinoquía' },
  { code: '86', name: 'Putumayo', region: 'Amazonía' },
  { code: '88', name: 'Archipiélago de San Andrés, Providencia y Santa Catalina', region: 'Insular' },
  { code: '91', name: 'Amazonas', region: 'Amazonía' },
  { code: '94', name: 'Guainía', region: 'Amazonía' },
  { code: '95', name: 'Guaviare', region: 'Amazonía' },
  { code: '97', name: 'Vaupés', region: 'Amazonía' },
  { code: '99', name: 'Vichada', region: 'Orinoquía' },
];

/**
 * Gestores catastrales distintos del IGAC, conocidos públicamente (PLAN §2).
 * `coverage_status: 'none'` significa "no tenemos sus predios", que es distinto de
 * "no existen": la UI debe decirlo así.
 *
 * Esta lista es un punto de partida honesto y **debe verificarse y ampliarse** contra la
 * habilitación vigente de gestores catastrales que publica el IGAC/SNR. Los gestores
 * habilitados crecen con el tiempo.
 */
export interface CadastralManagerSeed {
  muniCode: string;
  managerName: string;
  isIgac: boolean;
  managerUrl: string | null;
  notes: string;
}

export const NON_IGAC_MANAGERS: CadastralManagerSeed[] = [
  {
    muniCode: '11001',
    managerName: 'Unidad Administrativa Especial de Catastro Distrital (Bogotá)',
    isIgac: false,
    managerUrl: 'https://www.catastrobogota.gov.co/',
    notes: 'Catastro descentralizado histórico. Publica datos por su propio portal (Mapas Bogotá / IDECA).',
  },
  {
    muniCode: '05001',
    managerName: 'Subsecretaría de Catastro de Medellín',
    isIgac: false,
    managerUrl: 'https://www.medellin.gov.co/',
    notes: 'Catastro descentralizado histórico.',
  },
  {
    muniCode: '76001',
    managerName: 'Subdirección de Catastro de Cali',
    isIgac: false,
    managerUrl: 'https://www.cali.gov.co/',
    notes: 'Catastro descentralizado histórico.',
  },
  {
    muniCode: '08001',
    managerName: 'Gestor catastral de Barranquilla',
    isIgac: false,
    managerUrl: 'https://www.barranquilla.gov.co/',
    notes: 'Gestor catastral habilitado. Verificar disponibilidad de datos abiertos antes de integrar.',
  },
];

/**
 * Antioquia tiene un gestor departamental que cubre buena parte de sus municipios.
 * Se declara a nivel de departamento y el ETL lo expande a los municipios que corresponda
 * una vez verificada la lista oficial; hasta entonces no se marca ningún municipio de más.
 */
export const DEPARTMENT_LEVEL_MANAGERS = [
  {
    deptCode: '05',
    managerName: 'Catastro Antioquia (Gobernación de Antioquia)',
    managerUrl: 'https://www.antioquia.gov.co/',
    notes:
      'Gestor catastral departamental. La lista exacta de municipios bajo su gestión debe verificarse contra la habilitación vigente antes de marcarlos.',
  },
] as const;
