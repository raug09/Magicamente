import Schedule from '../models/Schedule';
import User from '../models/User';
import { AuthUser } from '../middlewares/auth';
import { AppError } from '../utils/AppError';

export interface CreateScheduleInput {
  psychologist: string;
  day: Date;
  hour: string;
  recurrent?: boolean;
}

export interface ListSchedulesFilter {
  /** true: solo franjas libres y futuras; false: solo las ocupadas; undefined: todas. */
  available?: boolean;
  /** Primer día incluido (medianoche UTC). */
  from?: Date;
  /** Último día incluido (medianoche UTC). */
  to?: Date;
}

/** Fecha y hora (UTC) en la que empieza una franja. */
export const slotStart = (day: Date, hour: string): Date => {
  const [hours, minutes] = hour.split(':').map(Number);
  const start = new Date(day);
  start.setUTCHours(hours, minutes, 0, 0);
  return start;
};

export const createSchedule = async ({ psychologist, day, hour, recurrent }: CreateScheduleInput) => {
  const psychologistUser = await User.findOne({ _id: psychologist, role: 'psicologo' });
  if (!psychologistUser) {
    throw new AppError(404, 'Psicólogo no encontrado');
  }

  const existingSchedule = await Schedule.findOne({ psychologist, day, hour });
  if (existingSchedule) {
    throw new AppError(409, 'Ya existe un horario con la misma fecha y hora para este psicólogo.');
  }

  const schedule = await Schedule.create({ psychologist, day, hour, recurrent });
  await User.findByIdAndUpdate(psychologist, { $push: { schedules: schedule._id } });

  return schedule;
};

/** Franjas de un psicólogo ordenadas por fecha y hora, con filtros opcionales. */
export const listSchedules = async (psychologist: string, { available, from, to }: ListSchedulesFilter = {}) => {
  const filter: Record<string, unknown> = { psychologist };
  if (available !== undefined) filter.isAvailable = available;

  const day: Record<string, Date> = {};
  if (from) day.$gte = from;
  if (to) day.$lte = to;
  if (Object.keys(day).length > 0) filter.day = day;

  const schedules = await Schedule.find(filter).sort({ day: 1, hour: 1 });

  // "Disponible" también significa que todavía no ha empezado (no se pueden reservar franjas pasadas).
  if (available === true) {
    const now = new Date();
    return schedules.filter((schedule) => slotStart(schedule.day, schedule.hour) > now);
  }
  return schedules;
};

/** Mantengo el nombre anterior por compatibilidad. */
export const getScheduleById = listSchedules;

export const updateAvailabilitySchedule = async (scheduleId: string, isAvailable: boolean) => {
  await Schedule.findByIdAndUpdate(scheduleId, { isAvailable });
};

/** Devuelve la franja si es del usuario (o este es administrador). 404 si no existe, 403 si es de otro. */
const getOwnedSchedule = async (scheduleId: string, user: AuthUser) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) {
    throw new AppError(404, 'El horario no existe.');
  }
  if (user.role !== 'administrador' && schedule.psychologist.toString() !== user.id) {
    throw new AppError(403, 'Solo puedes gestionar tus propios horarios.');
  }
  return schedule;
};

const OCCUPIED_MESSAGE = 'El horario tiene una cita reservada: cancélala antes de modificarlo o borrarlo.';

/** Cambia el día y/o la hora de una franja libre. */
export const updateSchedule = async (
  scheduleId: string,
  user: AuthUser,
  changes: { day?: Date; hour?: string }
) => {
  const schedule = await getOwnedSchedule(scheduleId, user);
  if (!schedule.isAvailable) {
    throw new AppError(409, OCCUPIED_MESSAGE);
  }

  const day = changes.day ?? schedule.day;
  const hour = changes.hour ?? schedule.hour;

  const duplicate = await Schedule.findOne({ _id: { $ne: schedule._id }, psychologist: schedule.psychologist, day, hour });
  if (duplicate) {
    throw new AppError(409, 'Ya existe un horario con la misma fecha y hora para este psicólogo.');
  }

  // Condicionado a isAvailable: si alguien reservó entre medias, no se modifica.
  const updated = await Schedule.findOneAndUpdate({ _id: schedule._id, isAvailable: true }, { day, hour }, { new: true });
  if (!updated) {
    throw new AppError(409, OCCUPIED_MESSAGE);
  }
  return updated;
};

/** Borra una franja libre y la quita de la lista del psicólogo. */
export const deleteSchedule = async (scheduleId: string, user: AuthUser) => {
  const schedule = await getOwnedSchedule(scheduleId, user);

  // Condicionado a isAvailable: nunca se borra una franja que alguien acaba de reservar.
  const deleted = await Schedule.findOneAndDelete({ _id: schedule._id, isAvailable: true });
  if (!deleted) {
    throw new AppError(409, OCCUPIED_MESSAGE);
  }
  await User.findByIdAndUpdate(deleted.psychologist, { $pull: { schedules: deleted._id } });
  return deleted;
};
