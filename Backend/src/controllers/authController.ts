import { Request, Response } from 'express';
import {
  registerService,
  loginService,
  forgotPasswordService,
  resetPasswordService,
  verifyEmailService,
  resendVerificationService,
  requestEmailChangeService,
  confirmEmailChangeService,
} from '../services/authService';
import { getUserService } from '../services/userService';
import { AppError } from '../utils/AppError';

// Las entradas llegan ya validadas y normalizadas por `validate(...)` (ver validation/schemas.ts).

export const register = async (req: Request, res: Response) => {
  const user = await registerService(req.body);
  // No se devuelve sesión: antes hay que confirmar el email.
  res.status(201).json({
    message: 'Usuario registrado. Revisa tu correo para confirmar la cuenta antes de iniciar sesión.',
    user: await getUserService(String(user._id)),
  });
};

export const login = async (req: Request, res: Response) => {
  const token = await loginService(req.body.email, req.body.password);
  res.status(200).json({ token });
};

export const verifyEmail = async (req: Request, res: Response) => {
  await verifyEmailService(req.body.token);
  res.status(200).json({ message: 'Email confirmado. Ya puedes iniciar sesión.' });
};

/** Responde siempre lo mismo, exista o no la cuenta pendiente de confirmar. */
export const resendVerification = async (req: Request, res: Response) => {
  await resendVerificationService(req.body.email);
  res.status(200).json({ message: 'Si la cuenta está pendiente de confirmar, recibirás un nuevo enlace.' });
};

/** Responde siempre lo mismo, exista o no el email, para no revelar qué cuentas están registradas. */
export const forgotPassword = async (req: Request, res: Response) => {
  await forgotPasswordService(req.body.email);
  res.status(200).json({ message: 'Si el email está registrado, recibirás un enlace para restablecer tu contraseña' });
};

export const resetPassword = async (req: Request, res: Response) => {
  await resetPasswordService(req.body.token, req.body.password);
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

/** Pide el cambio de email: requiere la sesión y la contraseña actual. Responde igual en todos los casos válidos. */
export const requestEmailChange = async (req: Request, res: Response) => {
  await requestEmailChangeService(req.user!.id, req.body.email, req.body.password);
  res.status(200).json({ message: 'Te hemos enviado un enlace de confirmación a la nueva dirección.' });
};

export const confirmEmailChange = async (req: Request, res: Response) => {
  await confirmEmailChangeService(req.body.token);
  res.status(200).json({ message: 'Correo actualizado. Úsalo la próxima vez que inicies sesión.' });
};
