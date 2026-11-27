import { Request, Response } from 'express';
import { registerService, loginService, forgotPasswordService, resetPasswordService, signToken } from '../services/authService';
import { getUserService } from '../services/userService';
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

  const user = await registerService({ name, email, password, role, studies });
  // Se devuelve la sesión ya iniciada: el frontend no necesita un login extra.
  res.status(201).json({
    message: 'Usuario registrado correctamente',
    token: signToken(user),
    user: await getUserService(String(user._id)),
  });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    throw new AppError(400, 'email y password son obligatorios');
  }

  const token = await loginService(email, password);
  res.status(200).json({ token });
};

/** Responde siempre lo mismo, exista o no el email, para no revelar qué cuentas están registradas. */
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!isNonEmptyString(email)) {
    throw new AppError(400, 'email es obligatorio');
  }

  await forgotPasswordService(email);
  res.status(200).json({ message: 'Si el email está registrado, recibirás un enlace para restablecer tu contraseña' });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body ?? {};
  if (!isNonEmptyString(token) || !isNonEmptyString(password)) {
    throw new AppError(400, 'token y password son obligatorios');
  }

  await resetPasswordService(token, password);
  res.status(200).json({ message: 'Contraseña actualizada correctamente' });
};

/** El usuario autenticado: sirve para pintar la sesión sin decodificar el JWT. */
export const me = async (req: Request, res: Response) => {
  const user = await getUserService(req.user!.id);
  if (!user) {
    throw new AppError(404, 'Usuario no encontrado');
  }
  res.status(200).json(user);
};
