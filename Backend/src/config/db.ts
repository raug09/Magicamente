import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const connectDB = async (uri: string): Promise<void> => {
  await mongoose.connect(uri);
  logger.info('Conectado a MongoDB');
};

export default connectDB;
