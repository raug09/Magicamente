import Schedule from '../models/Schedule';
import User from '../models/User';
import { AuthUser } from '../middlewares/auth';
import { AppError } from '../utils/AppError';
import { getAppTimezone } from '../config/env';
import { weeklyOccurrences, zonedTimeToUtc } from '../utils/timezone';

export interface CreateScheduleInput {
  psychologist: string;
  /** Día del calendario del psicólogo, "YYYY-MM-DD". */
  day: string;
  /** Hora de pared del psicólogo, "HH:mm". */
  hour: string;
  /** Cuántas semanas seguidas se repite (1 = solo ese día). */
  repeatWeeks?: number;
}

export interface ListSchedulesFilter {
  /** true: solo franjas libres y futuras; false: solo las ocupadas; undefined: todas. */
  available?: boolean;
  /** Primer día incluido (medianoche UTC), referido al calendario del psicólogo. */
  from?: Date;
  /** Último día incluido (medianoche UTC), referido al calendario del psicólogo. */
  to?: Date;
}

/** Instante en que empieza una franja guardada sin `startsAt` (datos antiguos, siempre en UTC). */
export const slotStart = (day: Date, hour: string): Date => {
  const [hours, minutes] = hour.split(':').map(Number);
  const start = new Date(day);
  start.setUTCHours(hours, minutes, 0, 0);
  return start;
};

/** Zona horaria del psicólogo, o la de la aplicación si no tiene. */
const timezoneOf = (user: { timezone?: string }): string => user.timezone || getAppTimezone();

/**
 * Crea una franja, o una por semana si `repeatWeeks > 1`. `day` y `hour` se interpretan en la zona
 * horaria del psicólogo; cada ocurrencia conserva la misma hora de pared aunque cambie el horario de verano.
 * Las que ya existían se omiten y se devuelven en `skipped`.
 */
export const createSchedules = async ({ psychologist, day, hour, repeatWeeks = 1 }: CreateScheduleInput) => {
  const psychologistUser = await User.findOne({ _id: psychologist, role: 'psicologo', isActive: { $ne: false }, deletedAt: null });
  if (!psychologistUser) {
    throw new AppError(404, 'Psicólogo no encontrado');
  }
  if (psychologistUser.approved === false) {
    throw new AppError(403, 'Tu cuenta de psicólogo está pendiente de aprobación');
  }
  const timezone = timezoneOf(psychologistUser);

  // Se calculan todas antes de crear ninguna: si una cae en un cambio de hora, no se crea nada.
  const occurrences = weeklyOccurrences(day, hour, timezone, repeatWeeks);
  if (occurrences[0].startsAt <= new Date()) {
    throw new AppError(400, 'No puedes crear horarios en fechas pasadas');
  }

  const schedules = [];
  const skipped: string[] = [];
  for (const occurrence of occurrences) {
    const dayDate = new Date(`${occurrence.day}T00:00:00.000Z`);
    if (await Schedule.exists({ psychologist, day: dayDate, hour })) {
      skipped.push(occurrence.day);
      continue;
    }
    try {
      schedules.push(await Schedule.create({ psychologist, day: dayDate, hour, timezone, startsAt: occurrence.startsAt }));
    } catch (error) {
      // Dos peticiones simultáneas: la base de datos rechaza la segunda (índice único).
      if ((error as { code?: number }).code !== 11000) throw error;
      skipped.push(occurrence.day);
    }
  }

  if (schedules.length === 0) {
    throw new AppError(409, 'Ya existe un horario con la misma fecha y hora para este psicólogo.');
  }
  await User.findByIdAndUpdate(psychologist, { $push: { schedules: { $each: schedules.map((schedule) => schedule._id) } } });

  return { schedules, skipped };
};

/** Franjas de un psicólogo ordenadas por instante de inicio, con filtros opcionales. */
export const listSchedules = async (psychologist: string, { available, from, to }: ListSchedulesFilter = {}) => {
  const filter: Record<string, unknown> = { psychologist };
  if (available !== undefined) filter.isAvailable = available;
  // "Disponible" también significa que todavía no ha empezado (no se pueden reservar franjas pasadas).
  if (available === true) filter.startsAt = { $gt: new Date() };

  const day: Record<string, Date> = {};
  if (from) day.$gte = from;
  if (to) day.$lte = to;
  if (Object.keys(day).length > 0) filter.day = day;

  return Schedule.find(filter).sort({ startsAt: 1 });
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

/**
 * Cambia el día y/o la hora de una franja libre. Se interpretan en la zona horaria ACTUAL del psicólogo,
 * y la franja pasa a guardarse con ella.
 */
export const updateSchedule = async (
  scheduleId: string,
  user: AuthUser,
  changes: { day?: string; hour?: string }
) => {
  const schedule = await getOwnedSchedule(scheduleId, user);
  if (!schedule.isAvailable) {
    throw new AppError(409, OCCUPIED_MESSAGE);
  }

  const owner = await User.findById(schedule.psychologist);
  const timezone = timezoneOf(owner ?? {});
  const dayString = changes.day ?? schedule.day.toISOString().slice(0, 10);
  const hour = changes.hour ?? schedule.hour;

  const startsAt = zonedTimeToUtc(dayString, hour, timezone);
  if (startsAt <= new Date()) {
    throw new AppError(400, 'No puedes mover un horario a una fecha pasada');
  }
  const day = new Date(`${dayString}T00:00:00.000Z`);

  const duplicate = await Schedule.findOne({ _id: { $ne: schedule._id }, psychologist: schedule.psychologist, day, hour });
  if (duplicate) {
    throw new AppError(409, 'Ya existe un horario con la misma fecha y hora para este psicólogo.');
  }

  // Condicionado a isAvailable: si alguien reservó entre medias, no se modifica.
  const updated = await Schedule.findOneAndUpdate(
    { _id: schedule._id, isAvailable: true },
    { day, hour, timezone, startsAt },
    { new: true }
  );
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
