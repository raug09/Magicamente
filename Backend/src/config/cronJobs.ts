import cron from 'node-cron';
import Appointment from '../models/appointment';
import User from '../models/User';
import { sendEmail } from '../services/emailService';
import { formatAppointmentDate } from '../utils/dates';
import { logger } from '../utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

export { formatAppointmentDate };

/**
 * Envía un único recordatorio por cita pendiente que empiece en las próximas 24 horas.
 * Devuelve cuántos correos se enviaron.
 */
export const sendAppointmentReminders = async (now = new Date()): Promise<number> => {
  const candidates = await Appointment.find({
    state: 'pendiente',
    reminderSent: { $ne: true },
    time: { $gt: now, $lte: new Date(now.getTime() + DAY_MS) },
  }).select('_id');

  let sent = 0;
  for (const { _id } of candidates) {
    // Se "reserva" la cita antes de enviar para no duplicar si dos procesos coinciden.
    const appointment = await Appointment.findOneAndUpdate(
      { _id, reminderSent: { $ne: true } },
      { reminderSent: true },
      { new: true }
    );
    if (!appointment) continue;

    try {
      const patient = await User.findById(appointment.patientId);
      if (!patient) {
        logger.warn({ appointmentId: String(_id), patientId: String(appointment.patientId) }, 'Recordatorios: paciente no encontrado');
        continue;
      }
      const { date, hour } = formatAppointmentDate(appointment.time, patient.timezone);
      await sendEmail('appointmentReminder', patient.email, patient.name, date, hour);
      sent++;
    } catch (error) {
      // Se libera para reintentarlo en la siguiente ejecución.
      await Appointment.updateOne({ _id }, { reminderSent: false });
      logger.error({ err: error, appointmentId: String(_id) }, 'Recordatorios: error al procesar la cita');
    }
  }
  return sent;
};

/** Programa los recordatorios: al minuto 0 de cada hora. */
export const startCronJobs = () => {
  return cron.schedule('0 * * * *', async () => {
    try {
      const sent = await sendAppointmentReminders();
      if (sent > 0) logger.info(`Recordatorios: ${sent} enviado(s)`);
    } catch (error) {
      logger.error({ err: error }, 'Recordatorios: error al ejecutar el cron');
    }
  });
};
