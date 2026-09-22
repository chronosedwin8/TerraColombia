import { describe, expect, it } from 'vitest';
import { fold, searchPlaces, type PlaceOption } from './place-search';

/** Municipios reales, en el orden en que los devuelve el API (departamento, luego nombre). */
const MUNICIPIOS: PlaceOption[] = [
  { code: '08758', name: 'Soledad', context: 'Atlántico' },
  { code: '13468', name: 'Santa Cruz de Mompox', context: 'Bolívar' },
  { code: '44001', name: 'Riohacha', context: 'La Guajira' },
  { code: '44430', name: 'Maicao', context: 'La Guajira' },
  { code: '70418', name: 'Los Palmitos', context: 'Sucre' },
  { code: '76001', name: 'Cali', context: 'Valle del Cauca' },
  { code: '76520', name: 'Palmira', context: 'Valle del Cauca' },
];

describe('searchPlaces', () => {
  it('pone primero lo que EMPIEZA por lo escrito', () => {
    // El caso que motivó el cambio: «Palmi» ofrecía Los Palmitos antes que Palmira.
    const r = searchPlaces(MUNICIPIOS, 'Palmi');
    expect(r[0]?.name).toBe('Palmira');
    expect(r.map((o) => o.name)).toContain('Los Palmitos');
  });

  it('encuentra por cualquier palabra del nombre', () => {
    expect(searchPlaces(MUNICIPIOS, 'Mompox')[0]?.code).toBe('13468');
  });

  it('ignora tildes y mayúsculas en los dos sentidos', () => {
    expect(searchPlaces(MUNICIPIOS, 'BOLIVAR').map((o) => o.code)).toContain('13468');
    expect(searchPlaces([{ code: '27', name: 'Chocó' }], 'choco')).toHaveLength(1);
  });

  it('sigue sirviendo a quien sí se sabe el código', () => {
    expect(searchPlaces(MUNICIPIOS, '76520')[0]?.name).toBe('Palmira');
    expect(searchPlaces(MUNICIPIOS, '44')[0]?.context).toBe('La Guajira');
  });

  it('busca también por departamento', () => {
    const r = searchPlaces(MUNICIPIOS, 'Guajira');
    expect(r.map((o) => o.name)).toEqual(['Maicao', 'Riohacha']);
  });

  it('sin texto devuelve la lista tal cual, recortada', () => {
    expect(searchPlaces(MUNICIPIOS, '', 3)).toHaveLength(3);
    expect(searchPlaces(MUNICIPIOS, '   ')[0]?.name).toBe('Soledad');
  });

  it('no inventa resultados cuando no hay coincidencia', () => {
    expect(searchPlaces(MUNICIPIOS, 'Madrid España')).toEqual([]);
  });
});

describe('fold', () => {
  it('quita tildes y espacios de los extremos', () => {
    expect(fold('  Chocó ')).toBe('choco');
    expect(fold('Bogotá, D.C.')).toBe('bogota, d.c.');
  });
});
