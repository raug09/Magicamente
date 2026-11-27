import { Request, Response } from 'express';
import * as scheduleService from '../services/scheduleService';
import { AppError } from '../utils/AppError';

const HOUR_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  const parsedDay = new Date(day);
  if (!day || Number.isNaN(parsedDay.getTime())) {
    throw new AppError(400, 'day debe ser una fecha válida (p. ej. "2026-12-15")');
  }
  if (typeof hour !== 'string' || !HOUR_PATTERN.test(hour)) {
    throw new AppError(400, 'hour debe tener formato HH:mm');
  }
  if (parsedDay < new Date()) {
    throw new AppError(400, 'No puedes crear horarios en fechas pasadas');
  }

  const schedule = await scheduleService.createSchedule({
    psychologist,
    day: parsedDay,
    hour,
    recurrent: recurrent === true,
  });
  res.status(201).json({ message: 'Horario creado exitosamente', schedule });
};

export const getSchedulesByPsychologist = async (req: Request, res: Response) => {
  const schedules = await scheduleService.getScheduleById(req.params.psychologistId);
  res.status(200).json(schedules);
};
