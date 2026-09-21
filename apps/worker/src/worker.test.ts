import { describe, expect, it, vi } from 'vitest';
import { STEP_ORDER, formatRunReport } from './etl/pipeline.js';
import type { RunReport } from './etl/pipeline.js';

describe('cola con degradación', () => {
  it('sin REDIS_URL usa la cola en memoria', async () => {
    delete process.env.REDIS_URL;
    // `createQueue` cachea la instancia; se importa el módulo fresco para cada caso.
    vi.resetModules();
    const { createQueue: fresh } = await import('./queue.js');
    const queue = await fresh(1);
    expect(queue.kind).toBe('memory');
    await queue.close();
  });

  it('ejecuta un trabajo registrado y le pasa el contexto', async () => {
    vi.resetModules();
    const { createQueue: fresh } = await import('./queue.js');
    const queue = await fresh(1);
    const seen: Array<{ payload: unknown; attempt: number }> = [];
    queue.register<{ n: number }>('sumar', async (payload, ctx) => {
      seen.push({ payload, attempt: ctx.attempt });
      await ctx.progress(50, 'a mitad');
      return payload.n * 2;
    });
    await queue.start();
    await queue.add('sumar', { n: 21 });
    await queue.drain();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.payload).toEqual({ n: 21 });
    expect(seen[0]!.attempt).toBe(1);
    await queue.close();
  });

  it('reintenta un trabajo que falla y acaba rindiéndose', async () => {
    vi.resetModules();
    const { createQueue: fresh } = await import('./queue.js');
    const queue = await fresh(1);
    let attempts = 0;
    queue.register('siempre-falla', async () => {
      attempts++;
      throw new Error('falla a propósito');
    });
    await queue.start();
    await queue.add('siempre-falla', {}, { attempts: 2 });
    // El respaldo exponencial arranca en 2 s: se espera lo suficiente para dos intentos.
    await new Promise((r) => setTimeout(r, 3500));
    expect(attempts).toBe(2);
    await queue.close();
  }, 15_000);

  it('un trabajo sin manejador no tumba la cola', async () => {
    vi.resetModules();
    const { createQueue: fresh } = await import('./queue.js');
    const queue = await fresh(1);
    await queue.start();
    await expect(queue.add('inexistente', {})).resolves.toBeTypeOf('string');
    await queue.drain();
    await queue.close();
  });

  it('respeta el límite de concurrencia', async () => {
    vi.resetModules();
    const { createQueue: fresh } = await import('./queue.js');
    const queue = await fresh(2);
    let running = 0;
    let maxRunning = 0;
    queue.register('lento', async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 60));
      running--;
    });
    await queue.start();
    for (let i = 0; i < 6; i++) await queue.add('lento', { i });
    await queue.drain();
    expect(maxRunning).toBeLessThanOrEqual(2);
    await queue.close();
  }, 15_000);
});

describe('pipeline del ETL', () => {
  it('los pasos van en el orden que declara el plan', () => {
    expect(STEP_ORDER).toEqual([
      'discover',
      'download',
      'stage',
      'validate',
      'transform',
      'index',
      'aggregate',
      'tiles',
      'publish',
      'diff',
    ]);
  });

  it('`validate` va antes de `publish`: un corte con errores no puede publicarse', () => {
    expect(STEP_ORDER.indexOf('validate')).toBeLessThan(STEP_ORDER.indexOf('publish'));
  });

  it('`diff` va después de `publish`: se compara contra un corte ya activo', () => {
    expect(STEP_ORDER.indexOf('diff')).toBeGreaterThan(STEP_ORDER.indexOf('publish'));
  });

  it('el informe de corrida es legible y dice si se publicó', () => {
    const report: RunReport = {
      datasetId: 'prueba',
      cutDate: '2026-09-01',
      snapshotId: 1,
      published: false,
      steps: [
        { step: 'download', status: 'ok', durationMs: 120, rowsIn: 100, rowsOut: null, message: 'ok' },
        { step: 'validate', status: 'ok', durationMs: 30, rowsIn: null, rowsOut: null, message: null },
      ],
      findings: [
        {
          checkName: 'bad_npn',
          severity: 'error',
          passed: false,
          affectedRows: 3,
          message: '3 códigos prediales inválidos',
        },
      ],
      blockingErrors: 1,
      warnings: 0,
    };
    const text = formatRunReport(report);
    expect(text).toContain('NO publicado');
    expect(text).toContain('bad_npn');
    expect(text).toContain('ERROR');
    expect(text).toContain('1 errores bloqueantes');
  });
});
