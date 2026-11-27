import Appointment from '../models/appointment';
import Schedule from '../models/Schedule';
import User from '../models/User';
import { getAppTimezone } from './env';
import { slotStart } from '../services/scheduleService';

/**
 * Se ejecuta en cada arranque, después de conectar a MongoDB. Es idempotente.
 *  1. Corrige las citas guardadas con el estado inválido 'cancelled' (ahora es 'cancelada').
 *  2. Sincroniza los índices de las citas: sustituye el índice único antiguo de `scheduleId`
 *     por el parcial (solo citas pendientes o completadas).
 *  3. Da zona horaria a los usuarios que no tenían (la de la aplicación, `APP_TIMEZONE`, por defecto UTC).
 *  4. Completa las franjas antiguas con `startsAt` y `timezone`. Hasta ahora todo se interpretaba en UTC,
 *     así que su instante real es día + hora en UTC.
 */
export const runMigrations = async (): Promise<void> => {
  const fixed = await Appointment.updateMany({ state: 'cancelled' }, { $set: { state: 'cancelada' } });
  if (fixed.modifiedCount > 0) {
    console.log(`[migración] ${fixed.modifiedCount} cita(s) 'cancelled' → 'cancelada'`);
  }
  await Appointment.syncIndexes();

  const users = await User.updateMany({ timezone: { $exists: false } }, { $set: { timezone: getAppTimezone() } });
  if (users.modifiedCount > 0) {
    console.log(`[migración] ${users.modifiedCount} usuario(s) con zona horaria ${getAppTimezone()}`);
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
    console.log(`[migración] ${migratedSchedules} franja(s) con startsAt`);
  }
};
