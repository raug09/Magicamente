// Debe ser la primera línea: carga Backend/.env antes que cualquier otro módulo.
import 'dotenv/config';
import { createApp } from './app';
import connectDB from './config/db';
import { startCronJobs } from './config/cronJobs';
import { runMigrations } from './config/migrations';
import { assertRequiredEnv, getMongoUri, getPort } from './config/env';

const main = async (): Promise<void> => {
  assertRequiredEnv();
  await connectDB(getMongoUri());
  await runMigrations();
  startCronJobs();

  const port = getPort();
  createApp().listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
  });
};

main().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error instanceof Error ? error.message : error);
  process.exit(1);
});
