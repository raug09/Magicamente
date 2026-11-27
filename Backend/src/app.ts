import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import appointmentRoutes from './routes/appointment';
import scheduleRoutes from './routes/schedule';
import psychologistRoutes from './routes/psychologist';
import verificationRoutes from './routes/verification';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { createRateLimiters } from './middlewares/rateLimiters';
import swaggerUi from 'swagger-ui-express';
import { getApiDocsEnabled, getCorsOrigins, getTrustProxy } from './config/env';
import { getOpenApiDocument } from './docs/openapi';
import { logger } from './utils/logger';

/** Routers de la API y dónde se montan. Lo usa también el test que comprueba que todo está documentado. */
export const API_ROUTERS = [
  ['/api/auth', authRoutes],
  ['/api/users', userRoutes],
  ['/api/appointments', appointmentRoutes],
  ['/api/schedule', scheduleRoutes],
  ['/api/psychologists', psychologistRoutes],
  ['/api/verification', verificationRoutes],
] as const;

export interface AppOptions {
  /** Límite de intentos por IP. Activado por defecto; los tests lo desactivan salvo los suyos. */
  rateLimit?: boolean;
  /** Documentación en /api/docs. Por defecto, según API_DOCS (activada salvo en producción). */
  apiDocs?: boolean;
}

/** Crea la aplicación Express sin conectar a la BD ni escuchar en un puerto (útil para tests). */
export const createApp = ({ rateLimit = true, apiDocs = getApiDocsEnabled() }: AppOptions = {}) => {
  const app = express();

  const trustProxy = getTrustProxy();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  // Un registro por petición: método, ruta (SIN la query, que puede llevar datos personales), estado y duración.
  // No se registran cabeceras ni cuerpos, así que no aparecen tokens ni contraseñas.
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );
  app.use(helmet());
  app.use(cors({ origin: getCorsOrigins() === '*' ? true : getCorsOrigins() }));
  app.use(express.json({ limit: '100kb' }));

  if (rateLimit) {
    const limiters = createRateLimiters();
    app.use('/api', limiters.general);
    app.use('/api/auth/login', limiters.login);
    app.use('/api/auth/register', limiters.sensitive);
    app.use('/api/auth/forgot-password', limiters.sensitive);
    app.use('/api/auth/reset-password', limiters.sensitive);
    app.use('/api/auth/resend-verification', limiters.sensitive);
    app.use('/api/auth/change-email', limiters.sensitive);
    app.use('/api/verification', limiters.uploads);
  }

  app.get('/', (req, res) => {
    res.send('Servidor corriendo y conectado a MongoDB');
  });

  // Para balanceadores y Docker: 200 si la base de datos responde, 503 si no.
  app.get('/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'error', db: dbUp ? 'up' : 'down' });
  });

  // Documentación interactiva (Swagger UI) y el esquema OpenAPI en JSON.
  if (apiDocs) {
    app.get('/api/docs/openapi.json', (req, res) => {
      res.json(getOpenApiDocument());
    });
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(getOpenApiDocument(), {
        customSiteTitle: 'API de Magicamente',
        // Conserva el token de «Authorize» al recargar la página.
        swaggerOptions: { persistAuthorization: true },
      }));
  }

  for (const [path, router] of API_ROUTERS) app.use(path, router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
