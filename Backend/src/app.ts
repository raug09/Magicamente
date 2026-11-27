import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import appointmentRoutes from './routes/appointment';
import scheduleRoutes from './routes/schedule';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

/** Crea la aplicación Express sin conectar a la BD ni escuchar en un puerto (útil para tests). */
export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/', (req, res) => {
    res.send('Servidor corriendo y conectado a MongoDB');
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/schedule', scheduleRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
