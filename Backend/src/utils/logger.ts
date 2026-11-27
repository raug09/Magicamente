import pino from 'pino';

/**
 * Logger de la aplicación (JSON, una línea por evento).
 *  - Nivel: `LOG_LEVEL` (por defecto `info`; en los tests, `silent`).
 *  - Nunca se registran cuerpos de petición ni cabeceras con credenciales.
 *  - Para verlo legible en desarrollo: `npm run dev:pretty`.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[oculto]',
  },
});
