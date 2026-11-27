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
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { createRateLimiters } from './middlewares/rateLimiters';
import { getCorsOrigins, getTrustProxy } from './config/env';
import { logger } from './utils/logger';

export interface AppOptions {
  /** Límite de intentos por IP. Activado por defecto; los tests lo desactivan salvo los suyos. */
  rateLimit?: boolean;
}

/** Crea la aplicación Express sin conectar a la BD ni escuchar en un puerto (útil para tests). */
export const createApp = ({ rateLimit = true }: AppOptions = {}) => {
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
  }

  app.get('/', (req, res) => {
    res.send('Servidor corriendo y conectado a MongoDB');
  });

  // Para balanceadores y Docker: 200 si la base de datos responde, 503 si no.
  app.get('/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'error', db: dbUp ? 'up' : 'down' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/psychologists', psychologistRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
