import { Schema, model, Document, Types } from 'mongoose';
import { getAppTimezone } from '../config/env';
import { isValidTimeZone } from '../utils/timezone';

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
  /** Zona horaria IANA del usuario (p. ej. "America/Bogota"): define cómo se ven y se crean sus horas. */
  timezone?: string;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
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
  timezone: { type: String, default: () => getAppTimezone(), validate: { validator: isValidTimeZone, message: 'Zona horaria no válida' } },
});

export default model<IUser>('User', UserSchema);
