import { createHash } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { getLogger } from '@terracolombia/shared';

/**
 * Caché con degradación (ADR-004): Redis si `REDIS_URL` está definido, LRU en memoria si no.
 * Se usa para teselas y para respuestas caras de solo lectura.
 */

export interface Cache {
  readonly kind: 'redis' | 'memory';
  get(key: string): Promise<Buffer | null>;
  set(key: string, value: Buffer, ttlSeconds: number): Promise<void>;
  del(prefix: string): Promise<void>;
  close(): Promise<void>;
}

class MemoryCache implements Cache {
  readonly kind = 'memory' as const;
  private readonly store = new Map<string, { value: Buffer; expiresAt: number }>();

  constructor(private readonly maxEntries = 2000) {}

  async get(key: string): Promise<Buffer | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    // Refresca la posición para que el LRU funcione con el orden de inserción del Map.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  async set(key: string, value: Buffer, ttlSeconds: number): Promise<void> {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(prefix: string): Promise<void> {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

class RedisCache implements Cache {
  readonly kind = 'redis' as const;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  constructor(private readonly client: any) {}

  async get(key: string): Promise<Buffer | null> {
    return this.client.getBuffer(key);
  }

  async set(key: string, value: Buffer, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(prefix: string): Promise<void> {
    // SCAN en lotes: no se usa KEYS para no bloquear el servidor.
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) await this.client.del(...keys);
    } while (cursor !== '0');
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

export async function createCache(redisUrl?: string): Promise<Cache> {
  const log = getLogger({ mod: 'cache' });
  if (redisUrl) {
    try {
      // `ioredis` es CommonJS: según el entorno, el constructor está en `default` o en la raíz.
      const mod = (await import('ioredis')) as unknown as {
        default?: new (url: string, opts?: Record<string, unknown>) => unknown;
        Redis?: new (url: string, opts?: Record<string, unknown>) => unknown;
      };
      const RedisCtor = mod.default ?? mod.Redis;
      if (!RedisCtor) throw new Error('ioredis no expone un constructor utilizable');
      const client = new RedisCtor(redisUrl, {
        lazyConnect: false,
        maxRetriesPerRequest: 2,
      }) as { ping: () => Promise<string> };
      await client.ping();
      log.info({}, 'Caché en Redis');
      return new RedisCache(client);
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Redis no disponible: se usa caché en memoria (solo desarrollo)',
      );
    }
  } else {
    log.info({}, 'REDIS_URL no definido: caché en memoria (solo desarrollo)');
  }
  return new MemoryCache();
}

/** Clave de caché estable a partir de partes arbitrarias. */
export function cacheKey(...parts: Array<string | number | undefined | null>): string {
  return parts.filter((p) => p !== undefined && p !== null).join(':');
}

/** ETag débil sobre el contenido, para que el cliente pueda revalidar. */
export function setEtag(reply: FastifyReply, payload: unknown, maxAgeSeconds = 60): string {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`;
  reply.header('ETag', etag);
  reply.header('Cache-Control', `private, max-age=${maxAgeSeconds}`);
  return etag;
}

/** true si el cliente ya tiene la versión y se puede responder 304. */
export function isNotModified(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((v) => v.trim() === etag);
}
