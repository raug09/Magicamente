import { Schema, model, Document, Types } from 'mongoose';
import { getAppTimezone } from '../config/env';
import { isValidTimeZone } from '../utils/timezone';
import {
  DocumentReview,
  VerificationStatus,
  DOCUMENT_REVIEW_STATUSES,
  PSYCHOLOGIST_DOCUMENT_KEYS,
  VERIFICATION_STATUSES,
} from '../utils/verification';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'paciente' | 'psicologo' | 'administrador';
  isActive?: boolean;
  studies?: string[];
  description?: string;
  createdAt: Date;
  schedules?: Types.ObjectId[];
  /** SHA-256 del token de recuperación enviado por correo (nunca el token en claro). */
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
  /** Los tokens de sesión emitidos antes de esta fecha dejan de valer. */
  passwordChangedAt?: Date;
  /** Fecha en que se eliminó la cuenta. Los datos personales se anonimizan, pero el registro se conserva. */
  deletedAt?: Date;
  /** Zona horaria IANA del usuario (p. ej. "America/Bogota"). */
  timezone?: string;
  /** false hasta que el usuario confirma su email. Las cuentas anteriores a esta función se migran a true. */
  emailVerified?: boolean;
  emailVerificationTokenHash?: string;
  emailVerificationExpires?: Date;
  emailVerificationSentAt?: Date;
  /** Los psicólogos empiezan sin aprobar: un administrador los aprueba. Los demás roles siempre están aprobados. */
  approved?: boolean;
  /** Cambio de email pendiente de confirmar (se aplica al confirmar el enlace enviado al nuevo email). */
  /** Estado de la verificación (solo psicólogos; los demás roles quedan 'aprobado'). */
  verificationStatus?: VerificationStatus;
  /** Mensaje del equipo cuando se rechaza la solicitud. */
  verificationMessage?: string;
  verificationDocuments?: DocumentReview[];
  verificationUpdatedAt?: Date;
  pendingEmail?: string;
  emailChangeTokenHash?: string;
  emailChangeExpires?: Date;
  emailChangeSentAt?: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['paciente', 'psicologo', 'administrador'], default: 'paciente' },
  isActive: { type: Boolean, default: true },
  studies: { type: [String], default: [] },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  schedules: [{ type: Schema.Types.ObjectId, ref: 'Schedule' }],
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  passwordChangedAt: { type: Date, select: false },
  deletedAt: { type: Date },
  timezone: {
    type: String,
    default: () => getAppTimezone(),
    validate: { validator: isValidTimeZone, message: 'Zona horaria no válida' },
  },
  emailVerified: { type: Boolean, default: false },
  emailVerificationTokenHash: { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },
  emailVerificationSentAt: { type: Date, select: false },
  verificationStatus: {
    type: String,
    enum: VERIFICATION_STATUSES,
    default: function (this: { role?: string }) {
      return this.role === 'psicologo' ? 'pendiente' : 'aprobado';
    },
  },
  verificationMessage: { type: String },
  verificationDocuments: [
    {
      _id: false,
      key: { type: String, enum: PSYCHOLOGIST_DOCUMENT_KEYS, required: true },
      status: { type: String, enum: DOCUMENT_REVIEW_STATUSES, default: 'pendiente' },
      note: { type: String, default: '' },
      file: {
        storageKey: { type: String },
        contentType: { type: String },
        size: { type: Number },
        uploadedAt: { type: Date },
      },
    },
  ],
  /** Última vez que cambió el estado de verificación (cuenta los 30 días de retención de rechazados). */
  verificationUpdatedAt: { type: Date },
  pendingEmail: { type: String, select: false },
  emailChangeTokenHash: { type: String, select: false },
  emailChangeExpires: { type: Date, select: false },
  emailChangeSentAt: { type: Date, select: false },
  approved: {
    type: Boolean,
    default: function (this: { role?: string }) {
      return this.role !== 'psicologo';
    },
  },
});

// Al convertir a JSON se oculta la clave interna del archivo: el cliente solo ve el tipo, el tamaño y la fecha.
UserSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    if (Array.isArray(ret.verificationDocuments)) {
      ret.verificationDocuments = ret.verificationDocuments.map((document: Record<string, unknown>) => {
        const file = document.file as { storageKey?: string; contentType?: string; size?: number; uploadedAt?: Date } | undefined;
        const { file: _internal, ...rest } = document;
        void _internal;
        return file?.storageKey ? { ...rest, file: { contentType: file.contentType, size: file.size, uploadedAt: file.uploadedAt } } : rest;
      });
    }
    return ret;
  },
});

// Listado de psicólogos: rol + aprobación + activo.
UserSchema.index({ role: 1, approved: 1, isActive: 1 });

export default model<IUser>('User', UserSchema);
