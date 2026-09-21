import { z } from 'zod';

/**
 * Configuración de la API. Se valida al arrancar: si falta algo obligatorio, el proceso
 * no levanta y dice exactamente qué falta, en vez de fallar a mitad de una petición.
 */
const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  host: z.string().default('0.0.0.0'),
  port: z.coerce.number().int().positive().default(3001),
  databaseUrl: z.string().min(1, 'DATABASE_URL es obligatoria'),
  databaseUrlRo: z.string().optional(),
  redisUrl: z.string().optional(),
  webOrigin: z.string().default('http://localhost:5173'),
  publicApiUrl: z.string().default('http://localhost:3001'),
  jwtSecret: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  jwtRefreshSecret: z.string().min(16, 'JWT_REFRESH_SECRET debe tener al menos 16 caracteres'),
  jwtAccessTtl: z.coerce.number().int().positive().default(900),
  jwtRefreshTtl: z.coerce.number().int().positive().default(2_592_000),
  martinUrl: z.string().optional(),
  logLevel: z.string().default('info'),
  anthropicApiKey: z.string().optional(),
  anthropicModel: z.string().default('claude-sonnet-5'),
  paymentProvider: z.string().default('mock'),
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = ConfigSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    host: process.env.API_HOST,
    port: process.env.API_PORT,
    databaseUrl: process.env.DATABASE_URL,
    databaseUrlRo: process.env.DATABASE_URL_RO || undefined,
    redisUrl: process.env.REDIS_URL || undefined,
    webOrigin: process.env.WEB_ORIGIN,
    publicApiUrl: process.env.PUBLIC_API_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessTtl: process.env.JWT_ACCESS_TTL,
    jwtRefreshTtl: process.env.JWT_REFRESH_TTL,
    martinUrl: process.env.MARTIN_URL || undefined,
    logLevel: process.env.LOG_LEVEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    paymentProvider: process.env.PAYMENT_PROVIDER,
    googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Configuración inválida. Copia .env.example a .env y ajusta:\n${problems}`,
    );
  }

  cached = parsed.data;
  return cached;
}
