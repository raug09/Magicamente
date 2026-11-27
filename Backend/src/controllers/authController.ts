import { Request, Response } from 'express';
import { registerService, loginService } from '../services/authService';
import { AppError } from '../utils/AppError';

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

export const register = async (req: Request, res: Response) => {
  const { name, email, password, role, studies } = req.body ?? {};

  if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
    throw new AppError(400, 'name, email y password son obligatorios');
  }
  if (studies !== undefined && (!Array.isArray(studies) || !studies.every((s) => typeof s === 'string'))) {
    throw new AppError(400, 'studies debe ser una lista de textos');
  }

  await registerService({ name, email, password, role, studies });
  res.status(201).json({ message: 'Usuario registrado correctamente' });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    throw new AppError(400, 'email y password son obligatorios');
  }

  const token = await loginService(email, password);
  res.status(200).json({ token });
};
