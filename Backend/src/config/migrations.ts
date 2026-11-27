import Appointment from '../models/appointment';
import Schedule from '../models/Schedule';
import User from '../models/User';
import { getAppTimezone } from './env';
import { slotStart } from '../services/scheduleService';
import { logger } from '../utils/logger';

/**
 * Se ejecuta en cada arranque, después de conectar a MongoDB. Es idempotente.
 *  1. Corrige las citas guardadas con el estado inválido 'cancelled' (ahora es 'cancelada').
 *  2. Sincroniza los índices de las citas: sustituye el índice único antiguo de `scheduleId`
 *     por el parcial (solo citas pendientes o completadas).
 *  3. Da zona horaria a los usuarios que no tenían (la de la aplicación, `APP_TIMEZONE`, por defecto UTC).
 *  4. Completa las franjas antiguas con `startsAt` y `timezone` (hasta ahora todo se interpretaba en UTC).
 *  5. Da por verificadas las cuentas anteriores a la verificación de email, y por aprobados a los
 *     psicólogos anteriores a la aprobación.
 *  6. Crea el índice único de franjas (psicólogo + día + hora). Si ya hay duplicados, no se puede:
 *     se registra un error y hay que limpiarlos a mano (ver docs/05-manual-de-uso.md).
 */
export const runMigrations = async (): Promise<void> => {
  const fixed = await Appointment.updateMany({ state: 'cancelled' }, { $set: { state: 'cancelada' } });
  if (fixed.modifiedCount > 0) {
    logger.info(`Migración: ${fixed.modifiedCount} cita(s) 'cancelled' → 'cancelada'`);
  }
  await Appointment.syncIndexes();

  const timezones = await User.updateMany({ timezone: { $exists: false } }, { $set: { timezone: getAppTimezone() } });
  if (timezones.modifiedCount > 0) {
    logger.info(`Migración: ${timezones.modifiedCount} usuario(s) con zona horaria ${getAppTimezone()}`);
  }

  const verified = await User.updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true } });
  if (verified.modifiedCount > 0) {
    logger.info(`Migración: ${verified.modifiedCount} cuenta(s) anteriores marcadas como verificadas`);
  }
  const approved = await User.updateMany({ approved: { $exists: false } }, { $set: { approved: true } });
  if (approved.modifiedCount > 0) {
    logger.info(`Migración: ${approved.modifiedCount} cuenta(s) anteriores marcadas como aprobadas`);
  }

  const approvedPsychologists = await User.updateMany(
    { role: 'psicologo', verificationStatus: { $exists: false }, approved: true },
    { $set: { verificationStatus: 'aprobado' } }
  );
  const pendingPsychologists = await User.updateMany(
    { role: 'psicologo', verificationStatus: { $exists: false } },
    { $set: { verificationStatus: 'pendiente' } }
  );
  if (approvedPsychologists.modifiedCount + pendingPsychologists.modifiedCount > 0) {
    logger.info(`Migración: estado de verificación asignado a ${approvedPsychologists.modifiedCount + pendingPsychologists.modifiedCount} psicólogo(s)`);
  }

  let migratedSchedules = 0;
  let batch: Parameters<typeof Schedule.bulkWrite>[0] = [];
  const flush = async () => {
    if (batch.length > 0) {
      await Schedule.bulkWrite(batch);
      migratedSchedules += batch.length;
      batch = [];
    }
  };
  for await (const schedule of Schedule.find({ startsAt: { $exists: false } }).lean().cursor()) {
    batch.push({
      updateOne: {
        filter: { _id: schedule._id },
        update: { $set: { startsAt: slotStart(schedule.day, schedule.hour), timezone: 'UTC' } },
      },
    });
    if (batch.length >= 500) await flush();
  }
  await flush();
  if (migratedSchedules > 0) {
    logger.info(`Migración: ${migratedSchedules} franja(s) con startsAt`);
  }

  try {
    await Schedule.syncIndexes();
  } catch (error) {
    logger.error(
      { err: error },
      'Migración: no se pudo crear el índice único de franjas (¿hay franjas duplicadas?). Hay que limpiarlas a mano.'
    );
  }
};
