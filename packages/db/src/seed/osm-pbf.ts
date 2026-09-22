/**
 * Lector de extractos `.osm.pbf` (formato OSM PBF de Geofabrik).
 *
 * ¿Por qué un lector propio y no `osm2pgsql`/`osmium`? Porque no están instalados en la
 * máquina de trabajo (verificado: `osmium`, `osm2pgsql`, `osmconvert` no existen en el PATH;
 * sí hay GDAL 3.9.2 con el driver OSM, que obliga a pasar por `other_tags` en hstore y por un
 * SQLite temporal, y no deja controlar el descarte de etiquetas de contacto antes de escribir).
 * Ver ADR-010 en `docs/DECISIONES.md`.
 *
 * El formato está publicado por la OSMF (`osmformat.proto` y `fileformat.proto`):
 *
 *   fichero  := ( uint32BE longitud(BlobHeader) · BlobHeader · Blob )*
 *   BlobHeader := { 1: string type ("OSMHeader" | "OSMData"), 3: int32 datasize }
 *   Blob       := { 1: bytes raw | 2: int32 raw_size, 3: bytes zlib_data, … }
 *   PrimitiveBlock := { 1: StringTable, 2: PrimitiveGroup*, 17: granularity,
 *                       19: lat_offset, 20: lon_offset }
 *   PrimitiveGroup := { 1: Node*, 2: DenseNodes, 3: Way*, 4: Relation* }
 *
 * Coordenada = 1e-9 · (offset + granularidad · valor).
 *
 * Decisiones de implementación:
 *  - Los identificadores de OSM caben de sobra en un `number` (el mayor nodo publicado va por
 *    12 000 millones, muy por debajo de 2^53), así que se decodifican como `number` y no como
 *    `BigInt`: un `BigInt` por nodo multiplicaría por tres el tiempo de la pasada.
 *  - Las referencias de nodos de un way se decodifican solo si el visitante las pide
 *    (`way.refs()`). Sin eso, recorrer los ~2 millones de ways de Colombia obligaría a
 *    decodificar las referencias de todos los edificios, que no se usan.
 *  - El bloque se pre-escanea para leer `granularity` y los offsets ANTES de procesar los
 *    grupos: protobuf los serializa después (campos 17-20) aunque hagan falta antes.
 */

import { inflateSync, unzipSync } from 'node:zlib';

// ─── Lector protobuf mínimo ───────────────────────────────────────────────────

const POW_2_28 = 2 ** 28;

/** Cursor sobre un buffer con las primitivas de protobuf que usa el formato OSM. */
export class PbfCursor {
  pos: number;
  end: number;

  constructor(
    public buf: Buffer,
    pos = 0,
    end = buf.length,
  ) {
    this.pos = pos;
    this.end = end;
  }

  /**
   * Varint sin signo como `number`. Los cuatro primeros grupos se acumulan con operadores
   * de bits (28 bits, siempre positivo) y el resto con multiplicación, porque `<<` en
   * JavaScript trabaja en 32 bits y a partir del quinto grupo perdería los bits altos.
   */
  varint(): number {
    const b0 = this.buf[this.pos++]!;
    let low = b0 & 0x7f;
    if (b0 < 0x80) return low;
    const b1 = this.buf[this.pos++]!;
    low |= (b1 & 0x7f) << 7;
    if (b1 < 0x80) return low;
    const b2 = this.buf[this.pos++]!;
    low |= (b2 & 0x7f) << 14;
    if (b2 < 0x80) return low;
    const b3 = this.buf[this.pos++]!;
    low |= (b3 & 0x7f) << 21;
    if (b3 < 0x80) return low;

    let high = 0;
    let shift = 1;
    for (let i = 0; i < 6; i++) {
      const b = this.buf[this.pos++]!;
      high += (b & 0x7f) * shift;
      if (b < 0x80) break;
      shift *= 128;
    }
    return low + high * POW_2_28;
  }

  /** Varint con signo en zigzag (`sint32`/`sint64`). */
  svarint(): number {
    const n = this.varint();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  }

  /** Salta el valor del campo indicado por su wire type. */
  skip(wireType: number): void {
    switch (wireType) {
      case 0:
        this.varint();
        return;
      case 1:
        this.pos += 8;
        return;
      case 2: {
        // El varint de longitud mueve `pos`: hay que leerlo ANTES de sumar, o se pierde
        // el byte de longitud (`this.pos += this.varint()` usa el `pos` viejo).
        const len = this.varint();
        this.pos += len;
        return;
      }
      case 5:
        this.pos += 4;
        return;
      default:
        throw new Error(
          `PBF: wire type ${wireType} no soportado (posición ${this.pos} de ${this.end})`,
        );
    }
  }
}

// ─── Estructura del fichero ───────────────────────────────────────────────────

interface BlobHeader {
  type: string;
  datasize: number;
}

function readBlobHeader(buf: Buffer, start: number, end: number): BlobHeader {
  const c = new PbfCursor(buf, start, end);
  let type = '';
  let datasize = 0;
  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const len = c.varint();
      type = buf.toString('utf8', c.pos, c.pos + len);
      c.pos += len;
    } else if (field === 3 && wire === 0) {
      datasize = c.varint();
    } else {
      c.skip(wire);
    }
  }
  return { type, datasize };
}

/** Descomprime un Blob. Geofabrik publica zlib; se soporta además `raw` sin comprimir. */
function readBlob(buf: Buffer, start: number, end: number): Buffer {
  const c = new PbfCursor(buf, start, end);
  let raw: Buffer | null = null;
  let zlib: Buffer | null = null;
  const unsupported: number[] = [];
  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const len = c.varint();
      raw = buf.subarray(c.pos, c.pos + len);
      c.pos += len;
    } else if (field === 3 && wire === 2) {
      const len = c.varint();
      zlib = buf.subarray(c.pos, c.pos + len);
      c.pos += len;
    } else if ((field === 4 || field === 5 || field === 6 || field === 7) && wire === 2) {
      // lzma_data (4), OBSOLETE_bzip2_data (5), lz4_data (6), zstd_data (7)
      unsupported.push(field);
      c.skip(wire);
    } else {
      c.skip(wire);
    }
  }
  if (raw) return raw;
  if (zlib) return inflateSync(zlib);
  if (unsupported.length > 0) {
    // `unzipSync` cubre zlib/gzip; si el fichero llega en lzma/zstd hay que decirlo claro
    // en vez de devolver un bloque vacío que se leería como "el extracto no trae nada".
    throw new Error(
      `PBF: Blob comprimido con un método no soportado (campo ${unsupported.join(',')}). ` +
        'Este lector solo entiende `raw` y `zlib`, que es lo que publica Geofabrik.',
    );
  }
  throw new Error('PBF: Blob sin datos');
}

// ─── Vistas de elementos ──────────────────────────────────────────────────────

/**
 * Vista de un way durante la llamada al visitante. **Solo es válida dentro de la llamada**:
 * la instancia se reutiliza para todos los ways del fichero para no generar basura.
 */
export class OsmWayView {
  id = 0;
  /** Índices de clave/valor en la tabla de textos del bloque. */
  keys: number[] = [];
  vals: number[] = [];
  strings: string[] = [];
  private refsStart = 0;
  private refsEnd = 0;
  private buf: Buffer = Buffer.alloc(0);

  /** @internal */
  setRefsSpan(buf: Buffer, start: number, end: number): void {
    this.buf = buf;
    this.refsStart = start;
    this.refsEnd = end;
  }

  /** Valor de una etiqueta, o `undefined`. No construye el objeto completo. */
  value(key: string): string | undefined {
    for (let i = 0; i < this.keys.length; i++) {
      if (this.strings[this.keys[i]!] === key) return this.strings[this.vals[i]!];
    }
    return undefined;
  }

  hasKey(key: string): boolean {
    return this.value(key) !== undefined;
  }

  /** Todas las etiquetas del way como objeto (sin filtrar). */
  tags(): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.strings[this.keys[i]!];
      const v = this.strings[this.vals[i]!];
      if (k !== undefined && v !== undefined) out[k] = v;
    }
    return out;
  }

  /** Referencias a nodos, en orden, decodificando el delta. Se decodifican al pedirlas. */
  refs(): number[] {
    const out: number[] = [];
    const c = new PbfCursor(this.buf, this.refsStart, this.refsEnd);
    let ref = 0;
    while (c.pos < c.end) {
      ref += c.svarint();
      out.push(ref);
    }
    return out;
  }
}

export interface OsmPbfVisitors {
  /**
   * Nodo. `tags` llega `null` cuando el nodo no tiene ninguna etiqueta, que es el 95 % de
   * los nodos de un extracto (son solo vértices de ways).
   */
  onNode?: (id: number, lat: number, lon: number, tags: Record<string, string> | null) => void;
  onWay?: (way: OsmWayView) => void;
  /**
   * `false` evita decodificar `keys_vals` de los nodos densos. Se usa en la pasada que solo
   * necesita coordenadas, donde ahorra cerca de un tercio del tiempo.
   */
  nodeTags?: boolean;
  /** Progreso cada `progressEvery` bloques, para que la carga no parezca colgada. */
  onProgress?: (stats: OsmPbfStats) => void;
  progressEvery?: number;
}

export interface OsmPbfStats {
  blocks: number;
  nodes: number;
  taggedNodes: number;
  ways: number;
  relations: number;
  /** Fecha de corte del `osmosis_replication_timestamp` del OSMHeader, si viene. */
  replicationTimestamp: string | null;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
  elapsedMs: number;
}

/** Lee la cabecera `OSMHeader` (bbox y fecha de réplica) sin recorrer el fichero entero. */
export function readOsmHeader(buf: Buffer): {
  replicationTimestamp: string | null;
  bbox: OsmPbfStats['bbox'];
  requiredFeatures: string[];
  writingProgram: string | null;
} {
  const headerLen = buf.readUInt32BE(0);
  const header = readBlobHeader(buf, 4, 4 + headerLen);
  if (header.type !== 'OSMHeader') {
    throw new Error(`PBF: el primer bloque es ${header.type}, se esperaba OSMHeader`);
  }
  const block = readBlob(buf, 4 + headerLen, 4 + headerLen + header.datasize);
  const c = new PbfCursor(block);
  let bbox: OsmPbfStats['bbox'] = null;
  let replicationTimestamp: string | null = null;
  const requiredFeatures: string[] = [];
  let writingProgram: string | null = null;

  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      // HeaderBBox en nanogrados (sint64): 1 left, 2 right, 3 top, 4 bottom
      const len = c.varint();
      const b = new PbfCursor(block, c.pos, c.pos + len);
      c.pos += len;
      let left = 0;
      let right = 0;
      let top = 0;
      let bottom = 0;
      while (b.pos < b.end) {
        const t2 = b.varint();
        const f2 = t2 >> 3;
        const w2 = t2 & 7;
        if (w2 !== 0) {
          b.skip(w2);
          continue;
        }
        const v = b.svarint() / 1e9;
        if (f2 === 1) left = v;
        else if (f2 === 2) right = v;
        else if (f2 === 3) top = v;
        else if (f2 === 4) bottom = v;
      }
      bbox = { minLon: left, maxLon: right, maxLat: top, minLat: bottom };
    } else if (field === 4 && wire === 2) {
      const len = c.varint();
      requiredFeatures.push(block.toString('utf8', c.pos, c.pos + len));
      c.pos += len;
    } else if (field === 16 && wire === 2) {
      const len = c.varint();
      writingProgram = block.toString('utf8', c.pos, c.pos + len);
      c.pos += len;
    } else if (field === 32 && wire === 0) {
      // osmosis_replication_timestamp, segundos epoch
      const secs = c.varint();
      replicationTimestamp = new Date(secs * 1000).toISOString();
    } else {
      c.skip(wire);
    }
  }
  return { replicationTimestamp, bbox, requiredFeatures, writingProgram };
}

/**
 * Recorre el fichero completo llamando a los visitantes. Es síncrono a propósito: el trabajo
 * es CPU (inflate + varints) y partirlo en promesas solo añadiría coste.
 */
export function readOsmPbf(buf: Buffer, visitors: OsmPbfVisitors): OsmPbfStats {
  const started = Date.now();
  const header = readOsmHeader(buf);
  const stats: OsmPbfStats = {
    blocks: 0,
    nodes: 0,
    taggedNodes: 0,
    ways: 0,
    relations: 0,
    replicationTimestamp: header.replicationTimestamp,
    bbox: header.bbox,
    elapsedMs: 0,
  };
  const progressEvery = visitors.progressEvery ?? 500;
  const wayView = new OsmWayView();
  const wantNodeTags = visitors.nodeTags !== false;

  let pos = 0;
  while (pos + 4 <= buf.length) {
    const headerLen = buf.readUInt32BE(pos);
    pos += 4;
    const bh = readBlobHeader(buf, pos, pos + headerLen);
    pos += headerLen;
    const blobStart = pos;
    pos += bh.datasize;
    if (bh.type !== 'OSMData') continue;

    const block = readBlob(buf, blobStart, pos);
    readPrimitiveBlock(block, stats, wayView, visitors, wantNodeTags);
    stats.blocks++;
    if (visitors.onProgress && stats.blocks % progressEvery === 0) {
      stats.elapsedMs = Date.now() - started;
      visitors.onProgress(stats);
    }
  }
  stats.elapsedMs = Date.now() - started;
  return stats;
}

function readPrimitiveBlock(
  block: Buffer,
  stats: OsmPbfStats,
  wayView: OsmWayView,
  visitors: OsmPbfVisitors,
  wantNodeTags: boolean,
): void {
  const c = new PbfCursor(block);
  let strings: string[] = [];
  let granularity = 100;
  let latOffset = 0;
  let lonOffset = 0;
  const groups: Array<[number, number]> = [];

  // Primera pasada del bloque: tabla de textos, granularidad y límites de cada grupo.
  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const len = c.varint();
      strings = readStringTable(block, c.pos, c.pos + len);
      c.pos += len;
    } else if (field === 2 && wire === 2) {
      const len = c.varint();
      groups.push([c.pos, c.pos + len]);
      c.pos += len;
    } else if (field === 17 && wire === 0) {
      granularity = c.varint();
    } else if (field === 19 && wire === 0) {
      latOffset = c.svarint();
    } else if (field === 20 && wire === 0) {
      lonOffset = c.svarint();
    } else {
      c.skip(wire);
    }
  }

  for (const [start, end] of groups) {
    readPrimitiveGroup(block, start, end, {
      strings,
      granularity,
      latOffset,
      lonOffset,
      stats,
      wayView,
      visitors,
      wantNodeTags,
    });
  }
}

function readStringTable(block: Buffer, start: number, end: number): string[] {
  const out: string[] = [];
  const c = new PbfCursor(block, start, end);
  while (c.pos < c.end) {
    const tag = c.varint();
    const wire = tag & 7;
    if (tag >> 3 === 1 && wire === 2) {
      const len = c.varint();
      out.push(block.toString('utf8', c.pos, c.pos + len));
      c.pos += len;
    } else {
      c.skip(wire);
    }
  }
  return out;
}

interface GroupContext {
  strings: string[];
  granularity: number;
  latOffset: number;
  lonOffset: number;
  stats: OsmPbfStats;
  wayView: OsmWayView;
  visitors: OsmPbfVisitors;
  wantNodeTags: boolean;
}

function readPrimitiveGroup(block: Buffer, start: number, end: number, ctx: GroupContext): void {
  const c = new PbfCursor(block, start, end);
  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire !== 2) {
      c.skip(wire);
      continue;
    }
    const len = c.varint();
    const sStart = c.pos;
    const sEnd = c.pos + len;
    c.pos = sEnd;
    switch (field) {
      case 1:
        readNode(block, sStart, sEnd, ctx);
        break;
      case 2:
        readDenseNodes(block, sStart, sEnd, ctx);
        break;
      case 3:
        readWay(block, sStart, sEnd, ctx);
        break;
      case 4:
        ctx.stats.relations++;
        break;
      default:
        break;
    }
  }
}

/** Nodo "suelto" (no denso). Geofabrik usa densos, pero el formato permite los dos. */
function readNode(block: Buffer, start: number, end: number, ctx: GroupContext): void {
  const c = new PbfCursor(block, start, end);
  let id = 0;
  let lat = 0;
  let lon = 0;
  const keys: number[] = [];
  const vals: number[] = [];
  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 0) id = c.svarint();
    else if (field === 8 && wire === 0) lat = c.svarint();
    else if (field === 9 && wire === 0) lon = c.svarint();
    else if ((field === 2 || field === 3) && wire === 2) {
      const len = c.varint();
      const p = new PbfCursor(block, c.pos, c.pos + len);
      c.pos += len;
      const target = field === 2 ? keys : vals;
      while (p.pos < p.end) target.push(p.varint());
    } else {
      c.skip(wire);
    }
  }
  ctx.stats.nodes++;
  const onNode = ctx.visitors.onNode;
  if (!onNode) return;
  let tags: Record<string, string> | null = null;
  if (keys.length > 0) {
    ctx.stats.taggedNodes++;
    if (ctx.wantNodeTags) {
      tags = {};
      for (let i = 0; i < keys.length; i++) {
        const k = ctx.strings[keys[i]!];
        const v = ctx.strings[vals[i]!];
        if (k !== undefined && v !== undefined) tags[k] = v;
      }
    }
  }
  onNode(
    id,
    1e-9 * (ctx.latOffset + ctx.granularity * lat),
    1e-9 * (ctx.lonOffset + ctx.granularity * lon),
    tags,
  );
}

function readDenseNodes(block: Buffer, start: number, end: number, ctx: GroupContext): void {
  const c = new PbfCursor(block, start, end);
  let idSpan: [number, number] | null = null;
  let latSpan: [number, number] | null = null;
  let lonSpan: [number, number] | null = null;
  let kvSpan: [number, number] | null = null;

  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (wire !== 2) {
      c.skip(wire);
      continue;
    }
    const len = c.varint();
    const span: [number, number] = [c.pos, c.pos + len];
    c.pos += len;
    if (field === 1) idSpan = span;
    else if (field === 8) latSpan = span;
    else if (field === 9) lonSpan = span;
    else if (field === 10) kvSpan = span;
  }
  if (!idSpan || !latSpan || !lonSpan) return;

  const onNode = ctx.visitors.onNode;
  const idC = new PbfCursor(block, idSpan[0], idSpan[1]);
  const latC = new PbfCursor(block, latSpan[0], latSpan[1]);
  const lonC = new PbfCursor(block, lonSpan[0], lonSpan[1]);
  const kvC = kvSpan ? new PbfCursor(block, kvSpan[0], kvSpan[1]) : null;

  let id = 0;
  let lat = 0;
  let lon = 0;
  const { granularity, latOffset, lonOffset, strings } = ctx;

  while (idC.pos < idC.end) {
    id += idC.svarint();
    lat += latC.svarint();
    lon += lonC.svarint();
    ctx.stats.nodes++;

    // `keys_vals` es una única lista: pares (clave, valor) por nodo, terminados en 0.
    let tags: Record<string, string> | null = null;
    if (kvC && kvC.pos < kvC.end) {
      let first = true;
      for (;;) {
        const k = kvC.varint();
        if (k === 0) break;
        const v = kvC.varint();
        if (first) {
          ctx.stats.taggedNodes++;
          first = false;
        }
        if (ctx.wantNodeTags && onNode) {
          if (tags === null) tags = {};
          const ks = strings[k];
          const vs = strings[v];
          if (ks !== undefined && vs !== undefined) tags[ks] = vs;
        }
      }
    }
    if (onNode) {
      onNode(
        id,
        1e-9 * (latOffset + granularity * lat),
        1e-9 * (lonOffset + granularity * lon),
        tags,
      );
    }
  }
}

function readWay(block: Buffer, start: number, end: number, ctx: GroupContext): void {
  ctx.stats.ways++;
  const onWay = ctx.visitors.onWay;
  const c = new PbfCursor(block, start, end);
  const view = ctx.wayView;
  view.keys.length = 0;
  view.vals.length = 0;
  view.id = 0;
  view.strings = ctx.strings;
  let refsStart = 0;
  let refsEnd = 0;

  while (c.pos < c.end) {
    const tag = c.varint();
    const field = tag >> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 0) {
      view.id = c.varint();
    } else if ((field === 2 || field === 3) && wire === 2) {
      const len = c.varint();
      const p = new PbfCursor(block, c.pos, c.pos + len);
      c.pos += len;
      const target = field === 2 ? view.keys : view.vals;
      while (p.pos < p.end) target.push(p.varint());
    } else if (field === 8 && wire === 2) {
      const len = c.varint();
      refsStart = c.pos;
      refsEnd = c.pos + len;
      c.pos += len;
    } else {
      c.skip(wire);
    }
  }
  if (!onWay) return;
  view.setRefsSpan(block, refsStart, refsEnd);
  onWay(view);
}

/** Descomprime un `.osm.pbf` servido con gzip por error. Se usa solo en pruebas. */
export function maybeGunzip(buf: Buffer): Buffer {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return unzipSync(buf);
  return buf;
}
