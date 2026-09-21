/**
 * Glosario en español claro. Cada término técnico que aparece en la UI debe estar aquí
 * (principio de "todo se explica", PLAN.md §10.1). `plain` es la explicación para una
 * persona sin formación técnica; `detail` amplía; `source` dice de dónde sale el concepto.
 */
export interface GlossaryEntry {
  id: string;
  term: string;
  plain: string;
  detail?: string;
  source?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'npn',
    term: 'Número Predial Nacional (NPN)',
    plain:
      'Es la "cédula" del predio: un código de 30 dígitos que lo identifica de forma única en todo el país.',
    detail:
      'Cada tramo del código dice algo: departamento, municipio, si es urbano o rural, sector, comuna, barrio, manzana o vereda, el terreno, y si es una unidad dentro de un edificio, también el piso y la unidad. También existe un código anterior de 20 dígitos que seguimos aceptando en las búsquedas.',
    source: 'IGAC, Resolución de nomenclatura predial',
  },
  {
    id: 'avaluo_catastral',
    term: 'Avalúo catastral',
    plain:
      'Es el valor que la autoridad catastral le asigna al predio para calcular el impuesto predial. No es el precio de venta.',
    detail:
      'Suele estar por debajo del valor comercial y se actualiza por procesos catastrales, no por el mercado. Para conocer el valor de venta se necesita un avalúo comercial hecho por un avaluador registrado.',
    source: 'IGAC',
  },
  {
    id: 'destino_economico',
    term: 'Destino económico',
    plain: 'La clasificación que usa el catastro para decir a qué se dedica el predio.',
    detail:
      'Ejemplos: habitacional, comercial, industrial, lote urbanizable, agropecuario, institucional. Es una clasificación fiscal y descriptiva; no autoriza usos. Lo que se puede construir o hacer lo define el POT del municipio.',
    source: 'IGAC',
  },
  {
    id: 'zona_homogenea_fisica',
    term: 'Zona homogénea física',
    plain:
      'Un área donde los predios se parecen entre sí en cosas físicas: topografía, servicios públicos, vías, tipo de suelo.',
    source: 'IGAC',
  },
  {
    id: 'zona_homogenea_geoeconomica',
    term: 'Zona homogénea geoeconómica',
    plain:
      'Un área a la que el catastro le asigna un mismo valor de referencia por metro cuadrado de terreno.',
    detail:
      'Sirve para calcular avalúos catastrales de forma masiva. De nuevo: es valor catastral, no precio de mercado.',
    source: 'IGAC',
  },
  {
    id: 'vocacion_uso',
    term: 'Vocación de uso del suelo',
    plain: 'Para qué sirve mejor ese suelo según sus características naturales.',
    detail:
      'Por ejemplo: agrícola, ganadera, forestal, de conservación. La determina el estudio de suelos del IGAC a partir del clima, la pendiente, la profundidad del suelo y su fertilidad.',
    source: 'IGAC, Subdirección de Agrología',
  },
  {
    id: 'capacidad_uso',
    term: 'Capacidad de uso (clase agrológica)',
    plain:
      'Una nota de 1 a 8 sobre qué tan apto es el suelo para cultivos: 1 es el mejor, 8 casi no admite uso productivo.',
    detail:
      'Las clases 1 a 4 permiten cultivos con distinto nivel de limitaciones; 5 a 7 son más aptas para pastos o bosque; la 8 se destina a conservación.',
    source: 'IGAC, Subdirección de Agrología',
  },
  {
    id: 'conflicto_uso',
    term: 'Conflicto de uso del suelo',
    plain: 'Cuando lo que se hace hoy en el terreno no coincide con lo que el suelo aguanta.',
    detail:
      'Puede ser sobreutilización (se le exige más de lo que puede dar, con riesgo de erosión) o subutilización (se le saca menos de lo que podría).',
    source: 'IGAC / UPRA',
  },
  {
    id: 'pot',
    term: 'POT (Plan de Ordenamiento Territorial)',
    plain:
      'La norma del municipio que dice qué se puede construir y hacer en cada parte de su territorio.',
    detail:
      'Define clasificación del suelo (urbano, de expansión, rural, suburbano, de protección), usos permitidos, alturas e índices de construcción. No existe un repositorio nacional completo, así que para muchos municipios hay que consultar directamente a Planeación municipal.',
    source: 'Municipio · Ley 388 de 1997',
  },
  {
    id: 'gestor_catastral',
    term: 'Gestor catastral',
    plain: 'La entidad encargada de mantener el catastro de un municipio.',
    detail:
      'En la mayoría del país es el IGAC. Algunas ciudades y departamentos tienen catastro propio (por ejemplo Bogotá, Medellín, Cali, Barranquilla, Antioquia) y publican sus datos por separado o no los publican. Cuando un municipio no es del IGAC, aquí lo decimos con claridad.',
    source: 'Ley 1955 de 2019, Decreto 148 de 2020',
  },
  {
    id: 'h3',
    term: 'Celda H3',
    plain:
      'Un hexágono de una rejilla que cubre todo el país y nos permite comparar zonas del mismo tamaño.',
    detail:
      'Usamos hexágonos de unos 0,7 km² y de unos 0,1 km². Al medir población, comercio o accesibilidad por celda, las comparaciones son justas aunque los barrios tengan formas distintas.',
    source: 'Rejilla H3 (Uber), implementación abierta',
  },
  {
    id: 'amenaza',
    term: 'Amenaza (por ejemplo, de movimiento en masa)',
    plain: 'La probabilidad de que en ese sitio ocurra un fenómeno natural peligroso.',
    detail:
      'Amenaza no es lo mismo que riesgo: el riesgo depende además de qué y quién está expuesto y de qué tan vulnerable es. Las escalas nacionales (1:100.000) sirven para orientar, no para decidir una licencia de construcción; para eso se necesita un estudio de detalle.',
    source: 'SGC, IDEAM',
  },
  {
    id: 'area_protegida',
    term: 'Área protegida (RUNAP)',
    plain:
      'Un área con protección legal ambiental donde los usos están restringidos por norma.',
    source: 'Parques Nacionales Naturales, RUNAP',
  },
  {
    id: 'territorio_etnico',
    term: 'Territorio étnico',
    plain:
      'Resguardos indígenas y territorios colectivos de comunidades negras: tienen propiedad colectiva y reglas propias.',
    detail:
      'En estos territorios no aplica la compraventa ordinaria de predios y hay que consultar a la autoridad étnica correspondiente.',
    source: 'ANT, Ministerio del Interior',
  },
  {
    id: 'frontera_agricola',
    term: 'Frontera agrícola nacional',
    plain:
      'El límite hasta donde el país considera que se puede desarrollar actividad agropecuaria.',
    source: 'UPRA',
  },
  {
    id: 'divipola',
    term: 'DIVIPOLA',
    plain:
      'El listado oficial de códigos de departamentos y municipios de Colombia. Por ejemplo, 08001 es Barranquilla.',
    source: 'DANE',
  },
  {
    id: 'mgn',
    term: 'Marco Geoestadístico Nacional (MGN)',
    plain:
      'La división del país en piezas pequeñas (manzanas y secciones) que el DANE usa para publicar datos de población.',
    source: 'DANE',
  },
  {
    id: 'snapshot',
    term: 'Fecha de corte',
    plain: 'El día al que corresponden los datos que estás viendo.',
    detail:
      'La base catastral abierta del IGAC se publica por cortes; cuando comparas dos cortes puedes ver qué cambió. Todo dato que mostramos dice su fecha de corte.',
  },
  {
    id: 'pendiente',
    term: 'Pendiente',
    plain: 'Qué tan inclinado está el terreno, en porcentaje.',
    detail:
      'Una pendiente del 10 % sube 10 metros por cada 100 de recorrido horizontal. Por encima de 25 % construir encarece mucho; por encima de 45 % suele haber restricción ambiental.',
    source: 'Modelo digital de elevación Copernicus 30 m',
  },
  {
    id: 'isocrona',
    term: 'Isócrona',
    plain: 'El área a la que se puede llegar en un tiempo dado, caminando o en carro.',
  },
  {
    id: 'englobe',
    term: 'Englobe y desenglobe',
    plain:
      'Englobe es unir varios predios en uno; desenglobe es partir uno en varios. Ambos cambian el NPN.',
    source: 'IGAC',
  },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(
  GLOSSARY.map((g) => [g.id, g]),
);
