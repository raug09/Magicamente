import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/User';
import { sendEmail } from './emailService';
import { getFrontendUrl, getJwtSecret } from '../config/env';
import { AppError } from '../utils/AppError';
import { Role } from '../middlewares/auth';
import { assertValidPassword } from '../utils/password';

/** Roles que se pueden elegir en el registro público. Los administradores se crean aparte. */
export const SELF_REGISTER_ROLES: Role[] = ['paciente', 'psicologo'];

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  studies?: string[];
}

export const registerService = async ({ name, email, password, role = 'paciente', studies }: RegisterInput): Promise<IUser> => {
  if (!SELF_REGISTER_ROLES.includes(role)) {
    throw new AppError(400, `Rol no permitido en el registro. Usa: ${SELF_REGISTER_ROLES.join(', ')}`);
  }
  assertValidPassword(password);

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError(409, 'El email ya está en uso');
  }

  const newUser = new User({
    name,
    email,
    password: await hashPassword(password),
    role,
    studies,
  });
  await newUser.save();

  try {
    await sendEmail('confirmation', email, name);
  } catch (error) {
    // El usuario ya está guardado: un fallo de correo no debe romper el registro.
    console.error('Error al enviar email de confirmación:', error);
  }

  return newUser;
};

export const loginService = async (email: string, password: string): Promise<string> => {
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError(401, 'Credenciales inválidas');
  }
  // Solo se revela tras acertar la contraseña, para no delatar qué cuentas existen.
  if (user.isActive === false) {
    throw new AppError(403, 'Cuenta desactivada');
  }

  return jwt.sign({ id: user._id, role: user.role }, getJwtSecret(), { expiresIn: '1h' });
};

// --- Recuperación de contraseña -------------------------------------------------------------

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // el enlace caduca en 1 hora
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000; // como mucho un correo por minuto y cuenta

const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Genera un token de un solo uso y lo envía por correo. En la base de datos solo se guarda su hash.
 * No revela si el email existe: si no existe, está desactivado o se pidió hace menos de un minuto,
 * no hace nada y el controlador responde igual.
 */
export const forgotPasswordService = async (email: string): Promise<void> => {
  const user = await User.findOne({ email }).select('+passwordResetExpires');
  if (!user || user.isActive === false) return;

  const now = Date.now();
  const lastRequestAt = user.passwordResetExpires ? user.passwordResetExpires.getTime() - RESET_TOKEN_TTL_MS : 0;
  if (now - lastRequestAt < RESET_REQUEST_COOLDOWN_MS) return;

  const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne(
    { _id: user._id },
    { passwordResetTokenHash: hashToken(token), passwordResetExpires: new Date(now + RESET_TOKEN_TTL_MS) }
  );

  // En segundo plano: así la respuesta tarda lo mismo exista o no el email.
  const resetLink = `${getFrontendUrl()}/reset-password?token=${token}`;
  sendEmail('resetPassword', user.email, user.name, resetLink).catch((error) => {
    console.error('Error al enviar el correo de recuperación de contraseña:', error);
  });
};

/** Cambia la contraseña con un token válido, no caducado y sin usar. El token se consume. */
export const resetPasswordService = async (token: string, newPassword: string): Promise<void> => {
  assertValidPassword(newPassword);

  // Una sola operación atómica: dos peticiones con el mismo token no pueden usarlo a la vez.
  const user = await User.findOneAndUpdate(
    { passwordResetTokenHash: hashToken(token), passwordResetExpires: { $gt: new Date() }, isActive: { $ne: false } },
    {
      password: await hashPassword(newPassword),
      passwordChangedAt: new Date(), // invalida las sesiones abiertas
      $unset: { passwordResetTokenHash: '', passwordResetExpires: '' },
    }
  );
  if (!user) {
    throw new AppError(400, 'El enlace no es válido o ha caducado');
  }
};
