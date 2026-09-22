import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PbfCursor, readOsmHeader, readOsmPbf } from './osm-pbf.js';

/**
 * El lector de PBF se prueba contra un fichero sintético construido byte a byte con las
 * reglas de `fileformat.proto` / `osmformat.proto`. No se usa ninguna librería: si el escritor
 * de la prueba y el lector compartieran código, la prueba no probaría nada.
 *
 * Los bloques llevan a propósito campos que el lector NO entiende (`Info` en el way,
 * `DenseInfo` en los nodos, un campo desconocido en el PrimitiveBlock) porque el fallo real
 * que se encontró al escribir esto fue justo ahí: saltar un campo de longitud variable dejaba
 * el cursor un byte corrido y el resto del bloque se leía como basura.
 */

// ─── Escritor protobuf mínimo, solo para la prueba ────────────────────────────

function varint(value: number): Buffer {
  const out: number[] = [];
  let v = value;
  while (v >= 0x80) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return Buffer.from(out);
}

function zigzag(value: number): Buffer {
  return varint(value >= 0 ? value * 2 : -value * 2 - 1);
}

function tag(field: number, wire: number): Buffer {
  return varint(field * 8 + wire);
}

function lenField(field: number, payload: Buffer): Buffer {
  return Buffer.concat([tag(field, 2), varint(payload.length), payload]);
}

function varintField(field: number, value: number): Buffer {
  return Buffer.concat([tag(field, 0), varint(value)]);
}

function packed(field: number, values: Buffer[]): Buffer {
  return lenField(field, Buffer.concat(values));
}

function stringTable(strings: string[]): Buffer {
  return lenField(1, Buffer.concat(strings.map((s) => lenField(1, Buffer.from(s, 'utf8')))));
}

function blob(type: string, payload: Buffer): Buffer {
  const compressed = deflateSync(payload);
  const body = Buffer.concat([
    varintField(2, payload.length), // raw_size
    lenField(3, compressed), // zlib_data
  ]);
  const header = Buffer.concat([
    lenField(1, Buffer.from(type, 'utf8')),
    varintField(3, body.length),
  ]);
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(header.length, 0);
  return Buffer.concat([prefix, header, body]);
}

/** Fichero de prueba: un OSMHeader y un OSMData con dos nodos y un way. */
function buildFixture(): Buffer {
  const headerBlock = Buffer.concat([
    lenField(
      1, // HeaderBBox en nanogrados
      Buffer.concat([
        Buffer.concat([tag(1, 0), zigzag(-83_231_040_000)]),
        Buffer.concat([tag(2, 0), zigzag(-66_814_719_900)]),
        Buffer.concat([tag(3, 0), zigzag(16_594_069_900)]),
        Buffer.concat([tag(4, 0), zigzag(-4_257_320_000)]),
      ]),
    ),
    lenField(4, Buffer.from('OsmSchema-V0.6', 'utf8')),
    lenField(5, Buffer.from('Sort.Type_then_ID', 'utf8')), // campo que el lector salta
    lenField(16, Buffer.from('prueba/1.0', 'utf8')),
    varintField(32, 1_789_935_726), // osmosis_replication_timestamp
  ]);

  const strings = [
    '', // 0: la entrada 0 de la tabla siempre está vacía
    'highway', // 1
    'primary', // 2
    'name', // 3
    'Vía de prueba', // 4
    'amenity', // 5
    'restaurant', // 6
  ];

  const denseNodes = lenField(
    2,
    Buffer.concat([
      packed(1, [zigzag(1001), zigzag(1)]), // ids delta: 1001, 1002
      lenField(5, varintField(1, 1)), // DenseInfo: el lector lo salta
      packed(8, [zigzag(46_500_000), zigzag(100)]), // lat: 4.65, 4.65001
      packed(9, [zigzag(-741_000_000), zigzag(-200)]), // lon: -74.1, -74.10002
      // keys_vals: nodo 1 sin etiquetas (0), nodo 2 amenity=restaurant
      packed(10, [varint(0), varint(5), varint(6), varint(0)]),
    ]),
  );

  const way = lenField(
    3,
    Buffer.concat([
      varintField(1, 555), // id (int64, no zigzag)
      packed(2, [varint(1), varint(3)]), // keys: highway, name
      packed(3, [varint(2), varint(4)]), // vals: primary, Vía de prueba
      lenField(4, varintField(1, 7)), // Info: el lector lo salta
      packed(8, [zigzag(1001), zigzag(1)]), // refs delta: 1001, 1002
    ]),
  );

  const primitiveBlock = Buffer.concat([
    stringTable(strings),
    lenField(2, Buffer.concat([denseNodes, way])),
    lenField(30, Buffer.from('campo desconocido', 'utf8')), // fuerza un salto wire 2
    varintField(17, 100), // granularity, declarada DESPUÉS de los grupos como hace protobuf
  ]);

  return Buffer.concat([blob('OSMHeader', headerBlock), blob('OSMData', primitiveBlock)]);
}

// ─── Pruebas ──────────────────────────────────────────────────────────────────

describe('PbfCursor', () => {
  it('lee varints de más de 28 bits sin perder precisión', () => {
    // 1 789 935 726 no cabe en cuatro grupos de 7 bits: es el caso que rompía el sello de
    // tiempo del OSMHeader.
    const buf = varint(1_789_935_726);
    expect(new PbfCursor(buf).varint()).toBe(1_789_935_726);
    // Identificador de nodo real de OSM, por encima de 2^32.
    const big = varint(12_345_678_901);
    expect(new PbfCursor(big).varint()).toBe(12_345_678_901);
  });

  it('salta campos de longitud variable contando el byte de longitud', () => {
    const buf = Buffer.concat([lenField(9, Buffer.from('abcdef')), varintField(1, 42)]);
    const c = new PbfCursor(buf);
    const t = c.varint();
    expect(t >> 3).toBe(9);
    c.skip(t & 7);
    // Si el salto se comiera el byte de longitud, aquí se leería basura.
    expect(c.varint() >> 3).toBe(1);
  });
});

describe('readOsmHeader', () => {
  it('lee bbox, fecha de réplica y programa', () => {
    const h = readOsmHeader(buildFixture());
    expect(h.replicationTimestamp).toBe(new Date(1_789_935_726 * 1000).toISOString());
    expect(h.writingProgram).toBe('prueba/1.0');
    expect(h.requiredFeatures).toContain('OsmSchema-V0.6');
    expect(h.bbox?.minLon).toBeCloseTo(-83.23104, 5);
    expect(h.bbox?.maxLat).toBeCloseTo(16.594069, 5);
  });
});

describe('readOsmPbf', () => {
  it('recorre nodos densos y ways con sus etiquetas y referencias', () => {
    const nodes: Array<{
      id: number;
      lat: number;
      lon: number;
      tags: Record<string, string> | null;
    }> = [];
    const ways: Array<{ id: number; tags: Record<string, string>; refs: number[] }> = [];

    const stats = readOsmPbf(buildFixture(), {
      nodeTags: true,
      onNode: (id, lat, lon, tags) => nodes.push({ id, lat, lon, tags }),
      onWay: (w) => ways.push({ id: w.id, tags: w.tags(), refs: w.refs() }),
    });

    expect(stats.nodes).toBe(2);
    expect(stats.ways).toBe(1);
    expect(nodes[0]).toMatchObject({ id: 1001, tags: null });
    expect(nodes[0]?.lat).toBeCloseTo(4.65, 6);
    expect(nodes[0]?.lon).toBeCloseTo(-74.1, 6);
    expect(nodes[1]).toMatchObject({ id: 1002, tags: { amenity: 'restaurant' } });
    expect(nodes[1]?.lat).toBeCloseTo(4.65001, 6);

    expect(ways[0]?.id).toBe(555);
    expect(ways[0]?.tags).toEqual({ highway: 'primary', name: 'Vía de prueba' });
    expect(ways[0]?.refs).toEqual([1001, 1002]);
  });

  it('no decodifica etiquetas de nodo cuando no se piden', () => {
    const seen: Array<Record<string, string> | null> = [];
    readOsmPbf(buildFixture(), { nodeTags: false, onNode: (_i, _a, _o, t) => seen.push(t) });
    expect(seen).toEqual([null, null]);
  });

  it('la vista del way responde a value() y hasKey() sin construir las etiquetas', () => {
    let highway: string | undefined;
    let hasAmenity = true;
    readOsmPbf(buildFixture(), {
      onWay: (w) => {
        highway = w.value('highway');
        hasAmenity = w.hasKey('amenity');
      },
    });
    expect(highway).toBe('primary');
    expect(hasAmenity).toBe(false);
  });
});
