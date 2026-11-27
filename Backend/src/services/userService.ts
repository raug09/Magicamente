import crypto from 'crypto';
import User, { IUser } from '../models/User';
import Appointment from '../models/appointment';
import Schedule from '../models/Schedule';
import { ROLES, Role } from '../middlewares/auth';
import { AppError } from '../utils/AppError';
import { deleteAllSessions, hashPassword } from './authService';
import { deleteAllDocumentsOf } from './verificationDocumentService';
import { sendEmail } from './emailService';
import { updateAvailabilitySchedule } from './scheduleService';
import { assertValidPassword } from '../utils/password';
import { assertValidTimeZone } from '../utils/timezone';
import { formatAppointmentDate } from '../utils/dates';
import { logger } from '../utils/logger';

/** Campos visibles de un psicólogo para cualquier usuario autenticado. */
const PUBLIC_PSYCHOLOGIST_FIELDS = 'name role studies description';

/** Campos que cualquier usuario puede cambiar de su propia cuenta. */
const SELF_EDITABLE = ['name', 'description', 'studies', 'password', 'timezone'] as const;
/** Campos que además puede cambiar un administrador. */
const ADMIN_EDITABLE = [...SELF_EDITABLE, 'email', 'role', 'isActive'] as const;

/** Las cuentas eliminadas se conservan (anonimizadas) pero nunca se muestran. */
const NOT_DELETED = { deletedAt: null };

export const getUserService = async (id: string): Promise<IUser | null> => {
  return User.findOne({ _id: id, ...NOT_DELETED }).select('-password');
};

export const getPublicPsychologistService = async (id: string): Promise<IUser | null> => {
  return User.findOne({ _id: id, role: 'psicologo', approved: { $ne: false }, isActive: { $ne: false }, ...NOT_DELETED }).select(
    PUBLIC_PSYCHOLOGIST_FIELDS
  );
};

/**
 * Actualiza solo los campos permitidos para quien hace la petición.
 * Los campos no permitidos se rechazan con 403 para que el cliente lo sepa.
 */
export const updateUserService = async (id: string, updateData: Record<string, unknown>, requesterRole: Role): Promise<IUser | null> => {
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
  if ('timezone' in update) {
    update.timezone = assertValidTimeZone(update.timezone);
  }
  if ('role' in update && !ROLES.includes(update.role as Role)) {
    throw new AppError(400, `role debe ser uno de: ${ROLES.join(', ')}`);
  }

  const updated = await User.findOneAndUpdate({ _id: id, ...NOT_DELETED }, update, { new: true, runValidators: true }).select('-password');
  if (updated && 'password' in update) {
    await deleteAllSessions(updated._id); // cambiar la contraseña cierra todas las sesiones
  }
  return updated;
};

/** Avisa (sin bloquear el borrado si falla) a la otra persona de una cita cancelada por el borrado de una cuenta. */
const notifyCancellation = async (counterpartId: unknown, time: Date): Promise<void> => {
  try {
    const counterpart = await User.findOne({ _id: counterpartId, isActive: { $ne: false }, ...NOT_DELETED });
    if (!counterpart) return;
    const { date, hour } = formatAppointmentDate(time, counterpart.timezone);
    await sendEmail('appointmentCancelled', counterpart.email, counterpart.name, date, hour);
  } catch (error) {
    logger.error({ err: error }, 'Error al avisar de una cita cancelada');
  }
};

/**
 * Elimina una cuenta SIN dejar datos huérfanos:
 *  1. La cuenta se anonimiza y desactiva (nombre, email, contraseña y datos personales se pierden;
 *     el registro se conserva para que las citas completadas del historial sigan teniendo sentido).
 *     El email queda libre para volver a registrarse.
 *  2. Sus citas pendientes se cancelan y se avisa por correo a la otra persona.
 *     Si era el paciente, la franja vuelve a quedar libre.
 *  3. Si era psicólogo, se borran sus franjas sin historial; las que tienen citas se conservan, no reservables.
 * No se puede eliminar al último administrador activo. Devuelve null si la cuenta no existe.
 */
export const deleteUserService = async (id: string): Promise<IUser | null> => {
  const user = await User.findOne({ _id: id, ...NOT_DELETED });
  if (!user) return null;

  if (user.role === 'administrador') {
    const otherAdmins = await User.countDocuments({
      role: 'administrador',
      isActive: { $ne: false },
      _id: { $ne: user._id },
      ...NOT_DELETED,
    });
    if (otherAdmins === 0) {
      throw new AppError(409, 'No puedes eliminar al último administrador');
    }
  }

  // 1. Primero se bloquea la cuenta: así no puede seguir actuando mientras se limpia el resto.
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        name: 'Usuario eliminado',
        email: `deleted-${user._id}@deleted.invalid`,
        password: await hashPassword(crypto.randomBytes(32).toString('hex')),
        isActive: false,
        deletedAt: new Date(),
        passwordChangedAt: new Date(),
        studies: [],
        schedules: [],
      },
      $unset: { description: '', passwordResetTokenHash: '', passwordResetExpires: '' },
    }
  );

  await deleteAllSessions(user._id);
  await deleteAllDocumentsOf(user._id); // los documentos de identidad no se conservan

  // 2. Citas pendientes
  const pending = await Appointment.find({
    state: 'pendiente',
    $or: [{ patientId: user._id }, { psychologistId: user._id }],
  });
  for (const appointment of pending) {
    const cancelled = await Appointment.findOneAndUpdate({ _id: appointment._id, state: 'pendiente' }, { state: 'cancelada' });
    if (!cancelled) continue; // ya la había cancelado alguien entre medias

    const wasPatient = appointment.patientId.toString() === String(user._id);
    if (wasPatient) {
      await updateAvailabilitySchedule(appointment.scheduleId.toString(), true);
    }
    await notifyCancellation(wasPatient ? appointment.psychologistId : appointment.patientId, appointment.time);
  }

  // 3. Franjas de un psicólogo
  if (user.role === 'psicologo') {
    const schedules = await Schedule.find({ psychologist: user._id }).select('_id');
    for (const { _id } of schedules) {
      if (await Appointment.exists({ scheduleId: _id })) {
        await Schedule.updateOne({ _id }, { isAvailable: false }); // se conserva por el historial
      } else {
        await Schedule.deleteOne({ _id });
      }
    }
  }

  return user;
};

export const listUsersService = async (): Promise<IUser[]> => {
  return User.find(NOT_DELETED).select('-password');
};
