import { Request, Response } from 'express';
import * as scheduleService from '../services/scheduleService';
import { AppError } from '../utils/AppError';

const HOUR_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDay = (value: unknown, name: string): Date => {
  const parsed = new Date(value as string);
  if (value === undefined || value === null || value === '' || Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `${name} debe ser una fecha válida (p. ej. "2026-12-15")`);
  }
  return parsed;
};

const parseHour = (value: unknown): string => {
  if (typeof value !== 'string' || !HOUR_PATTERN.test(value)) {
    throw new AppError(400, 'hour debe tener formato HH:mm');
  }
  return value;
};

const assertNotPast = (day: Date) => {
  if (day < new Date()) {
    throw new AppError(400, 'No puedes crear horarios en fechas pasadas');
  }
};

/**
 * Un psicólogo crea franjas para sí mismo. Un administrador debe indicar `psychologist`.
 */
export const createSchedule = async (req: Request, res: Response) => {
  const requester = req.user!;
  const { day, hour, recurrent, psychologist: bodyPsychologist } = req.body ?? {};

  let psychologist: string;
  if (requester.role === 'psicologo') {
    if (bodyPsychologist !== undefined && String(bodyPsychologist) !== requester.id) {
      throw new AppError(403, 'Solo puedes crear horarios para ti mismo');
    }
    psychologist = requester.id;
  } else {
    if (!bodyPsychologist) {
      throw new AppError(400, 'psychologist es obligatorio');
    }
    psychologist = String(bodyPsychologist);
  }

  const parsedDay = parseDay(day, 'day');
  const parsedHour = parseHour(hour);
  assertNotPast(parsedDay);

  const schedule = await scheduleService.createSchedule({
    psychologist,
    day: parsedDay,
    hour: parsedHour,
    recurrent: recurrent === true,
  });
  res.status(201).json({ message: 'Horario creado exitosamente', schedule });
};

/**
 * Franjas de un psicólogo, ordenadas por fecha y hora.
 *   ?available=true   solo libres y futuras · ?available=false solo ocupadas
 *   ?from=YYYY-MM-DD  desde ese día (incluido)
 *   ?to=YYYY-MM-DD    hasta ese día (incluido)
 */
export const getSchedulesByPsychologist = async (req: Request, res: Response) => {
  const { available, from, to } = req.query;

  let availableFilter: boolean | undefined;
  if (available !== undefined) {
    if (available !== 'true' && available !== 'false') {
      throw new AppError(400, 'available debe ser true o false');
    }
    availableFilter = available === 'true';
  }

  const parseQueryDay = (value: unknown, name: string): Date | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !DAY_PATTERN.test(value)) {
      throw new AppError(400, `${name} debe tener formato YYYY-MM-DD`);
    }
    return parseDay(value, name);
  };

  const fromDay = parseQueryDay(from, 'from');
  const toDay = parseQueryDay(to, 'to');
  if (fromDay && toDay && fromDay > toDay) {
    throw new AppError(400, 'from no puede ser posterior a to');
  }

  const schedules = await scheduleService.listSchedules(req.params.psychologistId, {
    available: availableFilter,
    from: fromDay,
    to: toDay,
  });
  res.status(200).json(schedules);
};

/** Cambia el día y/o la hora de una franja libre propia. */
export const updateSchedule = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const forbidden = Object.keys(body).filter((key) => key !== 'day' && key !== 'hour');
  if (forbidden.length > 0) {
    throw new AppError(403, `No puedes modificar: ${forbidden.join(', ')}`);
  }
  if (body.day === undefined && body.hour === undefined) {
    throw new AppError(400, 'Indica day y/o hour');
  }

  const changes: { day?: Date; hour?: string } = {};
  if (body.day !== undefined) {
    changes.day = parseDay(body.day, 'day');
    assertNotPast(changes.day);
  }
  if (body.hour !== undefined) {
    changes.hour = parseHour(body.hour);
  }

  const schedule = await scheduleService.updateSchedule(req.params.id, req.user!, changes);
  res.status(200).json({ message: 'Horario actualizado', schedule });
};

export const deleteSchedule = async (req: Request, res: Response) => {
  await scheduleService.deleteSchedule(req.params.id, req.user!);
  res.status(200).json({ message: 'Horario eliminado' });
};
