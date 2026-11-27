import mongoose from 'mongoose';
import { describeMongoUri } from './mongoUri';
import { logger } from '../utils/logger';

const connectDB = async (uri: string): Promise<void> => {
  try {
    await mongoose.connect(uri);
  } catch (error) {
    // Ayuda a encontrar errores de copiado en MONGO_URI sin escribir la contraseña en el log.
    logger.error({ diagnostico: describeMongoUri(uri) }, 'No se pudo conectar a MongoDB: revisa MONGO_URI (diagnóstico sin contraseña)');
    throw error;
  }
  logger.info('Conectado a MongoDB');
};

export default connectDB;
