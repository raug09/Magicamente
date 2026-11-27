import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runMigrations } from '../src/config/migrations';
import { setStorage } from '../src/storage/documentStorage';
import { testStorage } from './memoryStorage';

process.env.JWT_SECRET = 'test-secret';
delete process.env.RESEND_API_KEY; // sin API key, emailService no envía nada

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init())); // índices únicos
  await runMigrations(); // índice parcial de citas
});

beforeEach(() => {
  testStorage.reset();
  setStorage(testStorage);
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
