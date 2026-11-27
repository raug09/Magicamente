import rateLimit from 'express-rate-limit';

const MINUTE = 60 * 1000;

const limiter = (windowMs: number, max: number, extra: { skipSuccessfulRequests?: boolean } = {}) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7', // cabeceras RateLimit-* y Retry-After
    legacyHeaders: false,
    message: { message: 'Demasiadas peticiones. Inténtalo de nuevo más tarde.' },
    ...extra,
  });

/** Límites por IP. Cada llamada crea contadores nuevos (cada app tiene los suyos). */
export const createRateLimiters = () => ({
  /** Todas las rutas de la API. */
  general: limiter(15 * MINUTE, 300),
  /** Login: 10 intentos FALLIDOS cada 15 minutos (los correctos no cuentan). */
  login: limiter(15 * MINUTE, 10, { skipSuccessfulRequests: true }),
  /** Registro, forgot-password y reset-password: 10 por hora. */
  sensitive: limiter(60 * MINUTE, 10),
  /** Subida y apertura de documentos de verificación: 30 por hora. */
  uploads: limiter(60 * MINUTE, 30),
});
