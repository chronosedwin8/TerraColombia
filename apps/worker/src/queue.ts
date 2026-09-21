import { getLogger } from '@terracolombia/shared';

/**
 * Cola con degradación (ADR-004): BullMQ sobre Redis si `REDIS_URL` está definido, cola en
 * proceso con la misma interfaz si no. La cola en memoria no persiste entre reinicios y se
 * anuncia como "solo desarrollo" en el log, para que nadie la confunda con producción.
 */

export interface JobHandler<T> {
  (payload: T, ctx: JobContext): Promise<unknown>;
}

export interface JobContext {
  jobId: string;
  /** Reporta avance: 0–100 y un mensaje en español para el usuario. */
  progress(percent: number, message?: string): Promise<void>;
  log(message: string): Promise<void>;
  attempt: number;
}

export interface Queue {
  readonly kind: 'bullmq' | 'memory';
  register<T>(name: string, handler: JobHandler<T>): void;
  add<T>(name: string, payload: T, opts?: { jobId?: string; delayMs?: number; attempts?: number }): Promise<string>;
  start(): Promise<void>;
  close(): Promise<void>;
  /** Cola en memoria: espera a que se vacíe. En BullMQ no hace nada. */
  drain(): Promise<void>;
}

const log = getLogger({ mod: 'queue' });

class MemoryQueue implements Queue {
  readonly kind = 'memory' as const;
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private readonly pending: Array<{
    name: string;
    payload: unknown;
    jobId: string;
    attempts: number;
    maxAttempts: number;
  }> = [];
  private running = false;
  private active = 0;
  private readonly concurrency: number;

  constructor(concurrency = 2) {
    this.concurrency = concurrency;
  }

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  async add<T>(
    name: string,
    payload: T,
    opts: { jobId?: string; delayMs?: number; attempts?: number } = {},
  ): Promise<string> {
    const jobId = opts.jobId ?? `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const push = () => {
      this.pending.push({
        name,
        payload,
        jobId,
        attempts: 0,
        maxAttempts: opts.attempts ?? 3,
      });
      void this.pump();
    };
    if (opts.delayMs && opts.delayMs > 0) {
      setTimeout(push, opts.delayMs).unref?.();
    } else {
      push();
    }
    return jobId;
  }

  async start(): Promise<void> {
    this.running = true;
    log.warn({}, 'Cola en memoria activa: los trabajos no sobreviven a un reinicio (solo desarrollo)');
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (!this.running) return;
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) break;
      this.active++;
      void this.run(job).finally(() => {
        this.active--;
        void this.pump();
      });
    }
  }

  private async run(job: {
    name: string;
    payload: unknown;
    jobId: string;
    attempts: number;
    maxAttempts: number;
  }): Promise<void> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      log.error({ name: job.name }, 'No hay manejador registrado para este trabajo');
      return;
    }
    const ctx: JobContext = {
      jobId: job.jobId,
      attempt: job.attempts + 1,
      progress: async (percent, message) => {
        log.debug({ jobId: job.jobId, percent, message }, 'Progreso');
      },
      log: async (message) => {
        log.info({ jobId: job.jobId }, message);
      },
    };
    try {
      await handler(job.payload, ctx);
    } catch (err) {
      job.attempts++;
      const msg = err instanceof Error ? err.message : String(err);
      if (job.attempts < job.maxAttempts) {
        const backoff = Math.min(30_000, 2 ** job.attempts * 1000);
        log.warn({ jobId: job.jobId, attempt: job.attempts, err: msg }, 'Reintentando trabajo');
        setTimeout(() => {
          this.pending.push(job);
          void this.pump();
        }, backoff).unref?.();
      } else {
        log.error({ jobId: job.jobId, err: msg }, 'Trabajo agotó los reintentos');
      }
    }
  }

  async drain(): Promise<void> {
    while (this.pending.length > 0 || this.active > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async close(): Promise<void> {
    this.running = false;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class BullQueue implements Queue {
  readonly kind = 'bullmq' as const;
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private queue: any = null;
  private worker: any = null;

  constructor(private readonly redisUrl: string, private readonly concurrency = 2) {}

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  private async ensureQueue(): Promise<any> {
    if (this.queue) return this.queue;
    const { Queue: BQ } = await import('bullmq');
    this.queue = new BQ('terracolombia', {
      connection: { url: this.redisUrl } as never,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800 },
      },
    });
    return this.queue;
  }

  async add<T>(
    name: string,
    payload: T,
    opts: { jobId?: string; delayMs?: number; attempts?: number } = {},
  ): Promise<string> {
    const q = await this.ensureQueue();
    const job = await q.add(name, payload, {
      jobId: opts.jobId,
      delay: opts.delayMs,
      attempts: opts.attempts,
    });
    return String(job.id);
  }

  async start(): Promise<void> {
    const { Worker } = await import('bullmq');
    await this.ensureQueue();
    this.worker = new Worker(
      'terracolombia',
      async (job: any) => {
        const handler = this.handlers.get(job.name);
        if (!handler) throw new Error(`No hay manejador para el trabajo "${job.name}"`);
        const ctx: JobContext = {
          jobId: String(job.id),
          attempt: job.attemptsMade + 1,
          progress: async (percent, message) => {
            await job.updateProgress({ percent, message });
          },
          log: async (message) => {
            await job.log(message);
          },
        };
        return handler(job.data, ctx);
      },
      { connection: { url: this.redisUrl } as never, concurrency: this.concurrency },
    );
    this.worker.on('failed', (job: any, err: Error) => {
      log.error({ jobId: job?.id, name: job?.name, err: err.message }, 'Trabajo fallido');
    });
    log.info({ concurrency: this.concurrency }, 'Cola BullMQ activa');
  }

  async drain(): Promise<void> {
    // En BullMQ el vaciado lo gestiona el propio servidor; no se espera aquí.
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

let instance: Queue | null = null;

export async function createQueue(concurrency = Number(process.env.ETL_CONCURRENCY ?? 2)): Promise<Queue> {
  if (instance) return instance;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const { default: Redis } = await import('ioredis');
      const probe = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      await probe.connect();
      await probe.ping();
      await probe.quit();
      instance = new BullQueue(redisUrl, concurrency);
      return instance;
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Redis no responde: se usa la cola en memoria (solo desarrollo)',
      );
    }
  }
  instance = new MemoryQueue(concurrency);
  return instance;
}

export function getQueue(): Queue {
  if (!instance) throw new Error('La cola no está inicializada: llama antes a createQueue()');
  return instance;
}
