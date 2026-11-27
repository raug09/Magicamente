import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import appointmentRoutes from './routes/appointment';
import scheduleRoutes from './routes/schedule';
import psychologistRoutes from './routes/psychologist';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { createRateLimiters } from './middlewares/rateLimiters';
import { getCorsOrigins, getTrustProxy } from './config/env';

export interface AppOptions {
  /** Límite de intentos por IP. Activado por defecto; los tests lo desactivan salvo los suyos. */
  rateLimit?: boolean;
}

/** Crea la aplicación Express sin conectar a la BD ni escuchar en un puerto (útil para tests). */
export const createApp = ({ rateLimit = true }: AppOptions = {}) => {
  const app = express();

  const trustProxy = getTrustProxy();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

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
  }

  app.get('/', (req, res) => {
    res.send('Servidor corriendo y conectado a MongoDB');
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
