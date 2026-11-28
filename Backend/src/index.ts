// Debe ser la primera línea: carga Backend/.env antes que cualquier otro módulo.
import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app';
import connectDB from './config/db';
import { startCronJobs } from './config/cronJobs';
import { runMigrations } from './config/migrations';
import { assertRequiredEnv, getMongoUri, getPort } from './config/env';
import { logger } from './utils/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const main = async (): Promise<void> => {
  assertRequiredEnv();
  await connectDB(getMongoUri());
  await runMigrations();
  const reminders = startCronJobs();

  const port = getPort();
  const server = createApp().listen(port, () => {
    logger.info(`Servidor escuchando en el puerto ${port}`);
  });

  // Apagado ordenado (Docker, Kubernetes, Ctrl+C): deja de aceptar peticiones, termina las que están en curso
  // y cierra la conexión con MongoDB. Si algo se queda colgado, se fuerza la salida.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Apagando el servidor');
    reminders.stop();
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

main().catch((error) => {
  logger.fatal({ err: error }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
