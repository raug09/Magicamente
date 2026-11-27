import User, { IUser } from '../models/User';
import { ROLES, Role } from '../middlewares/auth';
import { AppError } from '../utils/AppError';
import { hashPassword } from './authService';
import { assertValidPassword } from '../utils/password';

/** Campos visibles de un psicólogo para cualquier usuario autenticado. */
const PUBLIC_PSYCHOLOGIST_FIELDS = 'name role studies description';

/** Campos que cualquier usuario puede cambiar de su propia cuenta. */
const SELF_EDITABLE = ['name', 'description', 'studies', 'password'] as const;
/** Campos que además puede cambiar un administrador. */
const ADMIN_EDITABLE = [...SELF_EDITABLE, 'email', 'role', 'isActive'] as const;

export const getUserService = async (id: string): Promise<IUser | null> => {
  return User.findById(id).select('-password');
};

export const getPublicPsychologistService = async (id: string): Promise<IUser | null> => {
  return User.findOne({ _id: id, role: 'psicologo' }).select(PUBLIC_PSYCHOLOGIST_FIELDS);
};

/**
 * Actualiza solo los campos permitidos para quien hace la petición.
 * Los campos no permitidos se rechazan con 403 para que el cliente lo sepa.
 */
export const updateUserService = async (
  id: string,
  updateData: Record<string, unknown>,
  requesterRole: Role
): Promise<IUser | null> => {
  const allowed: readonly string[] = requesterRole === 'administrador' ? ADMIN_EDITABLE : SELF_EDITABLE;
  const forbidden = Object.keys(updateData).filter((key) => !allowed.includes(key));
  if (forbidden.length > 0) {
    throw new AppError(403, `No puedes modificar: ${forbidden.join(', ')}`);
  }

  const update: Record<string, unknown> = { ...updateData };

  if ('password' in update) {
    update.password = await hashPassword(assertValidPassword(update.password));
    update.passwordChangedAt = new Date(); // invalida las sesiones abiertas (también la actual)
  }
  if ('role' in update && !ROLES.includes(update.role as Role)) {
    throw new AppError(400, `role debe ser uno de: ${ROLES.join(', ')}`);
  }

  return User.findByIdAndUpdate(id, update, { new: true, runValidators: true }).select('-password');
};

export const deleteUserService = async (id: string): Promise<IUser | null> => {
  return User.findByIdAndDelete(id);
};

export const listUsersService = async (): Promise<IUser[]> => {
  return User.find().select('-password');
};
