import { Request, Response } from 'express';
import * as scheduleService from '../services/scheduleService';
import { AppError } from '../utils/AppError';

// Las entradas llegan ya validadas por `validate(...)` (ver validation/schemas.ts).

/**
 * Un psicólogo crea franjas para sí mismo. Un administrador debe indicar `psychologist`.
 * `day` y `hour` se interpretan en la zona horaria del psicólogo. Con `repeatWeeks` se repite cada semana.
 */
export const createSchedule = async (req: Request, res: Response) => {
  const requester = req.user!;
  const { day, hour, repeatWeeks, psychologist: bodyPsychologist } = req.body;

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

  const { schedules, skipped } = await scheduleService.createSchedules({
    psychologist,
    day,
    hour,
    repeatWeeks,
  });
  res.status(201).json({ message: 'Horario creado exitosamente', schedules, skipped });
};

/**
 * Franjas de un psicólogo, ordenadas por instante de inicio, paginadas (?page=&limit=).
 *   ?available=true   solo libres y que aún no han empezado · ?available=false solo ocupadas
 *   ?from=YYYY-MM-DD  desde ese día (incluido) · ?to=YYYY-MM-DD hasta ese día (incluido)
 */
export const getSchedulesByPsychologist = async (req: Request, res: Response) => {
  const { available, from, to, page, limit } = req.query as unknown as {
    available?: boolean;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  };

  const result = await scheduleService.listSchedules(req.params.psychologistId, {
    available,
    from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    to: to ? new Date(`${to}T00:00:00.000Z`) : undefined,
    page,
    limit,
  });
  res.status(200).json(result);
};

/** Cambia el día y/o la hora de una franja libre propia. */
export const updateSchedule = async (req: Request, res: Response) => {
  const body = req.body;
  const forbidden = Object.keys(body).filter((key) => key !== 'day' && key !== 'hour');
  if (forbidden.length > 0) {
    throw new AppError(403, `No puedes modificar: ${forbidden.join(', ')}`);
  }
  if (body.day === undefined && body.hour === undefined) {
    throw new AppError(400, 'Indica day y/o hour');
  }

  const schedule = await scheduleService.updateSchedule(req.params.id, req.user!, { day: body.day, hour: body.hour });
  res.status(200).json({ message: 'Horario actualizado', schedule });
};

export const deleteSchedule = async (req: Request, res: Response) => {
  await scheduleService.deleteSchedule(req.params.id, req.user!);
  res.status(200).json({ message: 'Horario eliminado' });
};
