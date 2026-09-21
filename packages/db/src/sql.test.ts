import { describe, expect, it } from 'vitest';
import {
  bboxEnvelope,
  circle,
  geoJson,
  ident,
  join,
  numericRange,
  point,
  raw,
  sql,
  values,
  where,
} from './sql.js';

/**
 * ADR-007: no existe ruta de concatenación de cadenas a SQL. Estas pruebas son la red que
 * lo garantiza: cualquier valor debe salir como `$n`, y cualquier identificador que no sea
 * un nombre válido debe lanzar.
 */

describe('plantilla sql', () => {
  it('convierte los valores en parámetros posicionales', () => {
    const q = sql`SELECT * FROM core.parcel WHERE npn = ${'087580101'} AND zone = ${'01'}`.build();
    expect(q.text).toBe('SELECT * FROM core.parcel WHERE npn = $1 AND zone = $2');
    expect(q.values).toEqual(['087580101', '01']);
  });

  it('numera los parámetros en orden, sin huecos', () => {
    const q = sql`${1} ${2} ${3} ${4}`.build();
    expect(q.text.trim()).toBe('$1 $2 $3 $4');
    expect(q.values).toEqual([1, 2, 3, 4]);
  });

  it('no deja pasar comillas ni punto y coma al texto de la consulta', () => {
    const malicioso = "'; DROP TABLE core.parcel; --";
    const q = sql`SELECT * FROM core.parcel WHERE npn = ${malicioso}`.build();
    expect(q.text).not.toContain('DROP');
    expect(q.text).not.toContain(';');
    expect(q.values[0]).toBe(malicioso);
  });

  it('anida fragmentos renumerando los parámetros', () => {
    const inner = sql`muni_code = ${'08758'}`;
    const q = sql`SELECT * FROM core.parcel WHERE npn = ${'x'} AND ${inner}`.build();
    expect(q.text).toBe('SELECT * FROM core.parcel WHERE npn = $1 AND muni_code = $2');
    expect(q.values).toEqual(['x', '08758']);
  });

  it('anida a dos niveles sin romper la numeración', () => {
    const deep = sql`a = ${1}`;
    const mid = sql`(${deep} AND b = ${2})`;
    const q = sql`WHERE ${mid} OR c = ${3}`.build();
    expect(q.text).toBe('WHERE (a = $1 AND b = $2) OR c = $3');
    expect(q.values).toEqual([1, 2, 3]);
  });

  it('un valor null viaja como parámetro, no como la palabra NULL', () => {
    const q = sql`SET x = ${null}`.build();
    expect(q.text).toBe('SET x = $1');
    expect(q.values).toEqual([null]);
  });
});

describe('ident', () => {
  it('cita el identificador', () => {
    expect(sql`SELECT ${ident('npn')}`.build().text).toBe('SELECT "npn"');
  });

  it('acepta esquema.tabla', () => {
    expect(sql`FROM ${ident('core.parcel')}`.build().text).toBe('FROM "core"."parcel"');
  });

  it('rechaza cualquier cosa que no sea un identificador', () => {
    for (const bad of [
      'npn; DROP TABLE core.parcel',
      'npn"',
      'NPN',
      'npn-old',
      'a.b.c',
      '1npn',
      '',
      'npn OR 1=1',
    ]) {
      expect(() => ident(bad), `debería rechazar "${bad}"`).toThrow();
    }
  });
});

describe('raw', () => {
  it('inserta el fragmento literal', () => {
    expect(sql`ORDER BY ${raw('area_geom_m2 DESC')}`.build().text).toBe(
      'ORDER BY area_geom_m2 DESC',
    );
  });
});

describe('join y where', () => {
  it('une condiciones con AND', () => {
    const q = join([sql`a = ${1}`, sql`b = ${2}`], ' AND ').build();
    expect(q.text).toBe('a = $1 AND b = $2');
    expect(q.values).toEqual([1, 2]);
  });

  it('join sin condiciones devuelve TRUE', () => {
    expect(join([]).build().text).toBe('TRUE');
  });

  it('where desaparece si no hay condiciones', () => {
    expect(where([]).build().text).toBe('');
  });

  it('where antepone la palabra clave cuando sí hay', () => {
    const q = where([sql`a = ${1}`, sql`b = ${2}`]).build();
    expect(q.text).toBe('WHERE a = $1 AND b = $2');
  });
});

describe('values', () => {
  it('produce una lista de parámetros', () => {
    const q = sql`WHERE zone IN (${values(['01', '02'])})`.build();
    expect(q.text).toBe('WHERE zone IN ($1, $2)');
    expect(q.values).toEqual(['01', '02']);
  });

  it('lanza con lista vacía para no generar IN ()', () => {
    expect(() => values([])).toThrow(/vacía/);
  });
});

describe('numericRange', () => {
  it('traduce cada operador', () => {
    const conds = numericRange(raw('area'), { gte: 100, lte: 500 });
    expect(conds).toHaveLength(2);
    const q = join(conds, ' AND ').build();
    expect(q.text).toBe('area >= $1 AND area <= $2');
    expect(q.values).toEqual([100, 500]);
  });

  it('soporta igualdad y estrictos', () => {
    expect(numericRange(raw('a'), { eq: 5 })[0]!.build().text).toBe('a = $1');
    expect(numericRange(raw('a'), { gt: 5 })[0]!.build().text).toBe('a > $1');
    expect(numericRange(raw('a'), { lt: 5 })[0]!.build().text).toBe('a < $1');
  });

  it('un rango vacío no produce condiciones', () => {
    expect(numericRange(raw('a'), {})).toHaveLength(0);
  });
});

describe('constructores geográficos', () => {
  it('geoJson parametriza la geometría, no la interpola', () => {
    const geom = { type: 'Point', coordinates: [-74, 4] };
    const q = geoJson(geom).build();
    expect(q.text).toContain('ST_GeomFromGeoJSON($1)');
    expect(q.values[0]).toBe(JSON.stringify(geom));
  });

  it('point arma un punto con SRID', () => {
    const q = point(-74, 4).build();
    expect(q.text).toBe('ST_SetSRID(ST_MakePoint($1, $2), $3)');
    expect(q.values).toEqual([-74, 4, 4326]);
  });

  it('circle hace el buffer en 9377 y devuelve en 4326', () => {
    const q = circle(-74, 4, 500).build();
    // La medida en metros exige proyectar al CRS de medida del proyecto.
    expect(q.text).toContain('9377');
    expect(q.text).toContain('ST_Buffer');
    expect(q.values).toContain(500);
  });

  it('bboxEnvelope pasa las cuatro coordenadas como parámetros', () => {
    const q = bboxEnvelope([-75, 4, -74, 5]).build();
    expect(q.text).toBe('ST_MakeEnvelope($1, $2, $3, $4, 4326)');
    expect(q.values).toEqual([-75, 4, -74, 5]);
  });
});
