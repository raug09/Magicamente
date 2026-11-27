import { Request, Response } from 'express';
import * as psychologistService from '../services/psychologistService';
import { AppError } from '../utils/AppError';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/** Convierte un parámetro de query en entero positivo; 400 si no lo es. */
const parsePositiveInt = (value: unknown, name: string, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(400, `${name} debe ser un entero positivo`);
  }
  return parsed;
};

/** Listado público (para usuarios autenticados) de psicólogos activos. */
export const listPsychologists = async (req: Request, res: Response) => {
  const { q } = req.query;
  if (q !== undefined && typeof q !== 'string') {
    throw new AppError(400, 'q debe ser un texto');
  }

  const page = parsePositiveInt(req.query.page, 'page', 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 'limit', DEFAULT_LIMIT), MAX_LIMIT);

  res.status(200).json(await psychologistService.listPsychologists({ q: q?.trim() || undefined, page, limit }));
};
