import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/User';
import Session from '../models/Session';
import { sendEmail } from './emailService';
import { getFrontendUrl, getJwtSecret } from '../config/env';
import { AppError } from '../utils/AppError';
import { Role } from '../middlewares/auth';
import { assertValidPassword } from '../utils/password';
import { assertValidTimeZone } from '../utils/timezone';
import { initialDocumentReviews } from '../utils/verification';
import { logger } from '../utils/logger';

/** Roles que se pueden elegir en el registro público. Los administradores se crean aparte. */
export const SELF_REGISTER_ROLES: Role[] = ['paciente', 'psicologo'];

/** Duración de una sesión: igual que la del token. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

/** JWT de sesión: caduca en 1 hora y lleva el `jti` de su sesión. El token solo vale si la sesión existe. */
export const signToken = (user: Pick<IUser, '_id' | 'role'>, jti: string): string =>
  jwt.sign({ id: user._id, role: user.role, jti }, getJwtSecret(), { expiresIn: '1h' });

/** Borra todas las sesiones de un usuario (cambio o restablecimiento de contraseña, borrado de cuenta, logout-all). */
export const deleteAllSessions = async (userId: unknown): Promise<void> => {
  await Session.deleteMany({ userId });
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
const newToken = (): string => crypto.randomBytes(32).toString('hex');

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  studies?: string[];
  timezone?: string;
}

// --- Verificación de email -------------------------------------------------------------------

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // el enlace caduca en 24 horas
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // como mucho un correo por minuto y cuenta

/** Crea un enlace de verificación nuevo (invalida el anterior) y lo envía en segundo plano. */
const issueEmailVerification = async (userId: unknown, email: string, name: string): Promise<void> => {
  const token = newToken();
  const now = new Date();
  await User.updateOne(
    { _id: userId },
    {
      emailVerificationTokenHash: hashToken(token),
      emailVerificationExpires: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
      emailVerificationSentAt: now,
    }
  );
  const verifyLink = `${getFrontendUrl()}/verify-email?token=${token}`;
  sendEmail('verifyEmail', email, name, verifyLink).catch((error) => {
    logger.error({ err: error }, 'Error al enviar el correo de verificación');
  });
};

export const registerService = async ({ name, email, password, role = 'paciente', studies, timezone }: RegisterInput): Promise<IUser> => {
  if (!SELF_REGISTER_ROLES.includes(role)) {
    throw new AppError(400, `Rol no permitido en el registro. Usa: ${SELF_REGISTER_ROLES.join(', ')}`);
  }
  assertValidPassword(password);
  if (timezone !== undefined) assertValidTimeZone(timezone);

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
    ...(timezone !== undefined && { timezone }),
    ...(role === 'psicologo' && { verificationDocuments: initialDocumentReviews() }),
  });
  await newUser.save();
  await issueEmailVerification(newUser._id, newUser.email, newUser.name);

  return newUser;
};

/** Confirma el email con un token válido, no caducado y sin usar. El token se consume. */
export const verifyEmailService = async (token: string): Promise<void> => {
  const user = await User.findOneAndUpdate(
    { emailVerificationTokenHash: hashToken(token), emailVerificationExpires: { $gt: new Date() }, isActive: { $ne: false } },
    {
      emailVerified: true,
      $unset: { emailVerificationTokenHash: '', emailVerificationExpires: '', emailVerificationSentAt: '' },
    }
  );
  if (!user) {
    throw new AppError(400, 'El enlace no es válido o ha caducado');
  }
};

/**
 * Reenvía el enlace de verificación. Responde igual exista o no la cuenta, y no hace nada si ya está
 * verificada o si se envió hace menos de un minuto.
 */
export const resendVerificationService = async (email: string): Promise<void> => {
  const user = await User.findOne({ email }).select('+emailVerificationSentAt');
  if (!user || user.emailVerified !== false || user.isActive === false) return;

  const lastSentAt = user.emailVerificationSentAt?.getTime() ?? 0;
  if (Date.now() - lastSentAt < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) return;

  await issueEmailVerification(user._id, user.email, user.name);
};

// --- Registro, login y sesión ----------------------------------------------------------------

export const loginService = async (email: string, password: string): Promise<string> => {
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError(401, 'Credenciales inválidas');
  }
  // Solo se revelan estos motivos tras acertar la contraseña, para no delatar qué cuentas existen.
  if (user.isActive === false) {
    throw new AppError(403, 'Cuenta desactivada');
  }
  if (user.emailVerified === false) {
    throw new AppError(403, 'Debes confirmar tu email antes de iniciar sesión. Revisa tu correo.');
  }

  const jti = crypto.randomUUID();
  await Session.create({ userId: user._id, jti, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  return signToken(user, jti);
};

/** Cierra la sesión en la que se hizo la petición. */
export const logoutService = async (jti: string): Promise<void> => {
  await Session.deleteOne({ jti });
};

/** Lista las sesiones abiertas del usuario. No expone el `jti`: solo un identificador de la sesión. */
export const listSessionsService = async (userId: string, currentJti?: string) => {
  const sessions = await Session.find({ userId, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  return sessions.map((session) => ({
    _id: session._id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    current: session.jti === currentJti,
  }));
};

/** Cierra una sesión concreta del propio usuario. 404 si no existe o es de otro usuario. */
export const revokeSessionService = async (userId: string, sessionId: string): Promise<void> => {
  const deleted = await Session.findOneAndDelete({ _id: sessionId, userId });
  if (!deleted) {
    throw new AppError(404, 'La sesión no existe');
  }
};

// --- Recuperación de contraseña -------------------------------------------------------------

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // el enlace caduca en 1 hora
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000; // como mucho un correo por minuto y cuenta

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

  const token = newToken();
  await User.updateOne(
    { _id: user._id },
    { passwordResetTokenHash: hashToken(token), passwordResetExpires: new Date(now + RESET_TOKEN_TTL_MS) }
  );

  // En segundo plano: así la respuesta tarda lo mismo exista o no el email.
  const resetLink = `${getFrontendUrl()}/reset-password?token=${token}`;
  sendEmail('resetPassword', user.email, user.name, resetLink).catch((error) => {
    logger.error({ err: error }, 'Error al enviar el correo de recuperación de contraseña');
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
  await deleteAllSessions(user._id);
};

// --- Cambio de email -------------------------------------------------------------------------

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000; // el enlace caduca en 24 horas
export const EMAIL_CHANGE_COOLDOWN_MS = 60 * 1000; // como mucho una solicitud por minuto

/**
 * Pide cambiar el email. Exige la contraseña actual (si alguien tiene la sesión abierta no basta para
 * apoderarse de la cuenta). Envía el enlace al NUEVO email y avisa al email ACTUAL.
 * Si se pidió hace menos de un minuto, no hace nada: la respuesta es igual.
 */
export const requestEmailChangeService = async (userId: string, newEmail: string, password: string): Promise<void> => {
  const user = await User.findById(userId).select('+password +emailChangeSentAt');
  if (!user) throw new AppError(404, 'Usuario no encontrado');

  if (!(await bcrypt.compare(password, user.password))) {
    throw new AppError(400, 'La contraseña no es correcta');
  }
  if (newEmail === user.email) {
    throw new AppError(400, 'Ese ya es tu correo');
  }
  if (await User.exists({ email: newEmail })) {
    throw new AppError(409, 'Ese email ya está en uso');
  }

  const lastSentAt = user.emailChangeSentAt?.getTime() ?? 0;
  if (Date.now() - lastSentAt < EMAIL_CHANGE_COOLDOWN_MS) return;

  const token = newToken();
  const now = new Date();
  await User.updateOne(
    { _id: user._id },
    {
      pendingEmail: newEmail,
      emailChangeTokenHash: hashToken(token),
      emailChangeExpires: new Date(now.getTime() + EMAIL_CHANGE_TTL_MS),
      emailChangeSentAt: now,
    }
  );

  const confirmLink = `${getFrontendUrl()}/confirm-email-change?token=${token}`;
  sendEmail('confirmEmailChange', newEmail, user.name, confirmLink).catch((error) => {
    logger.error({ err: error }, 'Error al enviar el correo de confirmación del cambio de email');
  });
  sendEmail('emailChangeRequested', user.email, user.name).catch((error) => {
    logger.error({ err: error }, 'Error al avisar del cambio de email');
  });
};

/** Aplica el cambio de email con un enlace válido. Si el email ya lo usa otra cuenta, se rechaza. */
export const confirmEmailChangeService = async (token: string): Promise<void> => {
  const user = await User.findOne({
    emailChangeTokenHash: hashToken(token),
    emailChangeExpires: { $gt: new Date() },
    isActive: { $ne: false },
  }).select('+pendingEmail +emailChangeTokenHash');
  if (!user || !user.pendingEmail) {
    throw new AppError(400, 'El enlace no es válido o ha caducado');
  }

  if (await User.exists({ email: user.pendingEmail, _id: { $ne: user._id } })) {
    throw new AppError(409, 'Ese email ya está en uso');
  }

  // Solo se aplica si el token sigue siendo el mismo: así un enlace usado no vuelve a funcionar.
  const updated = await User.findOneAndUpdate(
    { _id: user._id, emailChangeTokenHash: hashToken(token) },
    {
      email: user.pendingEmail,
      $unset: { pendingEmail: '', emailChangeTokenHash: '', emailChangeExpires: '', emailChangeSentAt: '' },
    }
  );
  if (!updated) {
    throw new AppError(400, 'El enlace no es válido o ha caducado');
  }
};
