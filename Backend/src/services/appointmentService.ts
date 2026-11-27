import Appointment, { IAppointment } from '../models/appointment';
import Schedule from '../models/Schedule';
import User from '../models/User';
import { slotStart, updateAvailabilitySchedule } from './scheduleService';
import { AuthUser } from '../middlewares/auth';
import { AppError } from '../utils/AppError';

/**
 * Devuelve la cita si quien la pide es su paciente, su psicólogo o un administrador.
 * 404 si no existe, 403 si no le pertenece.
 */
export const getOwnedAppointment = async (appointmentId: string, user: AuthUser): Promise<IAppointment> => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError(404, 'La cita no existe.');
  }
  const isParticipant =
    appointment.patientId.toString() === user.id || appointment.psychologistId.toString() === user.id;
  if (user.role !== 'administrador' && !isParticipant) {
    throw new AppError(403, 'No tienes permiso sobre esta cita.');
  }
  return appointment;
};

/**
 * Reserva una franja. El paciente sale del token y el psicólogo de la propia franja:
 * el cliente solo elige `scheduleId`. Los errores se lanzan como `AppError`.
 */
export const scheduleAppointment = async ({ patientId, scheduleId }: { patientId: string; scheduleId: unknown }) => {
  if (typeof scheduleId !== 'string' || scheduleId.trim() === '') {
    throw new AppError(400, 'scheduleId es obligatorio');
  }

  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) {
    throw new AppError(404, 'El horario no existe.');
  }
  if (!schedule.isAvailable) {
    throw new AppError(409, 'Este horario ya está ocupado.');
  }
  const psychologist = await User.findOne({ _id: schedule.psychologist, approved: { $ne: false }, isActive: { $ne: false }, deletedAt: null });
  if (!psychologist) {
    throw new AppError(409, 'El psicólogo ya no está disponible.');
  }

  const appointmentTime = schedule.startsAt ?? slotStart(schedule.day, schedule.hour);
  if (appointmentTime < new Date()) {
    throw new AppError(400, 'No puedes agendar citas en fechas pasadas.');
  }

  // Las citas canceladas no cuentan: se puede volver a reservar a esa hora.
  const existingPatientAppointment = await Appointment.findOne({
    patientId,
    time: appointmentTime,
    state: { $ne: 'cancelada' },
  });
  if (existingPatientAppointment) {
    throw new AppError(409, 'Ya tienes una cita programada en este horario.');
  }

  // Reserva atómica: solo uno de dos pacientes simultáneos consigue marcar la franja como ocupada.
  const claimed = await Schedule.findOneAndUpdate({ _id: schedule._id, isAvailable: true }, { isAvailable: false });
  if (!claimed) {
    throw new AppError(409, 'Este horario ya está ocupado.');
  }

  try {
    return await Appointment.create({
      patientId,
      psychologistId: schedule.psychologist,
      scheduleId: schedule._id,
      time: appointmentTime,
      hour: schedule.hour,
      state: 'pendiente',
    });
  } catch (error) {
    await updateAvailabilitySchedule(String(schedule._id), true); // no dejar la franja bloqueada
    throw error;
  }
};

/**
 * Marca una cita pendiente como completada. Solo el psicólogo de la cita (o un administrador)
 * y solo cuando la hora de la cita ya pasó.
 */
export const completeAppointment = async (appointmentId: string, user: AuthUser) => {
  const appointment = await getOwnedAppointment(appointmentId, user);

  if (user.role !== 'administrador' && appointment.psychologistId.toString() !== user.id) {
    throw new AppError(403, 'Solo el psicólogo de la cita puede marcarla como completada.');
  }
  if (appointment.state !== 'pendiente') {
    throw new AppError(400, `La cita ya está ${appointment.state}.`);
  }
  if (appointment.time > new Date()) {
    throw new AppError(400, 'No puedes completar una cita que todavía no ha ocurrido.');
  }

  appointment.state = 'completada';
  await appointment.save();
  return appointment;
};

/** Cancela una cita pendiente y libera su franja. */
export const cancelAppointment = async (appointmentId: string, user: AuthUser) => {
  const owned = await getOwnedAppointment(appointmentId, user);
  if (owned.state === 'pendiente' && owned.time <= new Date()) {
    throw new AppError(400, 'No puedes cancelar una cita que ya ha pasado.');
  }

  // Condicionado a 'pendiente': cancelar dos veces no debe liberar una franja ya reservada de nuevo.
  const appointment = await Appointment.findOneAndUpdate(
    { _id: owned._id, state: 'pendiente' },
    { state: 'cancelada' },
    { new: true, runValidators: true }
  );
  if (!appointment) {
    throw new AppError(400, `No se puede cancelar una cita ${owned.state}.`);
  }

  await updateAvailabilitySchedule(appointment.scheduleId.toString(), true);
  return appointment;
};

export const getAppointmentsByPatient = async (patientId: string) => {
  return Appointment.find({ patientId })
    .sort({ time: 1 })
    .populate('scheduleId')
    .populate('psychologistId', 'name studies description');
};

export const getAppointmentsByPsychologist = async (psychologistId: string) => {
  return Appointment.find({ psychologistId })
    .sort({ time: 1 })
    .populate('scheduleId')
    .populate('patientId', 'name email');
};
