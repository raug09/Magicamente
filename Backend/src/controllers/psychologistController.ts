import { Request, Response } from 'express';
import * as psychologistService from '../services/psychologistService';

/** Listado de psicólogos activos. `q`, `page` y `limit` llegan ya validados (ver `listPsychologistsQuery`). */
export const listPsychologists = async (req: Request, res: Response) => {
  const { q, page, limit } = req.query as unknown as { q?: string; page: number; limit: number };
  res.status(200).json(await psychologistService.listPsychologists({ q: q || undefined, page, limit }));
};
