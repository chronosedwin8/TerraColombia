/**
 * Parseo de banderas de línea de comandos, sin dependencias.
 * Acepta `--flag`, `--flag=valor`, `--flag valor` y `--no-flag`.
 */

export interface ParsedArgs {
  flags: Map<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    if (body.startsWith('no-')) {
      flags.set(body.slice(3), false);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(body, next);
      i += 1;
      continue;
    }
    flags.set(body, true);
  }

  return { flags, positional };
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags.get(name);
  return typeof v === 'string' ? v : undefined;
}

export function flagNumber(args: ParsedArgs, name: string): number | undefined {
  const v = flagString(args, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`La bandera --${name} espera un número, llegó "${v}".`);
  return n;
}

export function flagBool(args: ParsedArgs, name: string, fallback: boolean): boolean {
  const v = args.flags.get(name);
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  return !/^(false|0|no)$/i.test(v);
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name);
}
