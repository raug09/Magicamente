import { AppError } from './AppError';

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt solo usa los primeros 72 bytes: más allá se ignorarían en silencio. */
export const MAX_PASSWORD_BYTES = 72;

/** Política única para registro, cambio de contraseña y recuperación. Lanza 400 si no se cumple. */
export const assertValidPassword = (password: unknown): string => {
  if (typeof password !== 'string' || password.trim() === '') {
    throw new AppError(400, 'password debe ser un texto no vacío');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new AppError(400, `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes`);
  }
  return password;
};
