import { describe, expect, it } from 'vitest';
import { REDACTION_TOKENS, hasPii, redact, redactForLog, redactObject } from '../redact.js';

describe('redact', () => {
  it('elimina correos', () => {
    const r = redact('Escríbeme a juan.perez@example.com por el lote');
    expect(r.text).toContain(REDACTION_TOKENS.email);
    expect(r.text).not.toContain('juan.perez@example.com');
    expect(r.findings).toEqual([{ kind: 'email', count: 1 }]);
  });

  it('elimina celulares colombianos con y sin indicativo', () => {
    expect(redact('mi celular es 3151234567').text).toContain(REDACTION_TOKENS.phone);
    expect(redact('llámame al +57 315 123 4567').text).toContain(REDACTION_TOKENS.phone);
    expect(redact('fijo 601 2345678').text).toContain(REDACTION_TOKENS.phone);
  });

  it('elimina la cédula cuando viene identificada', () => {
    const r = redact('El titular con cédula 1.234.567.890 pregunta por el predio');
    expect(r.text).toContain(REDACTION_TOKENS.id_document);
    expect(r.text).not.toContain('1.234.567.890');
  });

  it('elimina el NIT', () => {
    const r = redact('La empresa NIT 900123456-1 compró el lote');
    expect(r.text).not.toContain('900123456-1');
    expect(r.findings.some((f) => f.kind === 'nit' || f.kind === 'id_document')).toBe(true);
  });

  it('elimina nombres propios solo cuando hay un documento en el texto', () => {
    const conDocumento = redact(
      'El propietario Juan Carlos Pérez con cédula 79123456 vendió el predio',
    );
    expect(conDocumento.text).toContain(REDACTION_TOKENS.person_name);
    expect(conDocumento.text).not.toContain('Juan Carlos Pérez');

    // Sin documento, un nombre propio puede ser un lugar o un colegio: no se toca.
    const sinDocumento = redact('El Colegio San José queda en el barrio La Magdalena');
    expect(sinDocumento.text).toBe('El Colegio San José queda en el barrio La Magdalena');
    expect(sinDocumento.redacted).toBe(false);
  });

  it('nunca toca el código predial de 30 dígitos', () => {
    const npn = '086730100000000120001000000000';
    const r = redact(`Consulta el predio ${npn} por favor`);
    expect(r.text).toContain(npn);
    expect(r.redacted).toBe(false);
  });

  it('conserva el código predial aunque el texto sí traiga datos personales', () => {
    const npn = '086730100000000120001000000000';
    const r = redact(`El predio ${npn} lo consulta el titular con cédula 79123456`);
    expect(r.text).toContain(npn);
    expect(r.text).toContain(REDACTION_TOKENS.id_document);
  });

  it('no destruye cifras del territorio', () => {
    const texto = 'El predio tiene 12345678 m² y un avalúo de 450.000.000 pesos';
    expect(redact(texto).text).toBe(texto);
  });

  it('no registra el valor eliminado, solo el recuento', () => {
    const r = redact('correo a@b.co y otro c@d.co');
    expect(r.findings).toEqual([{ kind: 'email', count: 2 }]);
    expect(JSON.stringify(r.findings)).not.toContain('a@b.co');
  });

  it('elimina direcciones con apartamento', () => {
    const r = redact('Vive en la Calle 45 # 12-34 Apto 502');
    expect(r.text).toContain(REDACTION_TOKENS.address);
  });
});

describe('hasPii', () => {
  it('detecta y descarta correctamente', () => {
    expect(hasPii('mi correo es a@b.com')).toBe(true);
    expect(hasPii('¿cuál es la pendiente de este lote?')).toBe(false);
  });
});

describe('redactForLog y redactObject', () => {
  it('limpia textos anidados', () => {
    const out = redactObject({
      question: 'escríbeme a a@b.com',
      nested: { list: ['teléfono 3151234567'] },
      area_m2: 450,
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain('a@b.com');
    expect(JSON.stringify(out)).not.toContain('3151234567');
    expect(out.area_m2).toBe(450);
  });

  it('elimina el valor completo de las claves sospechosas', () => {
    const out = redactObject({ propietario: 'Cualquier Cosa', npn: '08573' }) as Record<
      string,
      unknown
    >;
    expect(out.propietario).toBe(REDACTION_TOKENS.person_name);
    expect(out.npn).toBe('08573');
  });

  it('no revienta con referencias profundas', () => {
    let deep: unknown = 'a@b.com';
    for (let i = 0; i < 20; i += 1) deep = { next: deep };
    expect(() => redactObject(deep)).not.toThrow();
  });

  it('redactForLog devuelve solo el texto', () => {
    expect(redactForLog('correo a@b.com')).toBe(`correo ${REDACTION_TOKENS.email}`);
  });
});
