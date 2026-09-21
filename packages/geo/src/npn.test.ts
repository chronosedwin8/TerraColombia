import { describe, expect, it } from 'vitest';
import {
  NpnError,
  deptCodeOf,
  explainNpn,
  formatNpnPretty,
  isHorizontalProperty,
  isLegacyNpn,
  isNpnCandidate,
  isRural,
  isUrban,
  matrixNpn,
  muniCodeOf,
  normalizeNpnInput,
  npn20to30,
  parseNpn,
  terrainPrefix,
  validateNpn,
} from './npn.js';

/**
 * NPN de referencia usado en las pruebas: predio urbano completo (no propiedad horizontal)
 * del municipio 08758 (Soledad, Atlántico).
 *   08 758 01 01 01 02 0001 0001 0 00 00 0000
 */
const NPN_URBANO = '087580101010200010001000000000';
/** Unidad de propiedad horizontal: mismo terreno, edificio 01, piso 03, unidad 0402. */
const NPN_PH = '087580101010200010001101030402';
/** Predio rural: zona 02, vereda 0007. */
const NPN_RURAL = '087580201000000070003000000000';

describe('normalizeNpnInput', () => {
  it('quita separadores y espacios', () => {
    expect(normalizeNpnInput(' 08758-0101 0102.0001/0001 0 00 00 0000 ')).toBe(NPN_URBANO);
  });

  it('deja intacto un código ya limpio', () => {
    expect(normalizeNpnInput(NPN_URBANO)).toBe(NPN_URBANO);
  });
});

describe('isNpnCandidate', () => {
  it('acepta 30 y 20 dígitos', () => {
    expect(isNpnCandidate(NPN_URBANO)).toBe(true);
    expect(isNpnCandidate(NPN_URBANO.slice(0, 20))).toBe(true);
  });

  it('rechaza longitudes intermedias y texto', () => {
    expect(isNpnCandidate('123')).toBe(false);
    expect(isNpnCandidate(NPN_URBANO.slice(0, 25))).toBe(false);
    expect(isNpnCandidate('CALLE 10 # 20-30')).toBe(false);
  });
});

describe('parseNpn', () => {
  it('descompone los doce tramos en el orden del plan', () => {
    const p = parseNpn(NPN_URBANO);
    expect(p).toEqual({
      department: '08',
      municipality: '758',
      zone: '01',
      sector: '01',
      commune: '01',
      neighborhood: '02',
      blockOrVereda: '0001',
      parcel: '0001',
      condition: '0',
      building: '00',
      floor: '00',
      unit: '0000',
    });
  });

  it('los tramos concatenados reconstruyen el código original', () => {
    const p = parseNpn(NPN_PH);
    const rebuilt = Object.values(p).join('');
    expect(rebuilt).toBe(NPN_PH);
    expect(rebuilt).toHaveLength(30);
  });

  it('rechaza un código de 20 dígitos explicando que hay que buscarlo por npn_old', () => {
    // Regla 2: el código anterior no es un prefijo del de 30 (el terreno ocupa 21 dígitos),
    // así que no se inventa una conversión.
    expect(() => parseNpn(NPN_URBANO.slice(0, 20))).toThrow(NpnError);
    try {
      parseNpn(NPN_URBANO.slice(0, 20));
    } catch (e) {
      expect((e as Error).message).toContain('npn_old');
    }
  });

  it('lanza NpnError con un mensaje que dice la longitud recibida', () => {
    expect(() => parseNpn('12345')).toThrow(NpnError);
    try {
      parseNpn('12345');
    } catch (e) {
      expect((e as Error).message).toContain('5');
      expect((e as Error).message).toContain('30 dígitos');
    }
  });
});

describe('código anterior de 20 dígitos', () => {
  it('se reconoce como tal', () => {
    expect(isLegacyNpn(NPN_URBANO.slice(0, 20))).toBe(true);
    expect(isLegacyNpn(NPN_URBANO)).toBe(false);
  });

  it('npn20to30 lanza en vez de inventar una conversión', () => {
    // El tramo del terreno en el código nuevo son 21 dígitos, así que el de 20 no es su
    // prefijo. Convertir aritméticamente produciría códigos falsos.
    expect(() => npn20to30(NPN_URBANO.slice(0, 20))).toThrow(NpnError);
  });

  it('validateNpn lo marca como formato anterior y dice cómo resolverlo', () => {
    const r = validateNpn(NPN_URBANO.slice(0, 20));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.isLegacy).toBe(true);
      expect(r.reason).toContain('npn_old');
    }
  });
});

describe('terrainPrefix', () => {
  it('devuelve los 21 dígitos del terreno', () => {
    expect(terrainPrefix(NPN_PH)).toBe(NPN_PH.slice(0, 21));
    expect(terrainPrefix(NPN_PH)).toHaveLength(21);
  });

  it('el prefijo de terreno coincide entre el predio matriz y su unidad de PH', () => {
    expect(terrainPrefix(NPN_PH)).toBe(terrainPrefix(NPN_URBANO));
  });

  it('rechaza un código que no tenga 30 dígitos', () => {
    expect(() => terrainPrefix('123')).toThrow(NpnError);
  });
});

describe('derivados', () => {
  it('extrae municipio y departamento', () => {
    expect(muniCodeOf(NPN_URBANO)).toBe('08758');
    expect(deptCodeOf(NPN_URBANO)).toBe('08');
  });

  it('distingue urbano de rural por el tramo de zona', () => {
    expect(isUrban(NPN_URBANO)).toBe(true);
    expect(isRural(NPN_URBANO)).toBe(false);
    expect(isRural(NPN_RURAL)).toBe(true);
    expect(isUrban(NPN_RURAL)).toBe(false);
  });

  it('detecta propiedad horizontal solo cuando los tramos finales no son neutros', () => {
    expect(isHorizontalProperty(NPN_URBANO)).toBe(false);
    expect(isHorizontalProperty(NPN_PH)).toBe(true);
  });

  it('el NPN matriz de una unidad de PH apunta al mismo terreno', () => {
    expect(matrixNpn(NPN_PH)).toBe(NPN_URBANO);
    // El matriz de un predio completo es él mismo.
    expect(matrixNpn(NPN_URBANO)).toBe(NPN_URBANO);
  });
});

describe('validateNpn', () => {
  it('acepta un código bien formado', () => {
    const r = validateNpn(NPN_URBANO);
    expect(r.ok).toBe(true);
  });

  it('rechaza departamento 00 con un motivo legible', () => {
    const r = validateNpn('007580101010200010001000000000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('departamento');
  });

  it('rechaza municipio 000', () => {
    const r = validateNpn('080000101010200010001000000000');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('municipio');
  });

  it('rechaza una zona distinta de 01 y 02 diciendo cuál llegó', () => {
    const r = validateNpn('087580901010200010001000000000');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('Zona');
      expect(r.reason).toContain('09');
    }
  });

  it('nunca lanza: devuelve el motivo aunque la entrada sea basura', () => {
    const r = validateNpn('no es un npn');
    expect(r.ok).toBe(false);
  });
});

describe('formatNpnPretty', () => {
  it('separa los doce tramos con guiones', () => {
    expect(formatNpnPretty(NPN_URBANO)).toBe('08-758-01-01-01-02-0001-0001-0-00-00-0000');
  });
});

describe('explainNpn', () => {
  it('explica un predio completo diciendo que no es una unidad de PH', () => {
    const text = explainNpn(NPN_URBANO);
    expect(text).toContain('urbano');
    expect(text).toContain('08758');
    expect(text).toContain('predio completo');
  });

  it('explica una unidad de propiedad horizontal con su edificio, piso y unidad', () => {
    const text = explainNpn(NPN_PH);
    expect(text).toContain('propiedad horizontal');
    expect(text).toContain('edificio 01');
    expect(text).toContain('piso 03');
    expect(text).toContain('unidad 0402');
  });

  it('dice "rural" y habla de vereda en un predio rural', () => {
    const text = explainNpn(NPN_RURAL);
    expect(text).toContain('rural');
    expect(text).toContain('vereda');
  });
});
