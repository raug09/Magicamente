/**
 * Datos para las pruebas de extremo a extremo (Frontend/e2e): un paciente y un psicólogo aprobados,
 * con franjas libres en enero de 2030. Pensado para una base de datos vacía o de pruebas.
 * Uso: MONGO_URI=... npx ts-node --transpile-only scripts/e2e-seed.ts
 * Nunca usar contra la base de datos real: borra los usuarios de prueba y sus franjas antes de crearlos.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User';
import Schedule from '../src/models/Schedule';
import Appointment from '../src/models/appointment';
import { hashPassword } from '../src/services/authService';
import { getMongoUri } from '../src/config/env';

export const E2E_PASSWORD = 'secreto123';
export const E2E_PATIENT_EMAIL = 'paciente.e2e@example.com';
export const E2E_PSYCHOLOGIST_EMAIL = 'psicologo.e2e@example.com';
export const E2E_PSYCHOLOGIST_NAME = 'Ana E2E Pérez';
/** Día de las franjas de prueba (calendario del psicólogo, zona America/Bogota). */
export const E2E_DAY = '2030-01-14';
export const E2E_HOURS = ['10:00', '15:00'];

const seed = async (): Promise<void> => {
  await mongoose.connect(getMongoUri());
  const emails = [E2E_PATIENT_EMAIL, E2E_PSYCHOLOGIST_EMAIL];
  const old = await User.find({ email: { $in: emails } }).select('_id');
  const ids = old.map((user) => user._id);
  await Appointment.deleteMany({ $or: [{ patientId: { $in: ids } }, { psychologistId: { $in: ids } }] });
  await Schedule.deleteMany({ psychologist: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });

  const password = await hashPassword(E2E_PASSWORD);
  await User.create({
    name: 'Laura E2E',
    email: E2E_PATIENT_EMAIL,
    password,
    role: 'paciente',
    timezone: 'America/Bogota',
    emailVerified: true,
  });
  const psychologist = await User.create({
    name: E2E_PSYCHOLOGIST_NAME,
    email: E2E_PSYCHOLOGIST_EMAIL,
    password,
    role: 'psicologo',
    timezone: 'America/Bogota',
    studies: ['Psicología clínica'],
    description: 'Terapia cognitivo-conductual.',
    emailVerified: true,
    verificationStatus: 'aprobado',
    approved: true,
  });
  for (const hour of E2E_HOURS) {
    await Schedule.create({
      psychologist: psychologist._id,
      day: new Date(`${E2E_DAY}T00:00:00.000Z`),
      hour,
      timezone: 'America/Bogota',
    });
  }
  console.log(`Datos de prueba creados: ${E2E_HOURS.length} franjas el ${E2E_DAY}.`);
  await mongoose.disconnect();
};

if (require.main === module) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
