import Appointment, { IAppointment } from '../models/appointment';
import Schedule from '../models/Schedule';
import { updateAvailabilitySchedule } from './scheduleService';

export const scheduleAppointment = async (appointmentData: IAppointment) => {
  const schedule = await Schedule.findById(appointmentData.scheduleId);
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
    patientId: appointmentData.patientId,
    time: appointmentTime,
  });

  if (existingPatientAppointment) {
    return { error: "Ya tienes una cita programada en este horario." };
  }

  // Crear la cita con la fecha y hora correcta en UTC
  const appointment = await Appointment.create({
    patientId: appointmentData.patientId,
    psychologistId: appointmentData.psychologistId,
    scheduleId: appointmentData.scheduleId,
    time: appointmentTime, // Fecha y hora en UTC
    hour: schedule.hour, 
    state: "pendiente",
  });

  // Marcar el horario como ocupado
  await Schedule.findByIdAndUpdate(schedule._id, { isAvailable: false });

  return appointment;
};


export const updateAppointment = async (appointmentId: string, updateData: Partial<{ time: Date; state: string }>) => {
  const appointment = await Appointment.findById(appointmentId);

  if (!appointment) {
    throw new Error('La cita no existe.');
  }

  const currentTime = new Date();
  const appointmentTime = new Date(appointment.time);
  const timeDifference = appointmentTime.getTime() - currentTime.getTime();

  if (timeDifference < 24 * 60 * 60 * 1000) {
    throw new Error('Solo puedes modificar la cita hasta 24 horas antes de la fecha programada.');
  }

  Object.assign(appointment, updateData);
  await appointment.save();
  return appointment;
};

export const cancelAppointment = async (appointmentId: string) => {
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