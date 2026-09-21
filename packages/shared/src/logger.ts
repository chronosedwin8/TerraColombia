/**
 * Envoltorio mínimo sobre `console` con el mismo contrato que Pino, para que los
 * paquetes sin dependencia de Fastify puedan registrar sin arrastrar pino.
 * `apps/api` y `apps/worker` inyectan el logger de Pino con `setLogger`.
 */

export interface Logger {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

function levelEnabled(level: Level): boolean {
  const min = (process.env.LOG_LEVEL ?? 'info') as Level;
  return LEVELS.indexOf(level) >= LEVELS.indexOf(LEVELS.includes(min) ? min : 'info');
}

function make(bindings: Record<string, unknown>): Logger {
  const emit = (level: Level, obj: unknown, msg?: string) => {
    if (!levelEnabled(level)) return;
    const payload =
      typeof obj === 'string' ? { msg: obj } : { ...(obj as Record<string, unknown>), msg };
    const line = { level, time: new Date().toISOString(), ...bindings, ...payload };
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    out(JSON.stringify(line));
  };
  return {
    debug: (o, m) => emit('debug', o, m),
    info: (o, m) => emit('info', o, m),
    warn: (o, m) => emit('warn', o, m),
    error: (o, m) => emit('error', o, m),
    child: (b) => make({ ...bindings, ...b }),
  };
}

let current: Logger = make({});

export function setLogger(l: Logger): void {
  current = l;
}

export function getLogger(bindings: Record<string, unknown> = {}): Logger {
  return Object.keys(bindings).length > 0 ? current.child(bindings) : current;
}
