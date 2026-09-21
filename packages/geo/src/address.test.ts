import { describe, expect, it } from 'vitest';
import {
  addressSearchVariants,
  foldText,
  hasComplement,
  looksLikeAddress,
  normalizeAddress,
  parseAddress,
} from './address.js';

describe('foldText', () => {
  it('quita tildes y pasa a mayúsculas', () => {
    expect(foldText('Bogotá D.C.')).toBe('BOGOTA D.C.');
    expect(foldText('Chocó')).toBe('CHOCO');
    expect(foldText('Güicán')).toBe('GUICAN');
  });

  it('colapsa espacios repetidos', () => {
    expect(foldText('  CALLE    10  ')).toBe('CALLE 10');
  });
});

describe('normalizeAddress', () => {
  it('expande las abreviaturas de carrera', () => {
    for (const input of ['Cra 45 # 12-34', 'CR 45 # 12-34', 'Kra 45 # 12-34', 'KR 45 #12-34']) {
      expect(normalizeAddress(input)).toContain('CARRERA 45');
    }
  });

  it('expande las abreviaturas de calle', () => {
    for (const input of ['Cl 10 # 20-30', 'CLL 10 # 20-30', 'Calle 10 #20-30']) {
      expect(normalizeAddress(input)).toContain('CALLE 10');
    }
  });

  it('normaliza los marcadores de número a #', () => {
    const variants = [
      'Carrera 45 No 12-34',
      'Carrera 45 N° 12-34',
      'Carrera 45 Nro 12-34',
      'Carrera 45 numero 12-34',
      'Carrera 45 # 12-34',
    ];
    const normalized = variants.map(normalizeAddress);
    // Todas deben producir exactamente la misma forma canónica.
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('CARRERA 45 # 12-34');
  });

  it('une el sufijo alfabético al número de vía', () => {
    expect(normalizeAddress('Calle 45 A # 12-34')).toContain('CALLE 45A');
  });

  it('conserva BIS como palabra', () => {
    expect(normalizeAddress('Carrera 7 BIS # 10-20')).toContain('BIS');
  });

  it('reconoce el cuadrante al final', () => {
    expect(normalizeAddress('Calle 10 # 20-30 sur')).toContain('SUR');
  });

  it('pega el guion entre número secundario y placa aunque venga con espacios', () => {
    // En Colombia se escribe indistintamente "12-34", "12 - 34" y "12 -34".
    expect(normalizeAddress('Carrera 45 # 12 - 34')).toBe('CARRERA 45 # 12-34');
    expect(normalizeAddress('Carrera 45 # 12 -34')).toBe('CARRERA 45 # 12-34');
    expect(normalizeAddress('Carrera 45 # 12- 34')).toBe('CARRERA 45 # 12-34');
  });

  it('devuelve cadena vacía ante entrada vacía', () => {
    expect(normalizeAddress('')).toBe('');
  });
});

describe('parseAddress', () => {
  it('descompone una dirección completa', () => {
    const p = parseAddress('Cra 45 # 12-34 Sur');
    expect(p.wayType).toBe('CARRERA');
    expect(p.wayNumber).toBe('45');
    expect(p.crossNumber).toBe('12');
    expect(p.plate).toBe('34');
    expect(p.quadrant).toBe('SUR');
  });

  it('produce el mismo resultado para todas las escrituras equivalentes', () => {
    const a = parseAddress('Cra 45 # 12-34 Sur');
    const b = parseAddress('CARRERA 45 No 12 - 34 SUR');
    const c = parseAddress('kr 45 nro 12-34 sur');
    expect(a.canonical).toBe(b.canonical);
    expect(b.canonical).toBe(c.canonical);
  });

  it('captura el complemento cuando existe', () => {
    const p = parseAddress('Calle 10 # 20-30 APTO 502');
    expect(p.complement).toContain('APTO');
  });

  it('no inventa tramos cuando la dirección es parcial', () => {
    const p = parseAddress('Carrera 45');
    expect(p.wayType).toBe('CARRERA');
    expect(p.wayNumber).toBe('45');
    expect(p.crossNumber).toBeNull();
    expect(p.plate).toBeNull();
  });

  it('con texto que no es dirección deja los tramos en null', () => {
    const p = parseAddress('Vereda El Carmen');
    expect(p.wayType).toBeNull();
    expect(p.wayNumber).toBeNull();
  });

  it('maneja diagonal y transversal', () => {
    expect(parseAddress('Dg 25 # 8-15').wayType).toBe('DIAGONAL');
    expect(parseAddress('Tv 33 # 4-56').wayType).toBe('TRANSVERSAL');
  });
});

describe('addressSearchVariants', () => {
  it('genera la forma canónica, la abreviada y la de solo números', () => {
    const variants = addressSearchVariants('Cra 45 # 12-34');
    expect(variants).toContain('CARRERA 45 # 12-34');
    expect(variants.some((v) => v.startsWith('CR '))).toBe(true);
    expect(variants).toContain('45 12 34');
  });

  it('no repite variantes', () => {
    const variants = addressSearchVariants('Calle 10 # 20-30');
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe('looksLikeAddress', () => {
  it('reconoce direcciones con # y con tipo de vía', () => {
    expect(looksLikeAddress('Cra 45 # 12-34')).toBe(true);
    expect(looksLikeAddress('Calle 10 20 30')).toBe(true);
  });

  it('no confunde un nombre de municipio con una dirección', () => {
    expect(looksLikeAddress('Soledad')).toBe(false);
    expect(looksLikeAddress('Bogotá D.C.')).toBe(false);
  });
});

describe('hasComplement', () => {
  it('detecta apartamento, interior y torre', () => {
    expect(hasComplement('Calle 10 # 20-30 apto 502')).toBe(true);
    expect(hasComplement('Calle 10 # 20-30 int 3')).toBe(true);
    expect(hasComplement('Calle 10 # 20-30 torre B')).toBe(true);
  });

  it('no marca una dirección simple', () => {
    expect(hasComplement('Calle 10 # 20-30')).toBe(false);
  });
});
