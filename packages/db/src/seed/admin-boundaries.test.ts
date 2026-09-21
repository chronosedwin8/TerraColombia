import { describe, expect, it } from 'vitest';
import { normalizeDivipolaCode } from './admin-boundaries.js';

/**
 * Regla 2 de CLAUDE.md: los códigos vienen de la fuente y no se maquillan. Estas pruebas
 * fijan las dos rarezas reales de la capa del IGAC —el área en litigio con código todo ceros
 * y los códigos sin el cero a la izquierda— para que un cambio futuro no las convierta en
 * silencio en un municipio inventado.
 */
describe('normalizeDivipolaCode', () => {
  it('rellena con ceros a la izquierda hasta la longitud DIVIPOLA', () => {
    expect(normalizeDivipolaCode('5001', 5)).toBe('05001');
    expect(normalizeDivipolaCode('5', 2)).toBe('05');
  });

  it('respeta los códigos que ya vienen completos', () => {
    expect(normalizeDivipolaCode('05001', 5)).toBe('05001');
    expect(normalizeDivipolaCode('11', 2)).toBe('11');
  });

  it('descarta el área en litigio Cauca-Huila, que no es entidad DIVIPOLA', () => {
    expect(normalizeDivipolaCode('00000', 5)).toBeNull();
    expect(normalizeDivipolaCode('00', 2)).toBeNull();
  });

  it('descarta lo que no es un código utilizable en vez de adivinar', () => {
    expect(normalizeDivipolaCode(null, 5)).toBeNull();
    expect(normalizeDivipolaCode('', 5)).toBeNull();
    expect(normalizeDivipolaCode('ABCDE', 5)).toBeNull();
    expect(normalizeDivipolaCode('050011', 5)).toBeNull();
  });

  it('tolera espacios alrededor, que es como los devuelven algunas capas', () => {
    expect(normalizeDivipolaCode(' 05001 ', 5)).toBe('05001');
  });
});
