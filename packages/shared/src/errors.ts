import { MESSAGES, interpolate } from './i18n.js';

export type ErrorCode =
  | 'NOT_FOUND'
  | 'PARCEL_NOT_FOUND'
  | 'INVALID_NPN'
  | 'VALIDATION'
  | 'AREA_TOO_LARGE'
  | 'QUOTA_EXCEEDED'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'PLAN_REQUIRED'
  | 'COVERAGE_MISSING'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  PARCEL_NOT_FOUND: 404,
  INVALID_NPN: 400,
  VALIDATION: 400,
  AREA_TOO_LARGE: 413,
  QUOTA_EXCEEDED: 402,
  INSUFFICIENT_CREDITS: 402,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PLAN_REQUIRED: 403,
  /*
   * 422 y no 200. La intención de devolver 200 era buena —no tener datos en una zona no es
   * un fallo del cliente ni del servidor, es una respuesta honesta— pero el cuerpo que se
   * emite es un sobre de error, así que el cliente veía `res.ok` en true, no entraba en su
   * rama de error y acababa tratando el objeto `{error}` como si fuera el dato: pantalla en
   * blanco, sin un solo fallo registrado en ninguna parte.
   *
   * 422 dice exactamente lo que pasa: la petición está bien formada y no se puede atender.
   * No es 404, que se confundiría con "esa ruta no existe".
   */
  COVERAGE_MISSING: 422,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Error de dominio con mensaje ya en español para el usuario final. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS[code];
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }

  static notFound(what: string = MESSAGES.errors.notFound) {
    return new AppError('NOT_FOUND', what);
  }
  static parcelNotFound(npn: string) {
    return new AppError('PARCEL_NOT_FOUND', MESSAGES.errors.parcelNotFound, { npn });
  }
  static invalidNpn(npn: string) {
    return new AppError('INVALID_NPN', MESSAGES.errors.invalidNpn, { npn });
  }
  static areaTooLarge(area: number, limit: number) {
    return new AppError(
      'AREA_TOO_LARGE',
      interpolate(MESSAGES.errors.areaTooLarge, {
        area: area.toFixed(2),
        limit: String(limit),
      }),
      { area, limit },
    );
  }
  static quotaExceeded(what: string) {
    return new AppError('QUOTA_EXCEEDED', MESSAGES.errors.quotaExceeded, { what });
  }
  static insufficientCredits(needed: number, available: number) {
    return new AppError(
      'INSUFFICIENT_CREDITS',
      interpolate(MESSAGES.errors.insufficientCredits, { needed: String(needed) }),
      { needed, available },
    );
  }
  static timeout() {
    return new AppError('TIMEOUT', MESSAGES.errors.timeout);
  }
  static unauthorized() {
    return new AppError('UNAUTHORIZED', MESSAGES.errors.unauthorized);
  }
  static forbidden(feature?: string): AppError {
    return new AppError('FORBIDDEN', MESSAGES.errors.forbidden, feature ? { feature } : {});
  }
  static planRequired(feature: string, minPlan: string) {
    return new AppError('PLAN_REQUIRED', MESSAGES.errors.forbidden, { feature, minPlan });
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
