import Appointment, { APPOINTMENT_STATES, AppointmentState, IAppointment } from '../models/appointment';
import Schedule from '../models/Schedule';
import { updateAvailabilitySchedule } from './scheduleService';
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
 * El paciente sale del token y el psicólogo del propio horario: el cliente solo elige `scheduleId`.
 */
export const scheduleAppointment = async ({ patientId, scheduleId }: { patientId: string; scheduleId: string }) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) {
    return { error: "El horario no existe." };
  }
 if (!schedule.isAvailable) {
    return { error: "Este horario ya está ocupado." };
  }
  // Separar la hora y los minutos
  const [hours, minutes] = schedule.hour.split(":").map(Number);
  console.log("🕒 Hora programada:", hours, minutes);

  // Convertir `day` a UTC correctamente
  const appointmentTime = new Date(schedule.day);
  console.log("📅 Fecha programada (solo día):", appointmentTime);

  // Usar `setUTCHours` para evitar problemas de zona horaria
  appointmentTime.setUTCHours(hours, minutes, 0, 0);
  console.log("📅 Fecha y hora programada en UTC:", appointmentTime);

  // Validar que la fecha no esté en el pasado
  const now = new Date();
  if (appointmentTime < now) {
    return { error: "No puedes agendar citas en fechas pasadas." };
  }

  // Validar si el paciente ya tiene una cita en el mismo horario
  const existingPatientAppointment = await Appointment.findOne({
    patientId,
    time: appointmentTime,
  });

  if (existingPatientAppointment) {
    return { error: "Ya tienes una cita programada en este horario." };
  }

  // Crear la cita con la fecha y hora correcta en UTC
  const appointment = await Appointment.create({
    patientId,
    psychologistId: schedule.psychologist,
    scheduleId: schedule._id,
    time: appointmentTime, // Fecha y hora en UTC
    hour: schedule.hour, 
    state: "pendiente",
  });

  // Marcar el horario como ocupado
  await Schedule.findByIdAndUpdate(schedule._id, { isAvailable: false });

  return appointment;
};


/** Campos de una cita que se pueden modificar desde la API. */
const EDITABLE_APPOINTMENT_FIELDS = ['state'];

export const updateAppointment = async (appointmentId: string, updateData: Record<string, unknown>, user: AuthUser) => {
  const forbidden = Object.keys(updateData).filter((key) => !EDITABLE_APPOINTMENT_FIELDS.includes(key));
  if (forbidden.length > 0) {
    throw new AppError(403, `No puedes modificar: ${forbidden.join(', ')}`);
  }
  if ('state' in updateData && !APPOINTMENT_STATES.includes(updateData.state as AppointmentState)) {
    throw new AppError(400, `state debe ser uno de: ${APPOINTMENT_STATES.join(', ')}`);
  }

  const appointment = await getOwnedAppointment(appointmentId, user);

  const currentTime = new Date();
  const appointmentTime = new Date(appointment.time);
  const timeDifference = appointmentTime.getTime() - currentTime.getTime();

  if (timeDifference < 24 * 60 * 60 * 1000) {
    throw new AppError(400, 'Solo puedes modificar la cita hasta 24 horas antes de la fecha programada.');
  }

  Object.assign(appointment, updateData);
  await appointment.save();
  return appointment;
};

export const cancelAppointment = async (appointmentId: string, user: AuthUser) => {
  await getOwnedAppointment(appointmentId, user);

  const appointment = await Appointment.findByIdAndUpdate(
    appointmentId,
    { state: 'cancelled' },
    { new: true }
  );

  if (appointment) {
    // Marcar el horario como disponible nuevamente
    await updateAvailabilitySchedule(appointment.scheduleId.toString(), true);
  }

  return appointment;
};

export const getAppointmentsByPatient = async (patientId: string) => {
  return await Appointment.find({ patientId }).populate('scheduleId psychologistId');
};

export const getAppointmentsByPsychologist = async (psychologistId: string) => {
  return await Appointment.find({ psychologistId }).populate('scheduleId patientId');
};