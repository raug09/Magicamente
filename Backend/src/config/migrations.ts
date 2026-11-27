import Appointment from '../models/appointment';

/**
 * Se ejecuta en cada arranque, después de conectar a MongoDB. Es idempotente.
 *  1. Corrige las citas guardadas con el estado inválido 'cancelled' (ahora es 'cancelada').
 *  2. Sincroniza los índices de las citas: sustituye el índice único antiguo de `scheduleId`
 *     por el parcial (solo citas pendientes o completadas).
 */
export const runMigrations = async (): Promise<void> => {
  const fixed = await Appointment.updateMany({ state: 'cancelled' }, { $set: { state: 'cancelada' } });
  if (fixed.modifiedCount > 0) {
    console.log(`[migración] ${fixed.modifiedCount} cita(s) 'cancelled' → 'cancelada'`);
  }
  await Appointment.syncIndexes();
};
